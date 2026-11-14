"""Builds index.html (the HyperFrames slideshow) and SCRIPT.md from one slide list.

Run: python3 build.py
Every claim here comes from the product (FEATURES.md, the live site) or the sample
conversion in ../samples. Edit the SLIDES list, then rebuild.
"""
import html
import json
import os

SLIDE_SECONDS = 5

SLIDES = [
    {
        "id": "title",
        "label": "Title",
        "body": """
<div class="kicker"><img class="mark" src="assets/logo.svg" alt="">paperwork.</div>
<h1 class="a">PDF tools that never<br>upload your file</h1>
<p class="lede a">75 tools · free · open source</p>
""",
        "notes": "Hey, I'm Arjun. This is Paperwork: a free, open-source set of 75 PDF tools that run entirely in your browser. I want to show you why I built it, what it does better than the usual PDF sites, and where it still falls short.",
    },
    {
        "id": "problem",
        "label": "The problem",
        "body": """
<p class="eyebrow a">The usual way</p>
<h2 class="a">Most PDF sites start by uploading your file</h2>
<p class="lede a">Contracts, tax forms, medical records: sent to someone else's server to rotate one page.</p>
""",
        "notes": "Here's the thing that bugged me. Most online PDF tools work the same way: you pick a file, it uploads to their server, they process it, and you download it back. That's fine for a flyer. It's not fine for a lease, a tax return or a medical form, and those are exactly the files people need to merge, sign and compress.",
    },
    {
        "id": "local",
        "label": "How it works",
        "body": """
<p class="eyebrow a">Paperwork</p>
<h2 class="a">The work happens in your browser</h2>
<div class="flow a"><span>Your file</span><i>→</i><span>Your browser</span><i>→</i><span>Your download</span></div>
<p class="badge a">🔒 Processed on your device</p>
""",
        "notes": "Paperwork flips that. The PDF engine ships to your browser, so the file is opened, changed and saved on your own machine. There is no upload step and no account. Every tool page says 'Processed on your device', and that's literally what happens.",
    },
    {
        "id": "tools",
        "label": "75 tools",
        "body": """
<div class="split">
  <div class="col">
    <p class="eyebrow a">The toolkit</p>
    <h2 class="a">75 tools in one place</h2>
    <p class="lede a">Merge, split, compress, convert, edit, sign, redact, compare, OCR and more.</p>
  </div>
  <img class="shot a" src="assets/ui-home.png" alt="Paperwork home page listing all 75 tools">
</div>
""",
        "notes": "There are 75 tools: the everyday ones like merge, split, compress and rotate, plus converters both ways, editing, signing, redaction, comparison and OCR. But a long list isn't the point. What I care about is that the important ones are genuinely good, so let me show you a few.",
    },
    {
        "id": "excel",
        "label": "PDF to Excel",
        "body": """
<div class="split">
  <div class="col">
    <p class="eyebrow a">Better · PDF to Excel</p>
    <h2 class="a">Tables come back as tables</h2>
    <p class="lede a">Columns are rebuilt from text positions. $, % and thousands become real numbers.</p>
    <p class="chip a">Revenue column sums to $4,150,550.00</p>
  </div>
  <img class="shot a" src="assets/ui-excel-done.png" alt="Paperwork PDF to Excel finished converting northwind-q3.pdf">
</div>
""",
        "notes": "First, PDF to Excel. If you've ever copy-pasted a table out of a PDF, you know it lands as one column of text, and a SUM of it gives you zero. Paperwork rebuilds the columns from where the text actually sits on the page, and turns currency, percentages and thousands separators into real numeric cells with the right formats. On this sample report, the revenue column just sums: four million, one hundred fifty thousand, five hundred fifty dollars.",
    },
    {
        "id": "word",
        "label": "PDF to Word",
        "body": """
<p class="eyebrow a">Better · PDF to Word</p>
<h2 class="a">A Word file you can actually edit</h2>
<ul class="list">
  <li class="a">Headings detected from font size</li>
  <li class="a">Lines joined back into paragraphs</li>
  <li class="a">Bullet lists stay lists</li>
  <li class="a">Tables become real Word tables</li>
</ul>
""",
        "notes": "PDF to Word works the same way. Instead of a text box per line, you get real headings, paragraphs that are joined back together, bullet lists, and tables rebuilt as actual Word tables, so you can edit the document instead of fighting it.",
    },
    {
        "id": "compress",
        "label": "Compress",
        "body": """
<p class="eyebrow a">Better · Compress</p>
<h2 class="a">Compress to an exact size</h2>
<div class="flow a"><span>“Make it 1 MB”</span><i>→</i><span>lossless first</span><i>→</i><span>gentlest setting that fits</span></div>
<p class="lede a">And it never hands you back a bigger file.</p>
""",
        "notes": "Compression. Forms and portals usually say 'under 1 MB' or 'under 200 KB'. So you can type the size you need. Paperwork tries lossless compression first, then the gentlest image setting that fits, and if it's impossible it tells you why. It will never return a file that's bigger than the one you gave it.",
    },
    {
        "id": "edit",
        "label": "Edit PDF",
        "body": """
<p class="eyebrow a">Better · Edit PDF</p>
<h2 class="a">Edit the text that's already there</h2>
<p class="lede a">Click a line to replace or delete it. The old text is removed from the file, not hidden under a white box.</p>
""",
        "notes": "Editing. A lot of 'PDF editors' just paint a white rectangle over the old text and type on top, so the original is still in the file. In Paperwork you click existing text and replace or delete it, and the original glyphs are actually removed from the page. You can also swap or delete placed images.",
    },
    {
        "id": "details",
        "label": "Small things",
        "body": """
<p class="eyebrow a">The small things</p>
<h2 class="a">Details that save a re-do</h2>
<ul class="list">
  <li class="a">Compare: word-level and pixel-level differences, page by page</li>
  <li class="a">PDF to PowerPoint: each page's text lands in the speaker notes</li>
  <li class="a">Unlock: removes restrictions losslessly, never cracks passwords</li>
</ul>
""",
        "notes": "And a few small things. Compare shows word-level and pixel-level differences on every page. PDF to PowerPoint puts each page's text into the speaker notes, so it's searchable and you can present from it. Unlock removes restrictions without re-encoding the file, and it will never try to crack a password.",
    },
    {
        "id": "limits",
        "label": "Honest limits",
        "body": """
<p class="eyebrow a">Honest limits</p>
<h2 class="a">What it doesn't do yet</h2>
<ul class="list">
  <li class="a">Scanned pages need OCR before converting</li>
  <li class="a">Merged cells and formulas aren't recreated</li>
  <li class="a">Word output isn't a pixel-perfect facsimile</li>
  <li class="a">Signatures are visual, not certificate-based</li>
</ul>
""",
        "notes": "I also want to be straight about the limits, because every tool page lists them too. Scanned pages need OCR before converting. Excel export doesn't recreate merged cells or formulas. Word export gives you editable structure, not a pixel-perfect copy of the layout. And signatures are visual marks, not certificate-based digital signatures.",
    },
    {
        "id": "open",
        "label": "Open source",
        "body": """
<p class="eyebrow a">Open source</p>
<h2 class="a">MIT licensed. No account.</h2>
<p class="lede a">Read every line, run it yourself, or download the source straight from the site.</p>
""",
        "notes": "It's all open source under the MIT licence. There's no account and nothing to sign up for. If you don't want to trust me, you can read the code, run it yourself, or download the source straight from the site.",
    },
    {
        "id": "cta",
        "label": "Try it",
        "body": """
<div class="end">
  <div class="kicker big a"><img class="mark" src="assets/logo.svg" alt="" data-layout-ignore>paperwork.</div>
  <p class="url a">paperwork-pdf-emx.pages.dev</p>
  <p class="lede a">Try it with a file you actually care about.</p>
</div>
""",
        "notes": "That's Paperwork. It's live at paperwork-pdf-emx.pages.dev. Try it with a file you actually care about, and if something doesn't convert the way you expect, tell me. That's how the next version gets better. Thanks for watching.",
    },
]

