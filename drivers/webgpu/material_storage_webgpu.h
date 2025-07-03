/**************************************************************************/
/*  material_storage_webgpu.h                                            */
/**************************************************************************/
/*                         This file is part of:                         */
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
#else
#include <webgpu/webgpu.h>
#endif

#include "core/templates/hash_map.h"
#include "core/templates/rid.h"
#include "servers/rendering/shader_compiler.h"
#include "servers/rendering/shader_language.h"
#include "servers/rendering/storage/material_storage.h"

namespace WebGPU {

// Base shader data for WebGPU
struct ShaderData {
	RID self;
	String name;
	
	// Shader reflection data
	HashMap<StringName, ShaderLanguage::ShaderNode::Uniform> uniforms;
	Vector<uint32_t> ubo_offsets;
	Vector<ShaderCompiler::GeneratedCode::Texture> texture_uniforms;
	HashMap<StringName, HashMap<int, RID>> default_texture_params;
	uint32_t ubo_size = 0;
	
	// WebGPU-specific data
	WGPUShaderModule vertex_module = nullptr;
	WGPUShaderModule fragment_module = nullptr;
	WGPUShaderModule compute_module = nullptr;
	
	String vertex_wgsl;
	String fragment_wgsl;
	String compute_wgsl;
	
	// Shader stage information
	Vector<RenderingDeviceCommons::ShaderStage> stages;
	HashMap<RenderingDeviceCommons::ShaderStage, RenderingDeviceCommons::ShaderReflection> stage_reflection;
	
	virtual bool is_parameter_texture(const StringName &p_param) const;
	virtual ~ShaderData();
};

// Base material data for WebGPU
struct MaterialData {
	RID self;
	
	// Uniform buffer data
	Vector<uint8_t> ubo_data;
	WGPUBuffer uniform_buffer = nullptr;
	bool uniform_buffer_dirty = true;
	
	// Texture data
	Vector<RID> texture_cache;
	bool texture_cache_dirty = true;
	
	// WebGPU bind group for this material
	WGPUBindGroup bind_group = nullptr;
	bool bind_group_dirty = true;
	
	// Material properties
	virtual void set_render_priority(int p_priority) = 0;
	virtual void set_next_pass(RID p_pass) = 0;
	virtual void update_parameters(const HashMap<StringName, Variant> &p_parameters, bool p_uniform_dirty, bool p_textures_dirty) = 0;
	virtual void bind_uniforms() = 0;
	virtual ~MaterialData();
	
protected:
	// Helper methods for updating parameters
	void update_uniform_buffer(const HashMap<StringName, ShaderLanguage::ShaderNode::Uniform> &p_uniforms, 
							   const uint32_t *p_uniform_offsets, 
							   const HashMap<StringName, Variant> &p_parameters, 
							   uint8_t *p_buffer, 
							   uint32_t p_buffer_size);
	
	void update_textures(const HashMap<StringName, Variant> &p_parameters, 
						 const HashMap<StringName, HashMap<int, RID>> &p_default_textures, 
						 const Vector<ShaderCompiler::GeneratedCode::Texture> &p_texture_uniforms, 
						 RID *p_textures);
	
	void update_parameters_internal(const HashMap<StringName, Variant> &p_parameters, 
									bool p_uniform_dirty, 
									bool p_textures_dirty, 
									const HashMap<StringName, ShaderLanguage::ShaderNode::Uniform> &p_uniforms, 
									const uint32_t *p_uniform_offsets, 
									const Vector<ShaderCompiler::GeneratedCode::Texture> &p_texture_uniforms, 
									const HashMap<StringName, HashMap<int, RID>> &p_default_texture_params, 
									uint32_t p_ubo_size);
};

// Canvas (2D) shader data
struct CanvasShaderData : public ShaderData {
	enum BlendMode {
		BLEND_MODE_MIX,
		BLEND_MODE_ADD,
		BLEND_MODE_SUB,
		BLEND_MODE_MUL,
		BLEND_MODE_PMALPHA,
		BLEND_MODE_DISABLED,
		BLEND_MODE_LCD,
	};
	
