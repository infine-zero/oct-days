# Private issue card preview

Run in the private inbox job, using a pinned, trusted checkout of the public site code. Install Python 3.10+, Playwright (with Chromium), and CJK-capable fonts before the job processes material. CLI:

```sh
python3 scripts/render_issue_preview.py --entry "$RUNNER_TEMP/entry.json" --media-dir "$RUNNER_TEMP/media" --out-dir "$RUNNER_TEMP/oct-days-preview"
```

Input is one JSON object from the private normalizer, using the final public entry field names. `event` is the only required string. Optional strings: `id`, `day`, `time`, `place`, `reflection`, `author`. Supply `people` as an array of names and `photos` as an array of local basenames in final publication order (.jpg, .jpeg, .png, .webp); both default to empty. Use the final normalized date (`10.02` or an empty string). Extra keys are discarded. To represent the proposed future state the preview renders one confirmed entry; it does not confirm the issue or publish anything.

Expected outputs are just `desktop.png` and `mobile.png` (1200 and 390 CSS px viewports respectively, at 2× scale, cropped to the actual expanded note). Run with `--theme night` in a different output directory if wanted. A fresh output directory is required when files already exist. Capture happens after the real component has loaded fonts, decoded thumbnails, and completed resize callbacks. Media decode failure exits nonzero without generating partial output. Surrounding public entries are not included; because the preview isolates a card, day watermark placement in the full timeline can vary.

Payload and media paths are served from memory/workdir by a short-lived server bound to 127.0.0.1 and allowlisted by exact path. The browser blocks all requests except GETs to that exact origin, plus WebSockets and service workers. An invalid loopback proxy blocks background non-loopback access. The script never copies drafts into the site checkout, requests public APIs, or publishes any files. Keep entry/media in private temporary paths; only upload the two PNGs to the **private inbox workflow** as private artifacts. Link the artifact after upload from the existing version-bound confirmation comment. Do not publish the PNGs, make them available anonymously, or use them as a substitute for author confirmation.

Person alias normalization lives once in app.js. The live page and this preview both execute that implementation. Pass author and people strings without rewriting attribution. The index uses the known alias groups; title, free prose and author byline remain unchanged.
