# WebGPU Backend Build Guide

This guide explains how to build and test the WebGPU backend implementation for Godot.

## Prerequisites

1. **Emscripten SDK**: Make sure you have Emscripten installed and configured
   - Set `PATH` to include `C:\Users\samkl\sw-projects\emsdk` and `upstream\emscripten`
   - Set `EMSDK` environment variable

2. **WebGPU-compatible Browser**: Use Chrome/Chromium 113+ or Firefox Nightly with WebGPU enabled

## Build Commands

### Web Platform with WebGPU

```bash
# Build Godot for web with WebGPU support
python -m SCons platform=web target=template_debug webgpu=yes -j16

# Alternative with more verbose output
python -m SCons platform=web target=template_debug webgpu=yes -j16 verbose=yes
```

### Build Options

- `platform=web`: Target web platform using Emscripten
- `target=template_debug`: Build debug template for development
- `webgpu=yes`: Enable WebGPU backend support
- `-j16`: Use 16 parallel compilation jobs (adjust based on your CPU)

## Current Implementation Status

### ✅ Completed Features

1. **SPIR-V to WGSL Conversion**
   - Integrated Dawn/Tint library for shader conversion
   - Real SPIR-V bytecode parsing and WGSL generation
   - Shader reflection for extracting metadata

2. **Command Buffer System**
   - Command pool creation and management
   - Command buffer allocation and recording
   - Proper command buffer state tracking

3. **Render Pass Management**
   - Basic render pass begin/end functionality
   - Viewport and scissor rect setting
   - Clear value handling

4. **Basic Infrastructure**
   - WebGPU device initialization
   - Resource management with PagedAllocator
   - Format conversion between Godot and WebGPU

### 🚧 In Progress

1. **Framebuffer and Attachment Management**
   - Proper color/depth attachment handling
   - Multi-target rendering support

2. **Pipeline State Configuration**
   - Blend state, depth/stencil state
   - Vertex format handling from shader reflection

3. **Uniform Set Management**
   - WebGPU bind groups for uniforms and textures
   - Push constants implementation

### ❌ Not Yet Implemented

1. **Scene Integration**
   - Integration with Godot's rendering pipeline
   - Material system support
   - Lighting and post-processing

2. **Advanced Features**
   - Compute shader support
   - Multi-sampling
   - Texture operations and copying

## Testing

### Simple WebGPU Test

1. Build Godot with WebGPU support
2. Open `webgpu_test_simple.html` in a WebGPU-compatible browser
3. Test basic WebGPU functionality and shader compilation

### Godot Game Test

1. Create a simple Godot project with basic 3D scene
2. Export for web with WebGPU template
3. Test in browser to verify rendering works

## Troubleshooting

### Build Issues

- **Tint not found**: Make sure Dawn/Tint includes are properly configured in SCsub
- **WebGPU headers missing**: Verify `--use-port=emdawnwebgpu` is being used
- **Compilation errors**: Check that SPIR-V reader and WGSL writer are enabled

### Runtime Issues

- **WebGPU not supported**: Use Chrome 113+ or Firefox Nightly with WebGPU enabled
- **Shader compilation fails**: Check browser console for WGSL compilation errors
- **Black screen**: Verify WebGPU device initialization and render pass setup

## Development Notes

### Key Files

- `drivers/webgpu/rendering_device_driver_webgpu.cpp`: Main WebGPU driver implementation
- `drivers/webgpu/rendering_context_driver_webgpu.cpp`: WebGPU context management
- `platform/web/detect.py`: Web platform build configuration
- `drivers/webgpu/SCsub`: WebGPU driver build script

### Architecture

The WebGPU backend follows Godot's rendering device driver pattern:
- `RenderingDeviceDriverWebGPU`: Main rendering interface implementation
- `RenderingContextDriverWebGPU`: Context and surface management
- Resource management using PagedAllocator for WebGPU objects
- SPIR-V to WGSL conversion using Dawn/Tint

### Next Steps

1. Complete framebuffer and attachment management
2. Implement proper vertex format handling
3. Add uniform set and bind group support
4. Integrate with Godot's scene rendering pipeline
5. Add comprehensive testing and optimization

## Performance Considerations

- Build times: ~6 minutes with -j16 on typical development machine
- WebGPU overhead: Minimal for basic operations, more significant for complex scenes
- Browser compatibility: Chrome has best WebGPU support currently

## References

- [WebGPU Specification](https://gpuweb.github.io/gpuweb/)
- [Dawn WebGPU Implementation](https://dawn.googlesource.com/dawn)
- [Tint Shader Compiler](https://dawn.googlesource.com/tint)
- [Emscripten WebGPU Port](https://emscripten.org/docs/porting/multimedia_and_graphics/webgpu.html)
