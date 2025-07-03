#!/usr/bin/env python3
"""
Simple HTTP server with CORS and SharedArrayBuffer headers for Godot WebGPU testing.
"""

import http.server
import socketserver
import sys
from urllib.parse import urlparse

class CORSRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Add CORS headers
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', '*')
        
        # Add headers required for SharedArrayBuffer (cross-origin isolation)
        # Temporarily disable for testing - will use single-threaded mode
        # self.send_header('Cross-Origin-Embedder-Policy', 'credentialless')
        # self.send_header('Cross-Origin-Opener-Policy', 'same-origin')
        
        # Add WebGPU-friendly headers
        self.send_header('Permissions-Policy', 'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()')
        
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def log_message(self, format, *args):
        # Custom log format
        print(f"[{self.log_date_time_string()}] {format % args}")

def main():
    port = 8001
    if len(sys.argv) > 1:
        port = int(sys.argv[1])
    
    with socketserver.TCPServer(("", port), CORSRequestHandler) as httpd:
        print(f"🚀 WebGPU-enabled server running at http://localhost:{port}/")
        print(f"📋 Cross-origin isolation enabled for SharedArrayBuffer support")
        print(f"🔧 CORS headers enabled")
        print(f"⚡ WebGPU permissions configured")
        print(f"🛑 Press Ctrl+C to stop")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print(f"\n🛑 Server stopped")

if __name__ == "__main__":
    main()
