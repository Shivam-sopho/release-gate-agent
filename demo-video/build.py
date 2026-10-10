#!/usr/bin/env python3
"""Assembles out/release-gate-agent-demo.mp4 from the rendered slides, the recorded
live run (out/panel.webm + out/emulator_0.mp4, timed by out/timeline.json) and the
narration clips. Requires ffmpeg."""

import json
import subprocess
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT = HERE / "out"
SEG = OUT / "segments"
SEG.mkdir(parents=True, exist_ok=True)
BG = "0x0b0d12"
FPS = 30
# The panel is recorded at 1920x1080 and fills the frame. While the agent works, the
# emulator is shown picture-in-picture over the panel's left sidebar (idle during a run).
PIP_X, PIP_Y, PIP_H = 40, 132, 930
CFO_SPEED = float(__import__("os").environ.get("CFO_SPEED", "1.0"))  # speed-up for the cfo.ai recording


def run(args):
    subprocess.run(["ffmpeg", "-v", "error", "-y", *args], check=True)


def duration(path):
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
        capture_output=True, text=True, check=True,
    )
    return float(out.stdout.strip())


def audio_filter(seg_len, lead=0.4):
    # Narration starts after a short lead-in and is padded with silence to the segment length.
    ms = int(lead * 1000)
    return f"[1:a]adelay={ms}|{ms},apad,atrim=0:{seg_len:.3f},afade=t=out:st={seg_len - 0.3:.3f}:d=0.3[a]"


def slide_segment(name, slide, narration, tail=1.0):
    seg_len = duration(narration) + 0.4 + tail
    out = SEG / f"{name}.mp4"
    run([
        "-loop", "1", "-framerate", str(FPS), "-t", f"{seg_len:.3f}", "-i", str(slide),
        "-i", str(narration),
        "-filter_complex",
        f"[0:v]format=yuv420p,fade=t=in:st=0:d=0.35,fade=t=out:st={seg_len - 0.35:.3f}:d=0.35[v];" + audio_filter(seg_len),
        "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-preset", "medium", "-crf", "18",
        "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2", "-r", str(FPS), str(out),
    ])
    return out


def live_segment(name, start, end, speed, label, narration, emu_offset, show_emulator=True):
    """Panel (left) and emulator (right) for panel-time [start, end], sped up by `speed`."""
    src_len = end - start
    vid_len = src_len / speed
    nar_len = duration(narration) + 0.6 if narration else 0
    seg_len = max(vid_len, nar_len)
    hold = seg_len - vid_len  # freeze the last frame if the narration runs longer
    out = SEG / f"{name}.mp4"
    pip_w = round(540 * PIP_H / 1200)
    emu_start = max(0.0, start - emu_offset)
    inputs = ["-ss", f"{start:.3f}", "-t", f"{src_len:.3f}", "-i", str(OUT / "panel.webm")]
    if show_emulator:
        inputs += ["-ss", f"{emu_start:.3f}", "-t", f"{src_len:.3f}", "-i", str(OUT / "emulator_0.mp4")]
    inputs += ["-i", str(HERE / "labels" / f"{label}.png")]
    label_idx = 2 if show_emulator else 1
    nar_idx = label_idx + 1
    if narration:
        inputs += ["-i", str(narration)]
    else:
        inputs += ["-f", "lavfi", "-t", f"{seg_len:.3f}", "-i", "anullsrc=r=48000:cl=stereo"]
    f = [
        f"color=c={BG}:s=1920x1080:r={FPS}:d={seg_len:.3f}[bg]",
        f"[0:v]setpts=(PTS-STARTPTS)/{speed},fps={FPS},scale=1920:1080,tpad=stop_mode=clone:stop_duration={hold + 0.1:.3f}[p]",
        f"[bg][p]overlay=0:0:shortest=1[v1]",
    ]
    last = "v1"
    if show_emulator:
        f += [
            f"[1:v]setpts=(PTS-STARTPTS)/{speed},fps={FPS},scale={pip_w}:{PIP_H},pad={pip_w + 8}:{PIP_H + 8}:4:4:color=0x7c6cff,tpad=stop_mode=clone:stop_duration={hold + 0.1:.3f}[e]",
            f"[{last}][e]overlay={PIP_X}:{PIP_Y}:shortest=1[v2]",
        ]
        last = "v2"
    f += [
        f"[{last}][{label_idx}:v]overlay=0:0[v3]",
        f"[v3]format=yuv420p,fade=t=in:st=0:d=0.3,fade=t=out:st={seg_len - 0.3:.3f}:d=0.3[v]",
    ]
    ms = 300
    f.append(
        f"[{nar_idx}:a]adelay={ms}|{ms},apad,atrim=0:{seg_len:.3f},afade=t=out:st={seg_len - 0.3:.3f}:d=0.3[a]"
    )
    run([*inputs, "-filter_complex", ";".join(f), "-map", "[v]", "-map", "[a]",
         "-t", f"{seg_len:.3f}", "-c:v", "libx264", "-preset", "medium", "-crf", "18",
         "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2", "-r", str(FPS), str(out)])
    return out


