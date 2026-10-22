"""Optional local OmniVoice service. Run one worker; models load on first speech."""

import argparse
import base64
import binascii
import gc
import io
import json
import logging
import os
import secrets
import threading
from pathlib import Path
from typing import Literal

from fastapi import Depends, FastAPI, Header, HTTPException, Request, Response
from pydantic import BaseModel, ConfigDict, Field, field_validator

ROOT = Path(__file__).resolve().parents[2]
os.environ.setdefault("HF_HOME", str(ROOT / "data" / "omnivoice" / "huggingface"))
MODEL_ID = os.getenv("OMNIVOICE_MODEL", "k2-fsa/OmniVoice")
API_KEY = os.getenv("OMNIVOICE_API_KEY", "")
VOICES_PATH = Path(os.getenv("OMNIVOICE_VOICES_FILE", str(Path(__file__).with_name("voices.json"))))
VOICES = json.loads(VOICES_PATH.read_text(encoding="utf-8"))
if not VOICES or len({v["id"] for v in VOICES}) != len(VOICES):
    raise ValueError("Voice IDs must be unique and the catalog must not be empty")
if not any(v["id"] == "default" for v in VOICES):
    raise ValueError("The voice catalog must include a default voice")
for voice in VOICES:
    if voice.get("ref_audio"):
        audio_path = (VOICES_PATH.parent / voice["ref_audio"]).resolve()
        if not audio_path.is_file() or not voice.get("ref_text", "").strip():
            raise ValueError("Cloned voices require a local ref_audio file and its ref_text")
        voice["ref_audio"] = str(audio_path)

app = FastAPI(title="YUMEI OmniVoice", docs_url=None, redoc_url=None)
lock = threading.Lock()
model = None
idle_timer = None
logger = logging.getLogger("omnivoice-service")


def authorize(authorization: str | None = Header(default=None)):
    if API_KEY and not secrets.compare_digest(authorization or "", f"Bearer {API_KEY}"):
        raise HTTPException(401, "Invalid service key")


class SpeechRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    model: Literal["omnivoice"] = "omnivoice"
    input: str = Field(min_length=1, max_length=5000)
    voice: str = Field(default="default", max_length=200)
    response_format: Literal["wav"] = "wav"
    speed: float = Field(default=1.0, ge=0.5, le=1.5)
    reference: "VoiceReference | None" = None

    @field_validator("input")
    @classmethod
    def nonempty(cls, value):
        if not value.strip():
            raise ValueError("Speech text cannot be blank")
        return value.strip()


class AudioReference(BaseModel):
    model_config = ConfigDict(extra="forbid")
    audio: str = Field(min_length=1, max_length=6990508)


class VoiceReference(AudioReference):
    text: str = Field(min_length=1, max_length=2000)

    @field_validator("text")
    @classmethod
    def nonempty(cls, value):
        if not value.strip():
            raise ValueError("Reference text cannot be blank")
        return value.strip()


SpeechRequest.model_rebuild()


