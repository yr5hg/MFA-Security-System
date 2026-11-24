"""Command-line tests for the pretrained model; no web server required."""

import argparse
import json
import sys
from importlib.metadata import version
from time import perf_counter

from speaker_verification import DEFAULT_THRESHOLD, MODEL_ID, MODEL_REVISION, SpeakerVerifier


def main() -> int:
    parser = argparse.ArgumentParser(description="Local speaker verification tests")
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("load", help="Download and initialize the model")
    compare = commands.add_parser("compare", help="Compare reference with one or more attempts")
    compare.add_argument("reference")
    compare.add_argument("attempts", nargs="+")
    compare.add_argument("--threshold", type=float, default=DEFAULT_THRESHOLD)
    args = parser.parse_args()

    try:
        print(f"Model: {MODEL_ID}")
        print(f"Revision: {MODEL_REVISION}")
        print(f"Python: {sys.version.split()[0]}")
        for package in ("torch", "torchaudio", "speechbrain", "huggingface_hub", "soundfile"):
            print(f"{package}: {version(package)}")
        print("Device: CPU")
        print("Loading model...")
        start = perf_counter()
        verifier = SpeakerVerifier()
        print(f"Model loaded in {perf_counter() - start:.3f} seconds.")
        if args.command == "load":
            return 0

        print("Experimental threshold; not approved for authentication.")
        for index, attempt in enumerate(args.attempts, start=1):
            start = perf_counter()
            result = verifier.compare(args.reference, attempt, args.threshold)
            elapsed = perf_counter() - start
            print(json.dumps({"attempt_number": index, **result,
                              "elapsed_seconds": round(elapsed, 4)}, indent=2))
        return 0
    except Exception as exc:
        print(f"Local test failed: {type(exc).__name__}: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
