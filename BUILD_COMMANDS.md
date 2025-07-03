# 🚀 Godot WebGPU Build Commands

This document contains the essential build commands and procedures for the Godot WebGPU implementation.

## 📋 Prerequisites

- **Emscripten SDK**: Must be installed at `C:\Users\samkl\sw-projects\emsdk`
- **Python**: Required for SCons build system
- **Git**: For version control and updates

## 🔧 Environment Setup

Before building, the Emscripten environment must be activated:

```powershell
$env:PATH = "C:\Users\samkl\sw-projects\emsdk;C:\Users\samkl\sw-projects\emsdk\upstream\emscripten;" + $env:PATH
$env:EMSDK = "C:/Users/samkl/sw-projects/emsdk"
```

## 🏗️ Build Commands

### Clean Build (Recommended)
```powershell
# Clean previous build artifacts
$env:PATH = "C:\Users\samkl\sw-projects\emsdk;C:\Users\samkl\sw-projects\emsdk\upstream\emscripten;" + $env:PATH; $env:EMSDK = "C:/Users/samkl/sw-projects/emsdk"; python -m SCons platform=web target=template_debug webgpu=yes -c

# Build WebGPU-enabled Godot
$env:PATH = "C:\Users\samkl\sw-projects\emsdk;C:\Users\samkl\sw-projects\emsdk\upstream\emscripten;" + $env:PATH; $env:EMSDK = "C:/Users/samkl/sw-projects/emsdk"; python -m SCons platform=web target=template_debug webgpu=yes -j16
```

### Quick Build (Incremental)
```powershell
# For incremental builds after code changes
$env:PATH = "C:\Users\samkl\sw-projects\emsdk;C:\Users\samkl\sw-projects\emsdk\upstream\emscripten;" + $env:PATH; $env:EMSDK = "C:/Users/samkl/sw-projects/emsdk"; python -m SCons platform=web target=template_debug webgpu=yes -j16
```

### Build Parameters Explained

- `platform=web`: Target web platform using Emscripten
- `target=template_debug`: Debug build with symbols for development
- `webgpu=yes`: Enable WebGPU rendering backend
- `-j16`: Use 16 parallel jobs for faster compilation
- `-c`: Clean build artifacts (use with clean command)

## 📁 Build Output

After successful build, the following files are generated in `bin/`:

- `godot.web.template_debug.wasm32.nothreads.wasm` - WebGPU-enabled Godot (52MB)
- `godot.web.template_debug.wasm32.nothreads.js` - JavaScript loader
- `godot.web.template_debug.wasm32.engine.js` - Engine runtime

## 🧪 Testing Setup

### Copy Build to Test Project
```powershell
# Copy WebGPU build to test project
copy bin\godot.web.template_debug.wasm32.nothreads.wasm test_project\build\index.wasm
copy bin\godot.web.template_debug.wasm32.nothreads.js test_project\build\index.js
```

### Start Development Server
```powershell
# Start HTTP server on port 8000 (preferred)
python -m http.server 8000

# Alternative port 8001
python -m http.server 8001
```

### Test URLs
- **WebGPU Test Page**: `http://localhost:8000/godot_webgpu_test.html`
- **Standard Godot**: `http://localhost:8000/test_project/build/index.html`

## 🔍 Build Verification

### Expected Build Messages
```
✅ WebGPU enabled for web platform (using Dawn)
✅ Building WebGPU driver for Web platform (using Emscripten WebGPU)
✅ WebGPU driver enabled and configured
```

### File Size Comparison
- **Standard Godot**: ~35MB (`godot.wasm`)
- **WebGPU Godot**: ~52MB (`godot.web.template_debug.wasm32.nothreads.wasm`)

## 🐛 Troubleshooting

### Common Issues

1. **"Invalid target platform 'web'"**
   - Solution: Ensure Emscripten environment is activated
   - Check: `emcc --version` should work

2. **Build fails with missing dependencies**
   - Solution: Run clean build first
   - Check: Emscripten SDK is properly installed

3. **WebGPU not detected in browser**
   - Solution: Enable WebGPU in browser flags
   - Chrome: `chrome://flags/#enable-unsafe-webgpu`
   - Edge: `edge://flags/#enable-unsafe-webgpu`

### Performance Tips

- Use `-j16` for maximum parallelization (16 CPU cores)
- Clean builds take ~6 minutes, incremental builds are faster
- Use SSD storage for faster I/O during compilation

## 📊 Build Targets

| Target | Description | Use Case |
|--------|-------------|----------|
| `template_debug` | Debug build with symbols | Development & testing |
| `template_release` | Optimized release build | Production deployment |
| `editor` | Full editor build | Not applicable for web |

## 🔄 Development Workflow

1. **Make code changes** in `drivers/webgpu/`
2. **Clean build** (if major changes): `scons -c`
3. **Build**: `scons platform=web target=template_debug webgpu=yes -j16`
4. **Copy to test project**: Update `test_project/build/index.*`
5. **Test in browser**: Open test page and verify changes

## 📝 Notes

- Build time: ~6 minutes for clean build on 16-core system
- WebGPU support requires modern browser with WebGPU enabled
- Test page includes both standalone WebGPU tests and Godot integration
- Use localhost port 8000 for consistency with development workflow
