/**************************************************************************/
/*  webgpu_triangle_demo.cpp                                              */
/**************************************************************************/
/*                         This file is part of:                          */
/*                             GODOT ENGINE                               */
/*                        https://godotengine.org                         */
/**************************************************************************/
/* Copyright (c) 2014-present Godot Engine contributors (see AUTHORS.md). */
/* Copyright (c) 2007-2014 Juan Linietsky, Ariel Manzur.                  */
/*                                                                        */
/* Permission is hereby granted, free of charge, to any person obtaining  */
/* a copy of this software and associated documentation files (the        */
/* "Software"), to deal in the Software without restriction, including    */
/* without limitation the rights to use, copy, modify, merge, publish,    */
/* distribute, sublicense, and/or sell copies of the Software, and to     */
/* permit persons to whom the Software is furnished to do so, subject to  */
/* the following conditions:                                              */
/*                                                                        */
/* The above copyright notice and this permission notice shall be         */
/* included in all copies or substantial portions of the Software.        */
/*                                                                        */
/* THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,        */
/* EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF     */
/* MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. */
/* IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY   */
/* CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,   */
/* TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE      */
/* SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.                 */
/**************************************************************************/

#include "webgpu_triangle_demo.h"

#ifdef WEBGPU_ENABLED

#include "core/string/print_string.h"

// Hard-coded WGSL vertex shader
const char* WebGPUTriangleDemo::vertex_shader_source = R"(
@vertex
fn vs_main(@location(0) position: vec3<f32>, @location(1) color: vec3<f32>) -> @builtin(position) vec4<f32> {
    return vec4<f32>(position, 1.0);
}
)";

// Hard-coded WGSL fragment shader
const char* WebGPUTriangleDemo::fragment_shader_source = R"(
@fragment
fn fs_main() -> @location(0) vec4<f32> {
    return vec4<f32>(1.0, 0.0, 0.0, 1.0); // Red color
}
)";

// Triangle vertices: position (x, y, z) and color (r, g, b)
const WebGPUTriangleDemo::Vertex WebGPUTriangleDemo::triangle_vertices[3] = {
	{{ 0.0f,  0.5f, 0.0f}, {1.0f, 0.0f, 0.0f}}, // Top vertex - red
	{{-0.5f, -0.5f, 0.0f}, {0.0f, 1.0f, 0.0f}}, // Bottom left - green
	{{ 0.5f, -0.5f, 0.0f}, {0.0f, 0.0f, 1.0f}}  // Bottom right - blue
};

WebGPUTriangleDemo::WebGPUTriangleDemo() {
}

WebGPUTriangleDemo::~WebGPUTriangleDemo() {
	cleanup();
}

bool WebGPUTriangleDemo::initialize(WGPUDevice p_device) {
	device = p_device;
	if (!device) {
		print_error("WebGPU device is null");
		return false;
	}

	queue = wgpuDeviceGetQueue(device);
	if (!queue) {
		print_error("Failed to get WebGPU queue");
		return false;
	}

	// Create shaders
	vertex_shader = create_shader_module(vertex_shader_source);
	if (!vertex_shader) {
		print_error("Failed to create vertex shader");
		return false;
	}

	fragment_shader = create_shader_module(fragment_shader_source);
	if (!fragment_shader) {
		print_error("Failed to create fragment shader");
		return false;
	}

	// Create vertex buffer
	if (!create_vertex_buffer()) {
		print_error("Failed to create vertex buffer");
		return false;
	}

	// Create render pipeline
	if (!create_render_pipeline()) {
		print_error("Failed to create render pipeline");
		return false;
	}

	print_verbose("WebGPU triangle demo initialized successfully");
	return true;
}

WGPUShaderModule WebGPUTriangleDemo::create_shader_module(const char* p_source) {
	WGPUShaderModuleWGSLDescriptor wgsl_desc = {};
	wgsl_desc.chain.sType = WGPUSType_ShaderModuleWGSLDescriptor;
	wgsl_desc.code = p_source;

	WGPUShaderModuleDescriptor shader_desc = {};
	shader_desc.nextInChain = &wgsl_desc.chain;

	return wgpuDeviceCreateShaderModule(device, &shader_desc);
}

bool WebGPUTriangleDemo::create_vertex_buffer() {
	WGPUBufferDescriptor buffer_desc = {};
	buffer_desc.size = sizeof(triangle_vertices);
	buffer_desc.usage = WGPUBufferUsage_Vertex | WGPUBufferUsage_CopyDst;
	buffer_desc.mappedAtCreation = false;

	vertex_buffer = wgpuDeviceCreateBuffer(device, &buffer_desc);
	if (!vertex_buffer) {
		return false;
	}

	// Upload vertex data
	wgpuQueueWriteBuffer(queue, vertex_buffer, 0, triangle_vertices, sizeof(triangle_vertices));
	return true;
}