	BlendMode blend_mode = BLEND_MODE_MIX;
	bool uses_screen_texture = false;
	bool uses_screen_uv = false;
	bool uses_time = false;
	
	CanvasShaderData();
	virtual ~CanvasShaderData();
};

// Canvas (2D) material data
struct CanvasMaterialData : public MaterialData {
	CanvasShaderData *shader_data = nullptr;
	
	virtual void set_render_priority(int p_priority) override {}
	virtual void set_next_pass(RID p_pass) override {}
	virtual void update_parameters(const HashMap<StringName, Variant> &p_parameters, bool p_uniform_dirty, bool p_textures_dirty) override;
	virtual void bind_uniforms() override;
	virtual ~CanvasMaterialData();
};

// Scene (3D) shader data
struct SceneShaderData : public ShaderData {
	enum BlendMode {
		BLEND_MODE_MIX,
		BLEND_MODE_ADD,
		BLEND_MODE_SUB,
		BLEND_MODE_MUL,
		BLEND_MODE_ALPHA_TO_COVERAGE
	};
	
	enum DepthDraw {
		DEPTH_DRAW_DISABLED,
		DEPTH_DRAW_OPAQUE,
		DEPTH_DRAW_ALWAYS
	};
	
	enum DepthTest {
		DEPTH_TEST_DISABLED,
		DEPTH_TEST_ENABLED
	};
	
	enum Cull {
		CULL_DISABLED,
		CULL_FRONT,
		CULL_BACK
	};
	
	BlendMode blend_mode = BLEND_MODE_MIX;
	DepthDraw depth_draw = DEPTH_DRAW_OPAQUE;
	DepthTest depth_test = DEPTH_TEST_ENABLED;
	Cull cull_mode = CULL_BACK;
	
	bool uses_vertex_time = false;
	bool uses_fragment_time = false;
	bool uses_screen_texture = false;
	bool uses_depth_texture = false;
	bool uses_normal_texture = false;
	bool unshaded = false;
	bool uses_world_coordinates = false;
	
	SceneShaderData();
	virtual ~SceneShaderData();
};

// Scene (3D) material data
struct SceneMaterialData : public MaterialData {
	SceneShaderData *shader_data = nullptr;
	uint64_t last_pass = 0;
	uint32_t index = 0;
	RID next_pass;
	uint8_t priority = 0;
	
	virtual void set_render_priority(int p_priority) override;
	virtual void set_next_pass(RID p_pass) override;
	virtual void update_parameters(const HashMap<StringName, Variant> &p_parameters, bool p_uniform_dirty, bool p_textures_dirty) override;
	virtual void bind_uniforms() override;
	virtual ~SceneMaterialData();
};

// Sky shader data
struct SkyShaderData : public ShaderData {
	bool uses_time = false;
	bool uses_position = false;
	bool uses_half_res = false;
	bool uses_quarter_res = false;
	
	SkyShaderData();
	virtual ~SkyShaderData();
};

// Sky material data
struct SkyMaterialData : public MaterialData {
	SkyShaderData *shader_data = nullptr;
	bool uniform_set_updated = false;
	
	virtual void set_render_priority(int p_priority) override {}
	virtual void set_next_pass(RID p_pass) override {}
	virtual void update_parameters(const HashMap<StringName, Variant> &p_parameters, bool p_uniform_dirty, bool p_textures_dirty) override;
	virtual void bind_uniforms() override;
	virtual ~SkyMaterialData();
};

// Compute shader data
struct ComputeShaderData : public ShaderData {
	Vector<uint32_t> local_group_size; // [x, y, z] workgroup size
	
	ComputeShaderData();
	virtual ~ComputeShaderData();
};

// Material data request functions
MaterialData *create_canvas_material_func(ShaderData *p_shader);
MaterialData *create_scene_material_func(ShaderData *p_shader);
MaterialData *create_sky_material_func(ShaderData *p_shader);

// Shader data creation functions
ShaderData *create_canvas_shader_func();
ShaderData *create_scene_shader_func();
ShaderData *create_sky_shader_func();
ShaderData *create_compute_shader_func();

} // namespace WebGPU

#endif // WEBGPU_ENABLED
