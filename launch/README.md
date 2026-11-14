# Paperwork launch kit

| Piece | Where | What it is |
|---|---|---|
| Launch video | `video/renders/paperwork-launch.mp4` | 34.5 s, 1920×1080, 30 fps, with 24 sound effects synced to the on-screen clicks, pastes and reveals (no music yet). One real table goes from a PDF, to a broken paste, to a real spreadsheet. Source is a HyperFrames project in `video/`. |
| Slide deck | `deck/` | 12 slides on what's genuinely better, plus honest limits. Presenter notes hold the script. |
| Script | `deck/SCRIPT.md` | The same notes as a document (about 600 words, roughly 4 minutes). |
| Recorder | `recorder/index.html` | Records your screen or the deck full-frame with your camera in a corner, plus your mic. The script shows as a teleprompter that isn't recorded. |

Every number on screen comes from the product or the real conversion of `samples/northwind-q3.pdf`.

## Record the walkthrough

```bash
# 1. Present the deck (prints http://localhost:3004)
cd launch/deck && npx hyperframes present .

# 2. Serve the recorder from localhost (browsers block the camera on file://)
cd launch && python3 -m http.server 4321 --bind 127.0.0.1
# open http://127.0.0.1:4321/recorder/ in Chrome, ideally in its own window
```

1. In the recorder, click **Turn on camera + mic**, pick a corner, a shape and a size.
2. Click **Share screen or tab** and choose the deck tab (press P in the deck first for the audience view).
3. Press **R** (or Start recording). After a 3-2-1 countdown it records. **Space** pauses, **R** stops.
4. Step through the script with **← / →** in the recorder. Change slides in the deck window.
5. Download the MP4 (Chrome) or WebM (other browsers; the page shows the ffmpeg line to convert).

Keep the recorder window visible beside the deck rather than behind it. It keeps recording when hidden, but a visible window gives the smoothest frames.

## Edit

- Deck and script: edit `SLIDES` in `deck/build.py`, run `python3 build.py`, then restart `present`, because it caches files. This also regenerates `recorder/script.js`.
- Video: `cd video && npx hyperframes preview`, then `npx hyperframes render -o renders/paperwork-launch.mp4 -q delivery`.
- Sound: the SFX cues are the `<audio id="sfx-…">` tags in `video/index.html` (files and licence in `video/assets/sfx/`). A full render mixes them in. To change only the sound, edit the cues and run `python3 mix-sfx.py` in `video/`, which remixes onto the existing MP4 in seconds.
- Music: there is no music bed yet. Run `npx hyperframes auth login` to use the HeyGen music catalog, or drop a licensed track in `video/assets/` and add an `<audio id="music" src="assets/track.mp3" data-start="0" data-duration="34.5">` to `video/index.html`.
