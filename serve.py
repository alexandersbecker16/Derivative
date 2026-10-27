"""Local dev server for Derivative Lab (no caching, auto-opens your browser).

Usage:  python serve.py [port]       default 5180
        python serve.py 5180 --no-open
"""
import os
import socket
import sys
import threading
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, fmt, *args):
        sys.stdout.write("%s - %s\n" % (self.address_string(), fmt % args))


def port_free(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(("127.0.0.1", port)) != 0


def pick_port(preferred):
    port = preferred
    while not port_free(port) and port < preferred + 50:
        port += 1
    return port


def main():
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    preferred = int(args[0]) if args else 5180
    port = pick_port(preferred)
    url = f"http://localhost:{port}"

    server = ThreadingHTTPServer(("", port), NoCacheHandler)
    print("=" * 50)
    print(f"  Derivative Lab is running at {url}")
    print("  Press Ctrl+C in this window to stop.")
    print("=" * 50)

    if "--no-open" not in sys.argv:
        threading.Timer(0.6, lambda: webbrowser.open(url)).start()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
