# Run this from the repository root.
if (-not (Test-Path .venv)) { py -m venv .venv }
& .\.venv\Scripts\Activate.ps1
python -m pip install --requirement requirements.txt
python backend\server.py