CSS = """
@font-face { font-family: "DM Sans"; font-weight: 400; src: url("assets/fonts/dm-sans-latin-400-normal.woff2") format("woff2"); }
@font-face { font-family: "DM Sans"; font-weight: 500; src: url("assets/fonts/dm-sans-latin-500-normal.woff2") format("woff2"); }
@font-face { font-family: "DM Sans"; font-weight: 600; src: url("assets/fonts/dm-sans-latin-600-normal.woff2") format("woff2"); }
@font-face { font-family: "DM Sans"; font-weight: 700; src: url("assets/fonts/dm-sans-latin-700-normal.woff2") format("woff2"); }
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { width: 1920px; height: 1080px; overflow: hidden; background: #fafaf8; }
#root { position: absolute; inset: 0; padding: 140px 160px; font-family: "DM Sans", sans-serif; color: #292c28; background: #fafaf8; display: flex; flex-direction: column; justify-content: center; gap: 36px; }
.kicker { display: flex; align-items: center; gap: 22px; font-size: 64px; font-weight: 700; letter-spacing: -0.04em; }
.kicker.big { font-size: 140px; gap: 36px; }
.mark { width: 72px; height: 72px; }
.kicker.big .mark { width: 150px; height: 150px; }
h1 { font-size: 132px; line-height: 1.02; font-weight: 700; letter-spacing: -0.045em; }
h2 { font-size: 104px; line-height: 1.04; font-weight: 700; letter-spacing: -0.04em; max-width: 1500px; }
.split h2 { font-size: 80px; }
.eyebrow { font-size: 40px; font-weight: 600; color: #bc4d32; letter-spacing: -0.01em; }
.lede { font-size: 48px; line-height: 1.3; font-weight: 500; color: #5d6159; max-width: 1400px; }
.flow { display: flex; align-items: center; gap: 24px; font-size: 46px; font-weight: 600; }
.flow span { white-space: nowrap; padding: 22px 34px; border: 3px solid #e4e5de; border-radius: 22px; background: #fff; }
.flow i { font-style: normal; color: #bc4d32; }
.badge { align-self: flex-start; font-size: 44px; font-weight: 600; padding: 16px 28px; border-radius: 16px; background: #e8efe9; color: #42664b; }
.chip { align-self: flex-start; font-size: 42px; font-weight: 700; padding: 16px 28px; border-radius: 16px; background: #bc4d32; color: #fff; }
.list { list-style: none; display: flex; flex-direction: column; gap: 26px; }
.list li { font-size: 52px; font-weight: 500; padding-left: 56px; position: relative; }
.list li::before { content: ""; position: absolute; left: 0; top: 24px; width: 24px; height: 24px; border-radius: 6px; background: #bc4d32; }
.split { display: flex; align-items: center; gap: 56px; margin-right: -80px; }
.col { flex: 0 0 560px; display: flex; flex-direction: column; gap: 32px; }
.split .lede { font-size: 44px; }
.shot { width: 1080px; height: auto; border-radius: 20px; border: 3px solid #e4e5de; box-shadow: 0 30px 60px rgba(41, 44, 40, 0.12); }
.end { display: flex; flex-direction: column; align-items: center; gap: 44px; text-align: center; }
.url { font-size: 64px; font-weight: 700; color: #fff; background: #bc4d32; padding: 24px 52px; border-radius: 22px; }
"""


