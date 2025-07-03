/**************************************************************************/
/*  webgpu_triangle_demo.h                                                */
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

#pragma once

#ifdef WEBGPU_ENABLED

// For Emscripten builds, use Emscripten's WebGPU headers directly
#ifdef __EMSCRIPTEN__
#include <emscripten/html5_webgpu.h>
// Note: Emscripten provides WebGPU types directly, no need for Dawn headers
#else
#include <webgpu/webgpu.h>
#endif

#include "core/string/ustring.h"

class WebGPUTriangleDemo {
private:
	WGPUDevice device = nullptr;
	WGPUQueue queue = nullptr;
	WGPUBuffer vertex_buffer = nullptr;
	WGPUShaderModule vertex_shader = nullptr;
	WGPUShaderModule fragment_shader = nullptr;
	WGPURenderPipeline render_pipeline = nullptr;

	// Hard-coded WGSL shaders for triangle demo
	static const char* vertex_shader_source;
	static const char* fragment_shader_source;

	// Triangle vertex data (position + color)
	struct Vertex {
		float position[3];
		float color[3];
	};

	static const Vertex triangle_vertices[3];

public:
	WebGPUTriangleDemo();
	~WebGPUTriangleDemo();

	bool initialize(WGPUDevice p_device);
	void render(WGPUTextureView p_target_view);
	void cleanup();

private:
	WGPUShaderModule create_shader_module(const char* p_source);
	bool create_vertex_buffer();
	bool create_render_pipeline();
};

#endif // WEBGPU_ENABLED