EVID = HERE.parent / "evidence"
SHOTS = OUT / "shots"


def make_shots():
    """Crops the real neatlogs / Entire screenshots (2000x1110) to their readable parts."""
    SHOTS.mkdir(parents=True, exist_ok=True)
    nl = EVID / "neatlogs"
    # v1 | v2 trace, same scenario: the input box, step count and first steps of each.
    run(["-i", str(nl / "13-v1-auth-benchmark-steps.png"), "-i", str(nl / "10-v2-auth-benchmark-steps.png"),
         "-filter_complex", "[0]crop=950:950:220:150[a];[1]crop=950:950:220:150[b];[a][b]hstack=2",
         str(SHOTS / "neatlogs_v1_v2.png")])
    # failure recovery: install/launch errors + retry, then tap error + recovery.
    run(["-i", str(nl / "02-failure-recovery-trace-top.png"), "-i", str(nl / "03-failure-recovery-tap-error-and-retry.png"),
         "-filter_complex", "[0]crop=1160:560:370:540[a];[1]crop=1160:420:370:150[b];[a][b]vstack=2",
         str(SHOTS / "neatlogs_recovery.png")])
    run(["-i", str(EVID / "entire" / "trail-1-reviewing.png"), "-vf", "crop=1640:1040:360:65", str(SHOTS / "entire_trail.png")])


def image_segment(name, image, narration, label, tail=1.2):
    """A real screenshot, fitted under a label bar, with a slow push-in."""
    seg_len = duration(narration) + 0.4 + tail
    out = SEG / f"{name}.mp4"
    frames = int(seg_len * FPS)
    f = [
        f"color=c={BG}:s=1920x1080:r={FPS}:d={seg_len:.3f}[bg]",
        # fit + pad to the stage first so zoompan keeps the aspect ratio; a single input
        # frame becomes `frames` output frames.
        f"[0:v]scale=1840:930:force_original_aspect_ratio=decrease,pad=1840:930:(ow-iw)/2:(oh-ih)/2:color={BG},"
        f"zoompan=z='1+0.035*on/{frames}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={frames}:s=1840x930:fps={FPS}[img]",
        f"[bg][img]overlay=40:125:shortest=1[v1]",
        f"[v1][2:v]overlay=0:0[v2]",
        f"[v2]format=yuv420p,fade=t=in:st=0:d=0.35,fade=t=out:st={seg_len - 0.35:.3f}:d=0.35[v]",
        f"[1:a]adelay=400|400,apad,atrim=0:{seg_len:.3f},afade=t=out:st={seg_len - 0.3:.3f}:d=0.3[a]",
    ]
    run(["-i", str(image),
         "-i", str(narration), "-i", str(HERE / "labels" / f"{label}.png"),
         "-filter_complex", ";".join(f), "-map", "[v]", "-map", "[a]", "-t", f"{seg_len:.3f}",
         "-c:v", "libx264", "-preset", "medium", "-crf", "18",
         "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2", "-r", str(FPS), str(out)])
    return out