def build():
    os.makedirs("compositions", exist_ok=True)
    hosts = []
    for index, slide in enumerate(SLIDES):
        start = index * SLIDE_SECONDS
        dark = "\n    #root { background: #292c28; color: #fafaf8; }\n    #root .lede { color: #c9ccc3; }" if slide["id"] == "problem" else ""
        hosts.append(
            f'<div id="{slide["id"]}" class="clip host" data-composition-id="{slide["id"]}" '
            f'data-composition-src="compositions/{slide["id"]}.html" data-label="{html.escape(slide["label"])}" '
            f'data-start="{start}" data-duration="{SLIDE_SECONDS}" data-track-index="1" data-track-kind="graphics" '
            f'data-width="1920" data-height="1080"></div>'
        )
        scene = f"""<template>
  <style>{CSS}
    {dark}
  </style>
  <div id="root" data-composition-id="{slide["id"]}" data-width="1920" data-height="1080">{slide["body"]}</div>
  <script>
    const tl = gsap.timeline({{ paused: true }});
    tl.fromTo("#root .a", {{ opacity: 0, y: 28 }}, {{ opacity: 1, y: 0, duration: 0.5, stagger: 0.12, ease: "power3.out" }}, 0.1);
    window.__timelines["{slide["id"]}"] = tl;
  </script>
</template>
"""
        with open(f"compositions/{slide['id']}.html", "w") as file:
            file.write(scene)
    island = {
        "slides": [{"sceneId": slide["id"], "notes": slide["notes"]} for slide in SLIDES]
    }
    page = f"""<!doctype html>
<!-- Generated by build.py — edit SLIDES there, then run: python3 build.py -->
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1920, height=1080" />
    <title>Paperwork — what's genuinely better</title>
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/gsap.min.js"></script>
    <style>
      * {{ margin: 0; padding: 0; box-sizing: border-box; }}
      html, body {{ width: 1920px; height: 1080px; overflow: hidden; background: #fafaf8; }}
      #deck {{ position: relative; width: 1920px; height: 1080px; }}
      .host {{ position: absolute; inset: 0; }}
    </style>
  </head>
  <body>
    <script type="application/hyperframes-slideshow+json">
{json.dumps(island, indent=2)}
    </script>
    <div id="deck" data-composition-id="deck" data-start="0" data-duration="{len(SLIDES) * SLIDE_SECONDS}" data-width="1920" data-height="1080">
{chr(10).join("      " + host for host in hosts)}
    </div>
    <script>
      window.__timelines = window.__timelines || {{}};
      window.__timelines["deck"] = gsap.timeline({{ paused: true }});
    </script>
  </body>
</html>
"""
    with open("index.html", "w") as file:
        file.write(page)

    words = sum(len(slide["notes"].split()) for slide in SLIDES)
    lines = [
        "# Paperwork — presenter script",
        "",
        f"{len(SLIDES)} slides, about {words} words: roughly {round(words / 150, 1)} minutes at a relaxed 150 words a minute.",
        "The same text is in the deck's presenter notes (press P in the deck to open presenter view).",
        "",
    ]
    for index, slide in enumerate(SLIDES, 1):
        lines += [f"## {index}. {slide['label']}", "", slide["notes"], ""]
    with open("SCRIPT.md", "w") as file:
        file.write("\n".join(lines))
    # Teleprompter data for ../recorder (plain script tag, works from file:// or localhost).
    prompts = [{"label": slide["label"], "text": slide["notes"]} for slide in SLIDES]
    os.makedirs("../recorder", exist_ok=True)
    with open("../recorder/script.js", "w") as file:
        file.write("// Generated by ../deck/build.py\nwindow.PROMPTER = " + json.dumps(prompts, indent=2) + ";\n")


if __name__ == "__main__":
    build()
