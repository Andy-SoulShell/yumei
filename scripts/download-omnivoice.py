"""Resumable, verified OmniVoice download, including direct hf-mirror connections."""
import argparse
import concurrent.futures
import hashlib
import json
import os
import shutil
import ssl
import threading
import time
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
REPO = "k2-fsa/OmniVoice"
# Published SHA256 values of the upstream weights; mirrors must deliver the same bytes.
WEIGHTS = {
    "model.safetensors": "730839316de585f4c8298ec0e1712efc10fb19c6fa4e36eb741cb8d51ebcf6aa",
    "audio_tokenizer/model.safetensors": "fe7c5e8785e0a05833e1bfc3e002ec7f55af21e306b2e7154a448c1f54ccfb0d",
}


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(8 * 1024**2), b""):
            digest.update(block)
    return digest.hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--endpoint", default="https://hf-mirror.com")
    parser.add_argument("--output", type=Path, default=ROOT / "data/omnivoice/model")
    parser.add_argument("--workers", type=int, default=16, choices=range(1, 129))
    parser.add_argument("--chunk-mib", type=int, default=4, choices=range(1, 33))
    parser.add_argument("--direct", action="store_true", help="Ignore proxy environment for metadata and redirects too")
    args = parser.parse_args()
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    chunk_size = args.chunk_mib * 1024**2
    client = httpx.Client(
        verify=ssl.create_default_context(), trust_env=not args.direct,
        follow_redirects=True, timeout=httpx.Timeout(30, read=30),
        limits=httpx.Limits(max_connections=args.workers, max_keepalive_connections=args.workers),
    )
    print(f"Metadata: {args.endpoint}, direct={args.direct}", flush=True)
    response = client.get(f"{args.endpoint.rstrip('/')}/api/models/{REPO}/tree/main", params={"recursive": "true"})
    response.raise_for_status()
    files = [item for item in response.json() if item["type"] == "file"]
    jobs = []
    pending_files = []
    progress = {}
    progress_lock = threading.Lock()
    for item in files:
        name, size = item["path"], item["size"]
        target = (output / name).resolve()
        if not target.is_relative_to(output):
            raise ValueError("Unsafe repository path")
        target.parent.mkdir(parents=True, exist_ok=True)
        digest = (item.get("lfs") or {}).get("oid")
        if name in WEIGHTS and digest != WEIGHTS[name]:
            raise ValueError(f"Upstream weight revision changed: {name}")
        if target.is_file() and target.stat().st_size == size and (not digest or sha256(target) == digest):
            print(f"Verified existing: {name}", flush=True)
            continue
        parts = output / ".parts" / (name.replace("/", "_") + "." + (digest or item["oid"])[:12])
        parts.mkdir(parents=True, exist_ok=True)
        # Preserve completed bytes from the earlier Hugging Face sequential download.
        cached = ROOT / "data/omnivoice/huggingface/hub/models--k2-fsa--OmniVoice/blobs" / f"{digest}.incomplete"
        if digest and cached.is_file():
            with cached.open("rb") as source:
                for index in range((min(cached.stat().st_size, size) + chunk_size - 1) // chunk_size):
                    data = source.read(chunk_size)
                    part = parts / str(index)
                    if data and (not part.exists() or part.stat().st_size < len(data)):
                        part.write_bytes(data)
        pending_files.append((target, parts, size, digest))
        for index, start in enumerate(range(0, size, chunk_size)):
            end = min(start + chunk_size, size) - 1
            part = parts / str(index)
            existing = part.stat().st_size if part.exists() else 0
            if existing > end - start + 1:
                raise ValueError(f"Invalid cached part: {name}:{index}")
            progress[str(part)] = existing
            jobs.append((name, size, start, end, part))

    def transfer(job):
        name, size, start, end, part = job
        for attempt in range(5):
            existing = part.stat().st_size if part.exists() else 0
            if existing == end - start + 1:
                return
            try:
                url = f"{args.endpoint.rstrip('/')}/{REPO}/resolve/main/{name}"
                with client.stream("GET", url, headers={"Range": f"bytes={start + existing}-{end}"}) as result:
                    expected = f"bytes {start + existing}-{end}/{size}"
                    if result.status_code != 206 or result.headers.get("content-range") != expected:
                        # Small Git files may be returned whole without Range support.
                        if not (start == 0 and existing == 0 and end == size - 1 and result.status_code == 200):
                            raise RuntimeError(f"Unexpected range response ({result.status_code})")
                    with part.open("ab") as destination:
                        for block in result.iter_bytes(chunk_size=65536):
                            if destination.tell() + len(block) > end - start + 1:
                                raise RuntimeError("Range response exceeds its size")
                            destination.write(block)
                            with progress_lock:
                                progress[str(part)] = destination.tell()
                if part.stat().st_size != end - start + 1:
                    raise RuntimeError("Incomplete response")
                return
            except Exception as error:
                if attempt == 4:
                    raise RuntimeError(f"Failed {name}, part {part.name}: {type(error).__name__}") from None
                time.sleep(min(2**attempt, 8))

    total = sum(end - start + 1 for _, _, start, end, _ in jobs)
    initial = sum(progress.values())
    started = time.monotonic()
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as executor:
        remaining = {executor.submit(transfer, job) for job in jobs}
        while remaining:
            finished, remaining = concurrent.futures.wait(remaining, timeout=10, return_when=concurrent.futures.FIRST_EXCEPTION)
            for future in finished:
                future.result()
            with progress_lock:
                count = sum(progress.values())
            rate = (count - initial) / max(time.monotonic() - started, 0.01) / 1024**2
            print(f"{count / 1024**2:.1f}/{total / 1024**2:.1f} MiB ({count / max(total, 1):.1%}), {rate:.2f} MiB/s", flush=True)
    for target, parts, size, digest in pending_files:
        temporary = target.with_name(target.name + ".assembling")
        with temporary.open("wb") as destination:
            for index in range((size + chunk_size - 1) // chunk_size):
                with (parts / str(index)).open("rb") as source:
                    shutil.copyfileobj(source, destination, 8 * 1024**2)
        if temporary.stat().st_size != size or (digest and sha256(temporary) != digest):
            raise RuntimeError(f"Integrity check failed: {target.name}")
        temporary.replace(target)
        print(f"Verified: {target.relative_to(output)}", flush=True)
    (output / "download-manifest.json").write_text(json.dumps({"repo": REPO, "endpoint": args.endpoint, "direct": args.direct, "files": files}, indent=2), encoding="utf-8")
    client.close()
    print(f"Model ready: {output}", flush=True)


if __name__ == "__main__":
    main()
