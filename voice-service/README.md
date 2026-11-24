# Voice Verification Service

## Overview

This service is responsible for audio validation, conversion,
preprocessing, and speaker verification using the pretrained
SpeechBrain ECAPA-TDNN model.

## Development Environment

- Operating System: Windows 64-bit
- Python: 3.11.9
- PyTorch: 2.10.0 CPU
- TorchAudio: 2.10.0 CPU
- SpeechBrain: 1.1.2
- FFmpeg: 9.1
- Model execution: CPU

## Setup Instructions

Run the following commands from the repository root
using Windows PowerShell.

### Create and activate the virtual environment

```powershell
py -3.11 -m venv voice-service/.venv
.\voice-service\.venv\Scripts\Activate.ps1
```

### Install dependencies

Install the CPU versions of PyTorch and TorchAudio first.

```powershell
python -m pip install --upgrade pip
python -m pip install torch==2.10.0 torchaudio==2.10.0 --index-url https://download.pytorch.org/whl/cpu
python -m pip install -r voice-service/requirements.txt
```

### Install FFmpeg

```powershell
winget install --id Gyan.FFmpeg --exact --source winget
```

Restart the terminal after installation and reactivate
the virtual environment.

### Verify the environment

```powershell
python --version
python -m pip check
ffmpeg -version
ffprobe -version
```

## Pretrained Model

The selected model is:

`speechbrain/spkrec-ecapa-voxceleb`

The model will be used for speaker verification without
training a neural network from scratch.

## Security and Privacy

- Voice recordings and embeddings must not be committed to GitHub.
- Downloaded model weights and virtual environments must remain local.
- Voice verification is an academic experiment and does not
  guarantee protection against replay attacks or synthetic voices.

## Implementation Status

- [x] Python environment setup
- [x] AI dependency installation
- [x] API dependency installation
- [x] FFmpeg installation
- [ ] Pretrained model initialization
- [ ] Speaker comparison
- [ ] Audio validation and preprocessing
- [ ] Internal Voice API
- [ ] Threshold evaluation
- [ ] Testing and integration
