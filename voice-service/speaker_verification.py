"""Reusable CPU speaker verification for standardized local WAV files."""

import math
import os
from pathlib import Path

import soundfile as sf
import torch
from speechbrain.inference.speaker import SpeakerRecognition
from speechbrain.utils.fetching import FetchConfig, LocalStrategy

MODEL_ID = "speechbrain/spkrec-ecapa-voxceleb"
MODEL_REVISION = "0f99f2d0ebe89ac095bcc5903c4dd8f72b367286"
SAMPLE_RATE = 16000
MIN_SECONDS = 3
MAX_SECONDS = 10
MAX_BYTES = 10 * 1024 * 1024
# SpeechBrain's default: provisional, not calibrated for our system.
DEFAULT_THRESHOLD = 0.25


def load_wav(path: str | Path) -> torch.Tensor:
    """Read a local, already normalized WAV as a (1, time) tensor."""
    path = Path(path)
    if not path.is_file():
        raise ValueError("Audio file does not exist.")
    if path.stat().st_size > MAX_BYTES:
        raise ValueError("Audio file exceeds 10 MiB.")

    with sf.SoundFile(str(path)) as audio:
        if (audio.format != "WAV" or audio.subtype != "PCM_16"
                or audio.samplerate != SAMPLE_RATE or audio.channels != 1):
            raise ValueError("Expected 16-kHz mono 16-bit PCM WAV audio.")
        if not MIN_SECONDS * SAMPLE_RATE <= audio.frames <= MAX_SECONDS * SAMPLE_RATE:
            raise ValueError("Audio must be between 3 and 10 seconds.")
        samples = audio.read(dtype="float32", always_2d=True)
        if len(samples) != audio.frames:
            raise ValueError("Incomplete audio recording.")

    waveform = torch.from_numpy(samples[:, 0].copy()).unsqueeze(0)
    if not torch.isfinite(waveform).all().item():
        raise ValueError("Audio contains invalid sample values.")
    if not torch.any(waveform != 0).item():
        raise ValueError("Audio is completely silent.")
    return waveform


class SpeakerVerifier:
    def __init__(self) -> None:
        # Keep downloaded weights outside the repository and OneDrive.
        base = Path(os.environ.get("LOCALAPPDATA") or Path.home() / ".cache")
        self.model_dir = (base / "VoiceVerificationSecuritySystem" / "models"
                          / MODEL_REVISION)
        self.model_dir.mkdir(parents=True, exist_ok=True)
        self.model = SpeakerRecognition.from_hparams(
            source=MODEL_ID,
            savedir=str(self.model_dir),
            run_opts={"device": "cpu"},
            local_strategy=LocalStrategy.COPY,
            fetch_config=FetchConfig(revision=MODEL_REVISION),
        )
        self.model.eval()

    def compare(self, reference_audio: str | Path, attempt_audio: str | Path,
                threshold: float = DEFAULT_THRESHOLD) -> dict:
        if not math.isfinite(threshold) or not -1 <= threshold <= 1:
            raise ValueError("Threshold must be finite and between -1 and 1.")
        reference = load_wav(reference_audio)
        attempt = load_wav(attempt_audio)
        with torch.inference_mode():
            score, prediction = self.model.verify_batch(
                reference, attempt, threshold=threshold
            )
        value = float(score.item())
        if not math.isfinite(value):
            raise RuntimeError("Model returned a non-finite similarity score.")
        return {
            "matched": bool(prediction.item()),
            "score": value,
            "threshold": threshold,
            "model": MODEL_ID,
        }
