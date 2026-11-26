#!/usr/bin/env python3
"""Render one already-normalized issue note using the deployed site UI, entirely on loopback."""

import argparse
import hashlib
import http.server
import json
import mimetypes
import os
from pathlib import Path
import re
import sys
import tempfile
from threading import Thread
from urllib.parse import urlsplit

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
STATIC = {"index.html", "style.css", "journey.css", "photos.css",
          "app.js", "photos.js", "journey.js", "coast-background.png", "coast-day.webp"}
PHOTO_TYPES = {".jpg": "image/jpeg", ".jpeg": "image/jpeg",
               ".png": "image/png", ".webp": "image/webp"}
FILES = ("desktop.png", "mobile.png")


def build_payload(entry_path, media_dir):
    raw = json.loads(entry_path.read_text(encoding="utf-8"))
    if not isinstance(raw, dict) or not isinstance(raw.get("event"), str) or not raw["event"].strip():
        raise ValueError("event is required")
    fields = ("id", "day", "time", "place", "event", "reflection", "author")
    entry = {key: raw.get(key, "") for key in fields}
    if not all(isinstance(v, str) for v in entry.values()):
        raise ValueError("invalid text field")
    entry["id"] = entry["id"] or "issue-preview"
    entry["status"] = "confirmed"
    people = raw.get("people", [])
    photos = raw.get("photos", [])
    if any(not isinstance(values, list) or not all(isinstance(x, str) for x in values)
           for values in (people, photos)):
        raise ValueError("people/photos must be string lists")
    entry["people"] = people
    entry["photos"] = []
    if len(photos) > 80:
        raise ValueError("too many photos")
    media = {}
    base = media_dir.resolve()
    for f in photos:
        candidate = Path(f)
        if not re.fullmatch(r"[^/\\\\\x00]+", f) or candidate.suffix.lower() not in PHOTO_TYPES:
            raise ValueError("photos require a local image filename")
        source = (base / f).resolve(strict=True)
        if not source.is_relative_to(base) or not source.is_file():
            raise ValueError("photo outside media directory")
        token = hashlib.sha256(f.encode("utf-8")).hexdigest() + ".jpg"
        entry["photos"].append(token)
        media["/media/" + token] = (source, PHOTO_TYPES[candidate.suffix.lower()])
    payload = ("window.TRAVEL_SHARE = " + json.dumps(
        {"version": 1, "tripStart": "", "events": [entry], "demo": False},
        ensure_ascii=True) + ";").encode("ascii")
    return payload, media


def start_server(payload, media):
    class LocalPreview(http.server.BaseHTTPRequestHandler):
        def log_message(self, *_):
            pass

        def do_GET(self):
            if self.headers.get("Host") != f"127.0.0.1:{self.server.server_port}":
                self.send_error(403)
                return
            path = urlsplit(self.path).path
            if path == "/share-data.js":
                source, mime = payload, "application/javascript"
            elif path in media:
                source, mime = media[path]
            else:
                name = "index.html" if path == "/" else path.removeprefix("/")
                if name not in STATIC:
                    self.send_error(404)
                    return
                source = ROOT / name
                mime = mimetypes.guess_type(name)[0] or "application/octet-stream"
            try:
                body = source.read_bytes() if isinstance(source, Path) else source
            except OSError:
                self.send_error(404)
                return
            self.send_response(200)
            self.send_header("Content-Type", mime)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Content-Security-Policy",
                             "default-src 'none'; script-src 'self' 'unsafe-inline'; "
                             "style-src 'self' 'unsafe-inline'; img-src 'self' data:; "
                             "font-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'")
            self.end_headers()
            try:
                self.wfile.write(body)
            except (BrokenPipeError, ConnectionResetError):
                pass

    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), LocalPreview)
    Thread(target=server.serve_forever, daemon=True).start()
    return server, f"http://127.0.0.1:{server.server_port}"


def restrict(context, origin):
    def handle(route):
        url = urlsplit(route.request.url)
        target = f"{url.scheme}://{url.netloc}"
        if target == origin and route.request.method == "GET":
            route.continue_()
        else:
            route.abort("blockedbyclient")
    context.route("**/*", handle)
    context.route_web_socket("**/*", lambda socket: socket.close())


def open_browser(playwright):
    # Chromium bypasses the dead proxy only for loopback; page requests are further
    # limited to this server's exact origin by the browser context.
    options = {"args": ["--proxy-server=http://127.0.0.1:9", "--disable-background-networking",
                        "--force-webrtc-ip-handling-policy=disable_non_proxied_udp"]}
    if executable := os.getenv("OCT_DAYS_CHROMIUM"):
        options["executable_path"] = executable
    return playwright.chromium.launch(**options)


def render(entry, media_dir, out_dir, theme):
    payload, media = build_payload(entry, media_dir)
    server, origin = start_server(payload, media)
    try:
        with tempfile.TemporaryDirectory(dir=out_dir) as stage, sync_playwright() as p:
            browser = open_browser(p)
            for name, width, height in (("desktop.png", 1200, 900), ("mobile.png", 390, 844)):
                context = browser.new_context(viewport={"width": width, "height": height},
                                              device_scale_factor=2, service_workers="block",
                                              reduced_motion="reduce")
                restrict(context, origin)
                context.add_init_script(f"localStorage.setItem('oct-days-theme', '{theme}');")
                page = context.new_page()
                page.goto(origin, wait_until="load")
                card = page.locator("#event-list .event.is-selected")
                card.wait_for()
                page.evaluate("document.fonts.ready")
                card.locator("img").evaluate_all("""imgs=>Promise.all(imgs.map(img=>{
                    img.loading='eager';return img.decode();
                }))""")
                # Let the same resize observers as the live page settle before capture.
                page.evaluate("new Promise(ok=>requestAnimationFrame(()=>requestAnimationFrame(ok)))")
                card.screenshot(path=Path(stage) / name, animations="disabled")
                context.close()
            for name in FILES:
                (Path(stage) / name).replace(out_dir / name)
    finally:
        server.shutdown()
        server.server_close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--entry", type=Path, required=True)
    parser.add_argument("--media-dir", type=Path, required=True)
    parser.add_argument("--out-dir", type=Path, required=True)
    parser.add_argument("--theme", choices=("day", "night"), default="day")
    args = parser.parse_args()
    try:
        out = args.out_dir.resolve()
        if out.is_relative_to(ROOT):
            raise ValueError("preview output must be outside the public checkout")
        out.mkdir(parents=True, exist_ok=True, mode=0o700)
        if any((out / name).exists() or (out / name).is_symlink() for name in FILES):
            raise ValueError("output files already exist")
        render(args.entry, args.media_dir, out, args.theme)
        print("Rendered desktop.png and mobile.png")
    except Exception:
        # Do not echo draft text, attachment filenames or browser operation details to CI logs.
        print("Preview failed; check the JSON, photos, browser installation and output directory.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
