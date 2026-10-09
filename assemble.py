# Kept for muscle memory. The build now lives in scripts/inline-html.mjs (same output, byte for byte).
# Sources moved to src/legacy/; the HTML/CSS shell is src/legacy/shell.html.
import subprocess, sys
from pathlib import Path
sys.exit(subprocess.call(['node', str(Path(__file__).parent / 'scripts/inline-html.mjs'), '--legacy']))
