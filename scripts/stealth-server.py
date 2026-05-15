#!/usr/bin/env python3
"""
Stealth file server for eStorya Classics.
Serves files from ebook-intake/ but hides directory listings.
Only direct file URLs work — no browsing.
"""

import http.server
import socketserver
import os
import sys

PORT = 8765
SERVE_ROOT = os.path.expanduser("~/Documents/Github/epub-glamourer/ebook-intake")

class StealthHandler(http.server.SimpleHTTPRequestHandler):
    def list_directory(self, path):
        """Suppress directory listings — return 404."""
        self.send_error(404, "Not Found")
        return None

    def translate_path(self, path):
        """Serve from ebook-intake/ instead of cwd."""
        # Clean the path
        path = path.split('?', 1)[0]
        path = path.split('#', 1)[0]
        path = os.path.normpath(path)
        # Prevent directory traversal
        parts = []
        for part in path.split('/'):
            if part == '..':
                continue
            if part and part != '.':
                parts.append(part)
        safe_path = '/' + '/'.join(parts)
        return os.path.join(SERVE_ROOT, safe_path.lstrip('/'))

    def log_message(self, format, *args):
        """Log to stdout with timestamp."""
        print(f"[{self.log_date_time_string()}] {self.address_string()} — {format % args}")

    def end_headers(self):
        """Add security headers."""
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('X-Frame-Options', 'DENY')
        self.send_header('Referrer-Policy', 'no-referrer')
        super().end_headers()

if __name__ == '__main__':
    os.chdir(SERVE_ROOT)
    with socketserver.TCPServer(("", PORT), StealthHandler) as httpd:
        print(f"🔒 Stealth server running on port {PORT}")
        print(f"   Serving from: {SERVE_ROOT}")
        print(f"   Directory listings: DISABLED (404)")
        print(f"   Only direct file URLs work.")
        print(f"   Press Ctrl+C to stop.")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n🛑 Server stopped.")
            sys.exit(0)
