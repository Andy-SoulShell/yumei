"""Real local HTTP Range tests for resume and integrity, with no external downloads."""
import contextlib
import hashlib
import importlib.util
import io
import json
import re
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("download_omnivoice", Path(__file__).resolve().parents[2] / "scripts/download-omnivoice.py")
download = importlib.util.module_from_spec(spec)
spec.loader.exec_module(download)


class DownloadTests(unittest.TestCase):
    def run_download(self, corrupted=False, resume=False):
        payload = bytes(range(256)) * 8192 + b"tail"
        digest = "0" * 64 if corrupted else hashlib.sha256(payload).hexdigest()
        ranges = []

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass

            def do_GET(self):
                if "/api/models/" in self.path:
                    data = json.dumps([{"type": "file", "path": "weights.bin", "size": len(payload), "oid": "unused", "lfs": {"oid": digest}}]).encode()
                    self.send_response(200)
                    self.send_header("Content-Length", str(len(data)))
                    self.end_headers()
                    self.wfile.write(data)
                    return
                value = self.headers["Range"]
                ranges.append(value)
                start, end = map(int, re.fullmatch(r"bytes=(\d+)-(\d+)", value).groups())
                self.send_response(206)
                self.send_header("Content-Range", f"bytes {start}-{end}/{len(payload)}")
                self.send_header("Content-Length", str(end - start + 1))
                self.end_headers()
                self.wfile.write(payload[start:end + 1])

        with tempfile.TemporaryDirectory() as directory, ThreadingHTTPServer(("127.0.0.1", 0), Handler) as server:
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            output = Path(directory)
            if resume:
                parts = output / ".parts" / ("weights.bin." + digest[:12])
                parts.mkdir(parents=True)
                (parts / "0").write_bytes(payload[:333])
            args = ["download-omnivoice.py", "--endpoint", f"http://127.0.0.1:{server.server_port}", "--output", directory, "--workers", "4", "--chunk-mib", "1", "--direct"]
            try:
                with patch("sys.argv", args), contextlib.redirect_stdout(io.StringIO()):
                    if corrupted:
                        with self.assertRaisesRegex(RuntimeError, "Integrity check failed"):
                            download.main()
                        self.assertFalse((output / "weights.bin").exists())
                    else:
                        download.main()
                        self.assertEqual((output / "weights.bin").read_bytes(), payload)
                        self.assertTrue((output / "download-manifest.json").exists())
            finally:
                server.shutdown()
                thread.join()
        return ranges

    def test_resumes_partial_ranges_and_reconstructs_exact_file(self):
        ranges = self.run_download(resume=True)
        self.assertIn("bytes=333-1048575", ranges)
        self.assertTrue(any(value.startswith("bytes=1048576-") for value in ranges))
        self.assertTrue(any(value.startswith("bytes=2097152-") for value in ranges))

    def test_does_not_publish_corrupt_model(self):
        self.run_download(corrupted=True)


if __name__ == "__main__":
    unittest.main()
