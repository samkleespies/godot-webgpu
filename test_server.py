#!/usr/bin/env python3
"""
Godot WebGPU Backend Test Server
Serves the WebGPU test interface and Godot game files
"""

import http.server
import socketserver
import os
import sys
import webbrowser
import threading
import time
from pathlib import Path

class WebGPUTestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=os.getcwd(), **kwargs)
    
    def end_headers(self):
        # Add CORS headers for WebGPU
        self.send_header('Cross-Origin-Embedder-Policy', 'require-corp')
        self.send_header('Cross-Origin-Opener-Policy', 'same-origin')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()
    
    def guess_type(self, path):
        # Set correct MIME types for WebAssembly and other files
        if path.endswith('.wasm'):
            return 'application/wasm'
        elif path.endswith('.js'):
            return 'application/javascript'
        elif path.endswith('.pck'):
            return 'application/octet-stream'

        return super().guess_type(path)
    
    def log_message(self, format, *args):
        # Custom logging with colors
        timestamp = time.strftime('%H:%M:%S')
        message = format % args
        
        if '200' in message:
            color = '\033[92m'  # Green
        elif '404' in message:
            color = '\033[91m'  # Red
        else:
            color = '\033[94m'  # Blue
        
        print(f"{color}[{timestamp}] {message}\033[0m")

def check_build_files():
    """Check if Godot WebGPU build files exist"""
    required_files = [
        'bin/.web_zip/godot.js',
        'bin/.web_zip/godot.wasm',
        'bin/.web_zip/godot.pck'
    ]
    
    missing_files = []
    for file_path in required_files:
        if not os.path.exists(file_path):
            missing_files.append(file_path)
    
    return missing_files

def print_banner():
    """Print a nice banner"""
    banner = """
    ╔══════════════════════════════════════════════════════════════╗
    ║                🚀 Godot WebGPU Backend Test Server           ║
    ║                                                              ║
    ║  Testing the complete WebGPU rendering implementation        ║
    ║  in real browsers with interactive controls                  ║
    ╚══════════════════════════════════════════════════════════════╝
    """
    print(banner)

def print_instructions():
    """Print usage instructions"""
    instructions = """
    📋 INSTRUCTIONS:
    
    1. 🔧 Build the Godot project first:
       python -m SCons platform=web target=template_debug webgpu=yes threads=no -j8
    
    2. 🌐 Open your browser to: http://localhost:8001
    
    3. 🧪 Use the test interface to:
       • Check WebGPU support
       • Test basic rendering (triangle)
       • Test shader compilation
       • Load and run the Godot game
       • Validate WebGPU backend functionality
    
    4. 🎮 Browser Requirements:
       • Chrome/Edge 113+ (recommended)
       • Firefox Nightly with WebGPU enabled
       • Safari Technology Preview (experimental)
    
    5. ⌨️  Keyboard Controls in Game:
       • SPACE: Reset sphere rotation
       • R: Randomize sphere color
       • F: Show current FPS
       • T: Re-run WebGPU tests
    
    📊 The test interface provides:
       • Real-time WebGPU status monitoring
       • Interactive test buttons for all major features
       • Debug log with detailed information
       • Live game preview with our WebGPU backend
    """
    print(instructions)

def open_browser_delayed(url, delay=2):
    """Open browser after a delay"""
    time.sleep(delay)
    print(f"\n🌐 Opening browser to {url}")
    webbrowser.open(url)

def main():
    PORT = 8001
    
    print_banner()
    
    # Check if build files exist
    missing_files = check_build_files()
    if missing_files:
        print("⚠️  WARNING: Some Godot build files are missing:")
        for file in missing_files:
            print(f"   ❌ {file}")
        print("\n🔧 Please build the project first with:")
        print("   python -m SCons platform=web target=template_debug webgpu=yes threads=no -j8")
        print("\n📝 You can still test the WebGPU interface without the game files.")
        print("   The basic WebGPU tests will work, but game loading will fail.")
    else:
        print("✅ All Godot build files found!")
    
    print_instructions()
    
    # Start the server
    try:
        with socketserver.TCPServer(("", PORT), WebGPUTestHandler) as httpd:
            server_url = f"http://localhost:{PORT}"
            
            print(f"\n🚀 Server starting on {server_url}")
            print("📁 Serving files from:", os.getcwd())
            print("🔧 WebGPU headers enabled")
            print("📋 Test interface: webgpu_test.html")
            print("\n⏹️  Press Ctrl+C to stop the server")
            
            # Open browser in a separate thread
            browser_thread = threading.Thread(
                target=open_browser_delayed, 
                args=(f"{server_url}/webgpu_test.html",)
            )
            browser_thread.daemon = True
            browser_thread.start()
            
            # Start serving
            httpd.serve_forever()
            
    except KeyboardInterrupt:
        print("\n\n👋 Server stopped by user")
        print("🎉 Thanks for testing the Godot WebGPU backend!")
    except OSError as e:
        if e.errno == 98:  # Address already in use
            print(f"\n❌ Error: Port {PORT} is already in use")
            print("🔧 Try stopping other servers or use a different port")
        else:
            print(f"\n❌ Error starting server: {e}")
    except Exception as e:
        print(f"\n❌ Unexpected error: {e}")

if __name__ == "__main__":
    main()
