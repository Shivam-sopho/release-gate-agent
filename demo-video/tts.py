"""Regenerates narration/<id>.wav from narration/lines.txt with Kokoro (local neural TTS).
Run with the Kokoro venv's Python: ~/.cache/rga-tts/.venv/bin/python tts.py [voice]"""
import sys
from pathlib import Path

import numpy as np
import soundfile as sf
from kokoro import KPipeline

voice = sys.argv[1] if len(sys.argv) > 1 else "af_heart"
here = Path(__file__).resolve().parent / "narration"
pipe = KPipeline(lang_code="a", repo_id="hexgrad/Kokoro-82M")
for line in (here / "lines.txt").read_text().splitlines():
    if not line.strip():
        continue
    ident, text = line.split("|", 1)
    audio = np.concatenate([a for _, _, a in pipe(text, voice=voice, speed=1.0)])
    sf.write(here / f"{ident}.wav", audio, 24000)
    print(f"{ident} {len(audio) / 24000:.1f}s")
