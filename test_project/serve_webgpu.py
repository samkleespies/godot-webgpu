#!/usr/bin/env python3
"""
Simple HTTP server with Cross-Origin Isolation headers for WebGPU/SharedArrayBuffer support.
"""

import http.server
import socketserver
from http.server import SimpleHTTPRequestHandler
import os

class WebGPUHTTPRequestHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        # Add Cross-Origin Isolation headers required for SharedArrayBuffer
        self.send_header('Cross-Origin-Opener-Policy', 'same-origin')
        self.send_header('Cross-Origin-Embedder-Policy', 'require-corp')
        
        # Add CORS headers for WebGPU
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', '*')
        
        # Cache control for development
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        
        super().end_headers()

if __name__ == "__main__":
    PORT = 8000
    
    # Change to the build directory
    os.chdir('build')
    
    with socketserver.TCPServer(("", PORT), WebGPUHTTPRequestHandler) as httpd:
        print(f"[SERVER] WebGPU Development Server running at http://localhost:{PORT}")
        print("[FEATURES] Enabled:")
        print("   [OK] Cross-Origin Isolation (SharedArrayBuffer support)")
        print("   [OK] CORS headers for WebGPU")
        print("   [OK] No-cache headers for development")
        print(f"\n[URL] Open http://localhost:{PORT}/index.html in your browser")
        print("[STOP] Press Ctrl+C to stop the server")
        
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n[STOP] Server stopped")