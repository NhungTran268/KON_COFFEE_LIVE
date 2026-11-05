from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import asyncio
import json
import os
import tempfile
import threading

import edge_tts

HOST = "127.0.0.1"
PORT = 8765
VOICE = "vi-VN-HoaiMyNeural"
ALLOWED_ORIGINS = {
    "https://kon-coffee-live.onrender.com",
    "https://kon-coffee-live-1.onrender.com",
}
MAX_TEXT_LENGTH = 500

class Handler(BaseHTTPRequestHandler):
    def _cors(self):
        origin = self.headers.get("Origin", "")
        if origin in (*ALLOWED_ORIGINS, "null"):
            self.send_header("Access-Control-Allow-Origin", origin)
        self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Private-Network", "true")

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        if self.path != "/health":
            self.send_error(404)
            return
        body = json.dumps({"ok": True, "voice": VOICE}, ensure_ascii=False).encode("utf-8")
        self.send_response(200)
        self._cors()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        if self.path != "/speak":
            self.send_error(404)
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length < 1 or length > 10000:
                raise ValueError("Invalid request size")
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            text = str(payload.get("text", "")).strip()
            if not text or len(text) > MAX_TEXT_LENGTH:
                raise ValueError("Text must contain 1 to 500 characters")
            with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tmp:
                audio_path = tmp.name
            try:
                asyncio.run(edge_tts.Communicate(text, VOICE).save(audio_path))
                with open(audio_path, "rb") as audio_file:
                    audio = audio_file.read()
            finally:
                try:
                    os.remove(audio_path)
                except OSError:
                    pass
            self.send_response(200)
            self._cors()
            self.send_header("Content-Type", "audio/mpeg")
            self.send_header("Content-Length", str(len(audio)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(audio)
        except Exception as exc:
            body = json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False).encode("utf-8")
            self.send_response(400)
            self._cors()
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

    def log_message(self, fmt, *args):
        print("[HoaiMy] " + fmt % args)

if __name__ == "__main__":
    print(f"Hoai My voice helper running at http://{HOST}:{PORT}")
    print("Keep this window open while the LIVE game is running.")
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
