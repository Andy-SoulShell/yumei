"""Exercise the HTTP contract without downloading or loading model weights."""
import unittest
import base64
import io
from unittest.mock import patch

import numpy as np
from fastapi.testclient import TestClient
import serve
import soundfile as sf


class FakeModel:
    sampling_rate = 24000

    def generate(self, **kwargs):
        self.options = kwargs
        return [np.zeros(2400, dtype=np.float32)]


class ServiceTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(serve.app)
        self.key = patch.object(serve, "API_KEY", "test-secret")
        self.key.start()
        self.addCleanup(self.key.stop)
        self.headers = {"Authorization": "Bearer test-secret"}

    def request(self, **kwargs):
        return self.client.post("/v1/audio/speech", headers=self.headers, json={"input": "你好", **kwargs})

    def test_authentication_and_public_catalog(self):
        self.assertEqual(self.client.get("/v1/audio/voices").status_code, 401)
        result = self.client.get("/v1/audio/voices", headers=self.headers)
        self.assertEqual(result.status_code, 200)
        self.assertEqual(set(result.json()["voices"][0]), {"id", "name"})

    def test_health_does_not_load_model(self):
        with patch.object(serve, "get_model") as loader:
            self.assertEqual(self.client.get("/health", headers=self.headers).status_code, 200)
            loader.assert_not_called()

    def test_input_bounds_and_no_user_paths(self):
        for fields in [{"input": " "}, {"input": "a" * 5001}, {"speed": 5}, {"response_format": "mp3"}, {"ref_audio": "/private/file.wav"}]:
            self.assertEqual(self.request(**fields).status_code, 422)
        self.assertEqual(self.request(voice="missing").status_code, 400)

    def test_busy_does_not_queue_or_load(self):
        with serve.lock:
            with patch.object(serve, "get_model") as loader:
                result = self.request()
                self.assertEqual(result.status_code, 429)
                self.assertEqual(result.headers["retry-after"], "5")
                loader.assert_not_called()

    def test_wave_generation_and_lock_release(self):
        fake = FakeModel()
        with patch.object(serve, "get_model", return_value=fake), patch.object(serve, "schedule_unload"):
            result = self.request()
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.headers["content-type"], "audio/wav")
        self.assertEqual(result.content[:4], b"RIFF")
        self.assertEqual(result.content[8:12], b"WAVE")
        self.assertFalse(serve.lock.locked())
        self.assertEqual(fake.options["text"], "你好")

    def test_failure_is_sanitized_and_releases_lock(self):
        with patch.object(serve, "get_model", side_effect=RuntimeError("private/path token")), patch.object(serve, "schedule_unload"):
            result = self.request()
        self.assertEqual(result.status_code, 503)
        self.assertNotIn("private", result.text)
        self.assertFalse(serve.lock.locked())

    def reference(self, seconds=4, rate=44100, format="WAV"):
        audio = np.sin(np.arange(round(seconds * rate)) * 2 * np.pi * 220 / rate).astype(np.float32) * 0.1
        output = io.BytesIO()
        sf.write(output, audio, rate, format=format)
        return base64.b64encode(output.getvalue()).decode("ascii")

    def test_reference_upload_validation_and_normalization(self):
        self.assertEqual(self.client.post("/v1/audio/references", json={"audio": "x"}).status_code, 401)
        for format in ("WAV", "FLAC", "OGG", "MP3"):
            result = self.client.post("/v1/audio/references", headers=self.headers, json={"audio": self.reference(format=format)})
            self.assertEqual(result.status_code, 200, result.text[:200])
            info = sf.info(io.BytesIO(base64.b64decode(result.json()["audio"])))
            self.assertEqual((info.samplerate, info.channels), (24000, 1))
            self.assertAlmostEqual(result.json()["durationMs"], 4000, delta=100)
        for audio in ("not base64!", base64.b64encode(b"not an audio file").decode(), self.reference(seconds=2), self.reference(seconds=31)):
            result = self.client.post("/v1/audio/references", headers=self.headers, json={"audio": audio})
            self.assertEqual(result.status_code, 400)

    def test_uploaded_reference_reaches_model_as_audio_not_a_path(self):
        fake = FakeModel()
        with patch.object(serve, "get_model", return_value=fake), patch.object(serve, "schedule_unload"):
            result = self.request(reference={"audio": self.reference(), "text": "参考录音原文。"})
        self.assertEqual(result.status_code, 200)
        self.assertEqual(fake.options["ref_text"], "参考录音原文。")
        self.assertEqual(fake.options["ref_audio"][1], 24000)
        self.assertEqual(tuple(fake.options["ref_audio"][0].shape), (1, 96000))
        self.assertNotIn("instruct", fake.options)
        self.assertEqual(self.request(reference={"audio": self.reference(), "text": " "}).status_code, 422)
        self.assertEqual(self.request(reference={"audio": "https://example.com/voice.wav", "text": "原文"}).status_code, 400)


if __name__ == "__main__":
    unittest.main()
