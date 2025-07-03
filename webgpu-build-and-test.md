# WebGPU Build and Test Commands

## Current Issues Fixed
1. **Device Limits**: Fixed `limit_get()` to return realistic WebGPU texture dimension limits instead of 1
2. **Device Connection**: Improved device initialization to actually try connecting to WebGPU device
3. **Shader Compilation**: Need to address GLSLANG module not being enabled for Emscripten builds

## Build Commands

### 1. Build Godot with WebGPU
```powershell
$env:PATH = "C:\Users\samkl\sw-projects\emsdk;C:\Users\samkl\sw-projects\emsdk\upstream\emscripten;" + $env:PATH
$env:EMSDK = "C:/Users/samkl/sw-projects/emsdk"
python -m SCons platform=web target=template_debug webgpu=yes -j16
```

### 2. Export Test Project
```powershell
mkdir -Force .\test_project\build
& .\bin\godot.windows.editor.x86_64.exe --headless --path .\test_project --export-debug "Web" build\index.html --custom-template="C:/Users/samkl/sw-projects/godot-webgpu/bin/godot.web.template_debug.wasm32.zip"
```

### 3. Run Development Server
```powershell
cd test_project\build; python -m http.server 8000
```

### 4. Test URL
Navigate to: http://localhost:8000/webgpu_test.html

## Expected Improvements
After the fixes applied:
- ✅ Texture dimension errors should be resolved (no more "Texture dimensions exceed device maximum")
- ✅ Device connection should work better (fewer "WebGPU device not initialized" errors)
- ❌ Shader compilation errors will still occur until GLSLANG is enabled for Emscripten builds

## Next Steps
1. Test current fixes
2. Address shader compilation by enabling GLSLANG for WebGPU builds or implementing WebGPU-specific shader handling
3. Verify actual WebGPU rendering works