def clip_segment(name, clip, narration, label, speed=1.0):
    """A screen recording fitted under a label bar; the last frame holds if narration runs longer."""
    src = duration(clip)
    vid_len = src / speed
    seg_len = max(vid_len, duration(narration) + 0.8)
    hold = seg_len - vid_len
    out = SEG / f"{name}.mp4"
    f = [
        f"color=c={BG}:s=1920x1080:r={FPS}:d={seg_len:.3f}[bg]",
        f"[0:v]setpts=(PTS-STARTPTS)/{speed},fps={FPS},scale=1840:950:force_original_aspect_ratio=decrease,"
        f"tpad=stop_mode=clone:stop_duration={hold + 0.1:.3f}[c]",
        "[bg][c]overlay=(W-w)/2:120:shortest=1[v1]",
        "[v1][2:v]overlay=0:0[v2]",
        f"[v2]format=yuv420p,fade=t=in:st=0:d=0.3,fade=t=out:st={seg_len - 0.3:.3f}:d=0.3[v]",
        f"[1:a]adelay=300|300,apad,atrim=0:{seg_len:.3f},afade=t=out:st={seg_len - 0.3:.3f}:d=0.3[a]",
    ]
    run(["-i", str(clip), "-i", str(narration), "-i", str(HERE / "labels" / f"{label}.png"),
         "-filter_complex", ";".join(f), "-map", "[v]", "-map", "[a]", "-t", f"{seg_len:.3f}",
         "-c:v", "libx264", "-preset", "medium", "-crf", "18",
         "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2", "-r", str(FPS), str(out)])
    return out


def main():
    make_shots()
    tl = json.loads((OUT / "timeline.json").read_text())
    emu_offset = tl["emulator_segments"][0]["start"]
    n = HERE / "narration"
    s = HERE / "slides"
    parts = [
        slide_segment("01_title", s / "s1.png", n / "s1.wav"),
        slide_segment("02_problem", s / "s2.png", n / "s2.wav"),
        slide_segment("03_how", s / "s3.png", n / "s3.wav"),
        live_segment("04_liveA", tl["panel_loaded"], tl["first_tool_call"], 1.0, "liveA", n / "live1.wav", emu_offset, show_emulator=False),
        live_segment("05_liveB", tl["first_tool_call"], tl["approval_shown"] - 1.5, 4.0, "liveB", n / "live2.wav", emu_offset),
        live_segment("06_liveC", tl["approval_shown"] - 1.5, tl["run_done"] + 1.5, 1.0, "liveC", n / "live3.wav", emu_offset),
        live_segment("07_liveD", tl["report_opened"], tl["report_end"], 1.0, "liveD", n / "live4.wav", emu_offset, show_emulator=False),
        slide_segment("08_neatlogs", s / "s4.png", n / "s4.wav"),
        slide_segment("09_recovery", s / "s5.png", n / "s5.wav"),
        clip_segment("09b_neatlogs_live", HERE / "clips" / "neatlogs-live.mp4", n / "shotLive.wav", "shotLive"),
        slide_segment("10_entire", s / "s6.png", n / "s6.wav"),
        image_segment("10b_trail_real", SHOTS / "entire_trail.png", n / "shot3.wav", "shotTrail"),
        slide_segment("11_cfo", s / "s7.png", n / "s7.wav"),
        *([clip_segment("11b_cfo_live", HERE / "clips" / "cfo-live.mp4", n / "cfoLive.wav", "shotCfo",
                        speed=CFO_SPEED)] if (HERE / "clips" / "cfo-live.mp4").exists() else []),
        slide_segment("12_close", s / "s8.png", n / "s8.wav", tail=2.5),
    ]
    listing = SEG / "list.txt"
    listing.write_text("".join(f"file '{p.name}'\n" for p in parts))
    final = OUT / "release-gate-agent-demo.mp4"
    run(["-f", "concat", "-safe", "0", "-i", str(listing), "-c", "copy", "-movflags", "+faststart", str(final)])
    print(f"{final}  {duration(final):.1f}s")


if __name__ == "__main__":
    main()