bool WebGPUTriangleDemo::create_render_pipeline() {
	// Vertex attributes
	WGPUVertexAttribute attributes[2] = {};
	
	// Position attribute
	attributes[0].format = WGPUVertexFormat_Float32x3;
	attributes[0].offset = 0;
	attributes[0].shaderLocation = 0;
	
	// Color attribute
	attributes[1].format = WGPUVertexFormat_Float32x3;
	attributes[1].offset = 3 * sizeof(float);
	attributes[1].shaderLocation = 1;

	// Vertex buffer layout
	WGPUVertexBufferLayout vertex_buffer_layout = {};
	vertex_buffer_layout.arrayStride = sizeof(Vertex);
	vertex_buffer_layout.stepMode = WGPUVertexStepMode_Vertex;
	vertex_buffer_layout.attributeCount = 2;
	vertex_buffer_layout.attributes = attributes;

	// Vertex state
	WGPUVertexState vertex_state = {};
	vertex_state.module = vertex_shader;
	vertex_state.entryPoint = "vs_main";
	vertex_state.bufferCount = 1;
	vertex_state.buffers = &vertex_buffer_layout;

	// Fragment state
	WGPUColorTargetState color_target = {};
	color_target.format = WGPUTextureFormat_BGRA8Unorm; // Common web format
	color_target.writeMask = WGPUColorWriteMask_All;

	WGPUFragmentState fragment_state = {};
	fragment_state.module = fragment_shader;
	fragment_state.entryPoint = "fs_main";
	fragment_state.targetCount = 1;
	fragment_state.targets = &color_target;

	// Render pipeline descriptor
	WGPURenderPipelineDescriptor pipeline_desc = {};
	pipeline_desc.vertex = vertex_state;
	pipeline_desc.fragment = &fragment_state;
	pipeline_desc.primitive.topology = WGPUPrimitiveTopology_TriangleList;
	pipeline_desc.primitive.stripIndexFormat = WGPUIndexFormat_Undefined;
	pipeline_desc.primitive.frontFace = WGPUFrontFace_CCW;
	pipeline_desc.primitive.cullMode = WGPUCullMode_None;

	// Multisample state
	pipeline_desc.multisample.count = 1;
	pipeline_desc.multisample.mask = 0xFFFFFFFF;
	pipeline_desc.multisample.alphaToCoverageEnabled = false;

	render_pipeline = wgpuDeviceCreateRenderPipeline(device, &pipeline_desc);
	return render_pipeline != nullptr;
}

void WebGPUTriangleDemo::render(WGPUTextureView p_target_view) {
	if (!render_pipeline || !vertex_buffer) {
		return;
	}

	// If no target view is provided, we can't render to anything
	if (!p_target_view) {
		print_verbose("Triangle demo: No target view provided, skipping render");
		return;
	}

	// Create command encoder
	WGPUCommandEncoderDescriptor encoder_desc = {};
	WGPUCommandEncoder encoder = wgpuDeviceCreateCommandEncoder(device, &encoder_desc);

	// Create render pass
	WGPURenderPassColorAttachment color_attachment = {};
	color_attachment.view = p_target_view;
	color_attachment.loadOp = WGPULoadOp_Clear;
	color_attachment.storeOp = WGPUStoreOp_Store;
	color_attachment.clearValue = {0.0f, 0.0f, 0.0f, 1.0f}; // Black background

	WGPURenderPassDescriptor render_pass_desc = {};
	render_pass_desc.colorAttachmentCount = 1;
	render_pass_desc.colorAttachments = &color_attachment;

	WGPURenderPassEncoder render_pass = wgpuCommandEncoderBeginRenderPass(encoder, &render_pass_desc);

	// Set pipeline and vertex buffer
	wgpuRenderPassEncoderSetPipeline(render_pass, render_pipeline);
	wgpuRenderPassEncoderSetVertexBuffer(render_pass, 0, vertex_buffer, 0, sizeof(triangle_vertices));

	// Draw triangle
	wgpuRenderPassEncoderDraw(render_pass, 3, 1, 0, 0);

	// End render pass
	wgpuRenderPassEncoderEnd(render_pass);

	// Submit commands
	WGPUCommandBufferDescriptor cmd_buffer_desc = {};
	WGPUCommandBuffer cmd_buffer = wgpuCommandEncoderFinish(encoder, &cmd_buffer_desc);
	wgpuQueueSubmit(queue, 1, &cmd_buffer);

	// Cleanup
	wgpuCommandBufferRelease(cmd_buffer);
	wgpuRenderPassEncoderRelease(render_pass);
	wgpuCommandEncoderRelease(encoder);
}

void WebGPUTriangleDemo::cleanup() {
	if (render_pipeline) {
		wgpuRenderPipelineRelease(render_pipeline);
		render_pipeline = nullptr;
	}
	if (vertex_buffer) {
		wgpuBufferRelease(vertex_buffer);
		vertex_buffer = nullptr;
	}
	if (fragment_shader) {
		wgpuShaderModuleRelease(fragment_shader);
		fragment_shader = nullptr;
	}
	if (vertex_shader) {
		wgpuShaderModuleRelease(vertex_shader);
		vertex_shader = nullptr;
	}
	if (queue) {
		wgpuQueueRelease(queue);
		queue = nullptr;
	}
}

#endif // WEBGPU_ENABLED