def decode_reference(encoded: str):
    """Decode bounded audio bytes only; never accept paths, URLs or serialized tensors."""
    import numpy as np
    import soundfile as sf
    from scipy.signal import resample_poly
    from math import gcd

    try:
        raw = base64.b64decode(encoded, validate=True)
        if not raw or len(raw) > 5 * 1024 * 1024:
            raise ValueError("Reference size")
        info = sf.info(io.BytesIO(raw))
        if (info.format not in ("WAV", "WAVEX", "MP3", "FLAC", "OGG")
                or not 8000 <= info.samplerate <= 192000 or info.channels not in (1, 2)
                or not 3 <= info.duration <= 30):
            raise ValueError("Reference format or duration")
        samples, rate = sf.read(io.BytesIO(raw), dtype="float32", always_2d=True)
        if len(samples) != info.frames or not np.isfinite(samples).all():
            raise ValueError("Invalid samples")
        samples = samples.mean(axis=1)
        if np.max(np.abs(samples)) < 0.001:
            raise ValueError("Silent reference")
        if rate != 24000:
            factor = gcd(rate, 24000)
            samples = resample_poly(samples, 24000 // factor, rate // factor)
        return samples, 24000
    except (ValueError, binascii.Error, RuntimeError, sf.LibsndfileError):
        raise HTTPException(400, "Invalid reference audio; use 3-30 seconds of clear speech, up to 5 MB") from None


@app.post("/v1/audio/references", dependencies=[Depends(authorize)])
def normalize_reference(body: AudioReference):
    import soundfile as sf
    samples, rate = decode_reference(body.audio)
    output = io.BytesIO()
    sf.write(output, samples, rate, format="WAV", subtype="PCM_16")
    return {"audio": base64.b64encode(output.getvalue()).decode("ascii"), "durationMs": round(len(samples) / rate * 1000)}


def get_model():
    global model
    if model is None:
        import torch
        from omnivoice import OmniVoice

        device = os.getenv("OMNIVOICE_DEVICE", "auto")
        if device == "auto":
            # Share GPUs with ComfyUI without evicting another application's models.
            device = "cuda:0" if torch.cuda.is_available() and torch.cuda.mem_get_info()[0] >= 4 * 1024**3 else "cpu"
        if device == "cpu":
            torch.set_num_threads(max(1, int(os.getenv("OMNIVOICE_CPU_THREADS", "8"))))
        logger.warning("Loading %s on %s", MODEL_ID, device)
        model = OmniVoice.from_pretrained(
            MODEL_ID, device_map=device,
            dtype=torch.float16 if device.startswith("cuda") else torch.float32,
            load_asr=False,
        ).eval()
    return model


def unload_idle_model():
    global model
    with lock:
        model = None
        gc.collect()
        import torch
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        logger.info("Released idle model")


def schedule_unload():
    global idle_timer
    seconds = int(os.getenv("OMNIVOICE_IDLE_SECONDS", "120"))
    if seconds > 0:
        idle_timer = threading.Timer(seconds, unload_idle_model)
        idle_timer.daemon = True
        idle_timer.start()


@app.get("/health", dependencies=[Depends(authorize)])
def health():
    return {"status": "ok", "loaded": model is not None, "model": MODEL_ID}


@app.get("/v1/audio/voices", dependencies=[Depends(authorize)])
def voices():
    # Do not expose local paths, reference transcripts, or other operator settings.
    return {"voices": [{"id": v["id"], "name": v["name"]} for v in VOICES]}


def synthesize(body: SpeechRequest):
    voice = next((v for v in VOICES if v["id"] == body.voice), None)
    if voice is None:
        raise HTTPException(400, "Unknown voice")
    reference = decode_reference(body.reference.audio) if body.reference else None
    if not lock.acquire(blocking=False):
        raise HTTPException(429, "OmniVoice is busy; retry after the current request", headers={"Retry-After": "5"})
    try:
        if idle_timer:
            idle_timer.cancel()
        import soundfile as sf
        import torch

        current = get_model()
        torch.manual_seed(voice.get("seed", 42))
        options = {"instruct": voice.get("instruct")}
        if reference is not None:
            samples, rate = reference
            options = {"ref_audio": (torch.from_numpy(samples).unsqueeze(0), rate), "ref_text": body.reference.text}
        elif voice.get("ref_audio"):
            options.update(ref_audio=voice["ref_audio"], ref_text=voice["ref_text"])
        with torch.inference_mode():
            audio = current.generate(
                text=body.input, speed=body.speed,
                num_step=int(os.getenv("OMNIVOICE_STEPS", "32")), **options,
            )
        output = io.BytesIO()
        sf.write(output, audio[0], current.sampling_rate, format="WAV", subtype="PCM_16")
        return Response(output.getvalue(), media_type="audio/wav", headers={"Cache-Control": "no-store"})
    except HTTPException:
        raise
    except Exception:
        logger.exception("Speech synthesis failed")
        raise HTTPException(503, "OmniVoice synthesis failed; check service logs") from None
    finally:
        schedule_unload()
        lock.release()


@app.post("/v1/audio/speech", dependencies=[Depends(authorize)])
async def speech(body: SpeechRequest, request: Request):
    from starlette.concurrency import run_in_threadpool
    if await request.is_disconnected():
        raise HTTPException(499, "Request cancelled")
    return await run_in_threadpool(synthesize, body)


if __name__ == "__main__":
    import uvicorn
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", default=8002, type=int)
    args = parser.parse_args()
    if args.host not in ("127.0.0.1", "localhost", "::1") and not API_KEY:
        parser.error("Set OMNIVOICE_API_KEY before binding outside localhost")
    uvicorn.run(app, host=args.host, port=args.port, workers=1)
