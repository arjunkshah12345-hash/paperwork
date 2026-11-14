"""Mix the <audio> SFX cues in index.html onto the rendered MP4 without re-rendering frames.
Usage: python3 mix-sfx.py   (reads renders/paperwork-launch.mp4, rewrites it with the mixed track)"""
import re, subprocess, os
src = open("index.html").read()
cues = re.findall(r'<audio id="sfx-\d+" class="clip" src="([^"]+)" data-start="([\d.]+)" data-duration="([\d.]+)"[^>]*data-volume="([\d.]+)"', src)
inp, out = "renders/paperwork-launch.mp4", "renders/.mix-tmp.mp4"
args = ["ffmpeg", "-y", "-v", "error", "-i", inp]
f = []
for i, (p, t, d, v) in enumerate(cues):
    args += ["-i", p]; ms = int(float(t) * 1000)
    f.append(f"[{i+1}:a]atrim=0:{d},aresample=48000,aformat=channel_layouts=stereo,volume={v},adelay={ms}|{ms}[a{i}]")
f.append("".join(f"[a{i}]" for i in range(len(cues))) + f"amix=inputs={len(cues)}:normalize=0,apad=whole_dur=34.5,atrim=0:34.5,alimiter=limit=0.89[out]")
args += ["-filter_complex", ";".join(f), "-map", "0:v", "-map", "[out]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", out]
subprocess.run(args, check=True); os.replace(out, inp); print(len(cues), "cues mixed into", inp)
