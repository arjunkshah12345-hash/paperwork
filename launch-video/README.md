# Paperwork launch film

30 seconds · 1920 × 1080 · 30 fps · original instrumental score.

The film uses Paperwork's neutral palette, terracotta accent, DM Sans, and real tool names. Interfaces are animated demonstrations, not recordings or performance benchmarks. No OCR or other unsupported capabilities are shown. The MIT claim applies to Paperwork, not to Remotion or other third-party dependencies.

## Storyboard

1. **0–4 seconds — The introduction.** Three animated PDF pages resolve into the Paperwork wordmark. The category and free, local-first promise appear immediately.
2. **4–10 seconds — Merge.** The dashboard becomes a focused Merge PDF editor. Two documents combine into a downloadable PDF.
3. **10–16 seconds — Organize.** Pages move from 1–2–3 to 3–1–2. A page rotates, then the edited document resolves.
4. **16–22 seconds — Convert.** PDF pages become individual PNG files. A progress indicator and download state make the result explicit.
5. **22–26 seconds — Privacy.** An animated local workflow stays inside a browser boundary. No uploads. No accounts.
6. **26–30 seconds — Launch.** Product name, MIT-licensed source, and the live Cloudflare URL. Continued page motion resolves into the final mark.

## Develop and render

```sh
cd launch-video
npm ci
npm run score
npm run studio
npm run typecheck
npm run render
```

Output: `out/paperwork-launch.mp4`. The score is synthesized locally by `scripts/score.mjs`; no stock track or paid generation service is used.
