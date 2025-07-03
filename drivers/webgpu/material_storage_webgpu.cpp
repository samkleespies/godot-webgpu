/**************************************************************************/
/*  material_storage_webgpu.cpp                                          */
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

#ifdef WEBGPU_ENABLED

#include "material_storage_webgpu.h"
#include "rendering_device_driver_webgpu.h"
#include "core/config/project_settings.h"

namespace WebGPU {

// ----- SHADER DATA IMPLEMENTATION -----

bool ShaderData::is_parameter_texture(const StringName &p_param) const {
	for (int i = 0; i < texture_uniforms.size(); i++) {
		if (texture_uniforms[i].name == p_param) {
			return true;
		}
	}
	return false;
}

ShaderData::~ShaderData() {
	// WebGPU handles cleanup automatically
	if (vertex_module) {
		wgpuShaderModuleRelease(vertex_module);
	}
	if (fragment_module) {
		wgpuShaderModuleRelease(fragment_module);
	}
	if (compute_module) {
		wgpuShaderModuleRelease(compute_module);
	}
}

// ----- MATERIAL DATA IMPLEMENTATION -----

MaterialData::~MaterialData() {
	if (uniform_buffer) {
		wgpuBufferRelease(uniform_buffer);
	}
	if (bind_group) {
		wgpuBindGroupRelease(bind_group);
	}
}

void MaterialData::update_uniform_buffer(const HashMap<StringName, ShaderLanguage::ShaderNode::Uniform> &p_uniforms, 
										  const uint32_t *p_uniform_offsets, 
										  const HashMap<StringName, Variant> &p_parameters, 
										  uint8_t *p_buffer, 
										  uint32_t p_buffer_size) {
	// Implementation similar to other backends but adapted for WebGPU
	// This handles converting Godot parameters to uniform buffer data
	
	for (const KeyValue<StringName, Variant> &E : p_parameters) {
		if (p_uniforms.has(E.key)) {
			const ShaderLanguage::ShaderNode::Uniform &uniform = p_uniforms[E.key];
			uint32_t offset = p_uniform_offsets[uniform.order];
			
			if (offset >= p_buffer_size) {
				continue; // Skip if offset is out of bounds
			}
			
			// Convert Variant to appropriate uniform data
			switch (uniform.type) {
				case ShaderLanguage::TYPE_BOOL: {
					bool value = E.value;
					uint32_t bool_value = value ? 1 : 0;
					memcpy(p_buffer + offset, &bool_value, sizeof(uint32_t));
				} break;
				case ShaderLanguage::TYPE_INT: {
					int value = E.value;
					memcpy(p_buffer + offset, &value, sizeof(int));
				} break;
				case ShaderLanguage::TYPE_UINT: {
					uint32_t value = E.value;
					memcpy(p_buffer + offset, &value, sizeof(uint32_t));
				} break;
				case ShaderLanguage::TYPE_FLOAT: {
					float value = E.value;
					memcpy(p_buffer + offset, &value, sizeof(float));
				} break;
				case ShaderLanguage::TYPE_VEC2: {
					Vector2 value = E.value;
					memcpy(p_buffer + offset, &value, sizeof(Vector2));
				} break;
				case ShaderLanguage::TYPE_VEC3: {
					Vector3 value = E.value;
					memcpy(p_buffer + offset, &value, sizeof(Vector3));
				} break;
				case ShaderLanguage::TYPE_VEC4: {
					if (E.value.get_type() == Variant::COLOR) {
						Color value = E.value;
						memcpy(p_buffer + offset, &value, sizeof(Color));
					} else {
						Vector4 value = E.value;
						memcpy(p_buffer + offset, &value, sizeof(Vector4));
					}
				} break;
				case ShaderLanguage::TYPE_MAT2: {
					// Handle 2x2 matrix
					Transform2D value = E.value;
					float mat2[4] = { value.columns[0].x, value.columns[0].y, value.columns[1].x, value.columns[1].y };
					memcpy(p_buffer + offset, mat2, sizeof(mat2));
				} break;
				case ShaderLanguage::TYPE_MAT3: {
					// Handle 3x3 matrix
					Basis value = E.value;
					float mat3[9];
					for (int i = 0; i < 3; i++) {
						for (int j = 0; j < 3; j++) {
							mat3[i * 3 + j] = value.rows[i][j];
						}
					}
					memcpy(p_buffer + offset, mat3, sizeof(mat3));
				} break;
				case ShaderLanguage::TYPE_MAT4: {
					// Handle 4x4 matrix
					if (E.value.get_type() == Variant::TRANSFORM3D) {
						Transform3D value = E.value;
						Projection proj = Projection(value);
						memcpy(p_buffer + offset, proj.columns, sizeof(proj.columns));
					} else if (E.value.get_type() == Variant::PROJECTION) {
						Projection value = E.value;
						memcpy(p_buffer + offset, value.columns, sizeof(value.columns));
					}
				} break;
				default:
					// Handle other types as needed
					break;
			}
		}
	}
	
	uniform_buffer_dirty = true;
}

void MaterialData::update_textures(const HashMap<StringName, Variant> &p_parameters, 
									const HashMap<StringName, HashMap<int, RID>> &p_default_textures, 
									const Vector<ShaderCompiler::GeneratedCode::Texture> &p_texture_uniforms, 
									RID *p_textures) {
	// Update texture cache based on material parameters
	texture_cache.resize(p_texture_uniforms.size());
	
	for (int i = 0; i < p_texture_uniforms.size(); i++) {
		const ShaderCompiler::GeneratedCode::Texture &texture_uniform = p_texture_uniforms[i];
		RID texture_rid;
		
		// Check if parameter is set
		if (p_parameters.has(texture_uniform.name)) {
			Variant param = p_parameters[texture_uniform.name];
			if (param.get_type() == Variant::RID) {
				texture_rid = param;
			}
		}
		
		// Use default texture if no parameter set
		if (!texture_rid.is_valid() && p_default_textures.has(texture_uniform.name)) {
			const HashMap<int, RID> &default_tex = p_default_textures[texture_uniform.name];
			if (default_tex.has(0)) {
				texture_rid = default_tex[0];
			}
		}
		
		texture_cache.write[i] = texture_rid;
		if (p_textures) {
			p_textures[i] = texture_rid;
		}
	}
	
	texture_cache_dirty = true;
	bind_group_dirty = true; // Textures changed, need to rebuild bind group
}

void MaterialData::update_parameters_internal(const HashMap<StringName, Variant> &p_parameters, 
											   bool p_uniform_dirty, 
											   bool p_textures_dirty, 
											   const HashMap<StringName, ShaderLanguage::ShaderNode::Uniform> &p_uniforms, 
											   const uint32_t *p_uniform_offsets, 
											   const Vector<ShaderCompiler::GeneratedCode::Texture> &p_texture_uniforms, 
											   const HashMap<StringName, HashMap<int, RID>> &p_default_texture_params, 
											   uint32_t p_ubo_size) {
	// Resize uniform buffer if needed
	if (ubo_data.size() != (int)p_ubo_size) {
		p_uniform_dirty = true;
		ubo_data.resize(p_ubo_size);
		if (ubo_data.size()) {
			memset(ubo_data.ptrw(), 0, ubo_data.size());
		}
		uniform_buffer_dirty = true;
	}
	
	// Update uniform buffer data
	if (p_uniform_dirty && ubo_data.size()) {
		update_uniform_buffer(p_uniforms, p_uniform_offsets, p_parameters, ubo_data.ptrw(), ubo_data.size());
	}
	
	// Update texture data
	if (p_textures_dirty) {
		update_textures(p_parameters, p_default_texture_params, p_texture_uniforms, nullptr);
	}
}

// ----- CANVAS SHADER DATA -----

CanvasShaderData::CanvasShaderData() {
	// Initialize canvas-specific defaults
}

CanvasShaderData::~CanvasShaderData() {
	// Cleanup handled by base class
}

// ----- CANVAS MATERIAL DATA -----

void CanvasMaterialData::update_parameters(const HashMap<StringName, Variant> &p_parameters, bool p_uniform_dirty, bool p_textures_dirty) {
	if (shader_data) {
		update_parameters_internal(p_parameters, p_uniform_dirty, p_textures_dirty, 
								   shader_data->uniforms, shader_data->ubo_offsets.ptr(), 
								   shader_data->texture_uniforms, shader_data->default_texture_params, 
								   shader_data->ubo_size);
	}
}

void CanvasMaterialData::bind_uniforms() {
	// WebGPU binding will be handled by the rendering device driver
	// This is called during rendering to ensure uniforms are bound
}

CanvasMaterialData::~CanvasMaterialData() {
	// Cleanup handled by base class
}

// ----- SCENE SHADER DATA -----

SceneShaderData::SceneShaderData() {
	// Initialize scene-specific defaults
}

SceneShaderData::~SceneShaderData() {
	// Cleanup handled by base class
}

// ----- SCENE MATERIAL DATA -----

void SceneMaterialData::set_render_priority(int p_priority) {
	priority = p_priority;
}

void SceneMaterialData::set_next_pass(RID p_pass) {
	next_pass = p_pass;
}

void SceneMaterialData::update_parameters(const HashMap<StringName, Variant> &p_parameters, bool p_uniform_dirty, bool p_textures_dirty) {
	if (shader_data) {
		update_parameters_internal(p_parameters, p_uniform_dirty, p_textures_dirty, 
								   shader_data->uniforms, shader_data->ubo_offsets.ptr(), 
								   shader_data->texture_uniforms, shader_data->default_texture_params, 
								   shader_data->ubo_size);
	}
}

void SceneMaterialData::bind_uniforms() {
	// WebGPU binding will be handled by the rendering device driver
}

SceneMaterialData::~SceneMaterialData() {
	// Cleanup handled by base class
}

// ----- SKY SHADER DATA -----

SkyShaderData::SkyShaderData() {
	// Initialize sky-specific defaults
}

SkyShaderData::~SkyShaderData() {
	// Cleanup handled by base class
}

// ----- SKY MATERIAL DATA -----

void SkyMaterialData::update_parameters(const HashMap<StringName, Variant> &p_parameters, bool p_uniform_dirty, bool p_textures_dirty) {
	uniform_set_updated = true;
	if (shader_data) {
		update_parameters_internal(p_parameters, p_uniform_dirty, p_textures_dirty, 
								   shader_data->uniforms, shader_data->ubo_offsets.ptr(), 
								   shader_data->texture_uniforms, shader_data->default_texture_params, 
								   shader_data->ubo_size);
	}
}

void SkyMaterialData::bind_uniforms() {
	// WebGPU binding will be handled by the rendering device driver
}

SkyMaterialData::~SkyMaterialData() {
	// Cleanup handled by base class
}

// ----- COMPUTE SHADER DATA -----

ComputeShaderData::ComputeShaderData() {
	local_group_size.resize(3);
	local_group_size.write[0] = 1;
	local_group_size.write[1] = 1;
	local_group_size.write[2] = 1;
}

ComputeShaderData::~ComputeShaderData() {
	// Cleanup handled by base class
}

// ----- MATERIAL DATA CREATION FUNCTIONS -----

MaterialData *create_canvas_material_func(ShaderData *p_shader) {
	CanvasMaterialData *material_data = memnew(CanvasMaterialData);
	material_data->shader_data = static_cast<CanvasShaderData *>(p_shader);
	return material_data;
}

MaterialData *create_scene_material_func(ShaderData *p_shader) {
	SceneMaterialData *material_data = memnew(SceneMaterialData);
	material_data->shader_data = static_cast<SceneShaderData *>(p_shader);
	return material_data;
}

MaterialData *create_sky_material_func(ShaderData *p_shader) {
	SkyMaterialData *material_data = memnew(SkyMaterialData);
	material_data->shader_data = static_cast<SkyShaderData *>(p_shader);
	return material_data;
}

// ----- SHADER DATA CREATION FUNCTIONS -----

ShaderData *create_canvas_shader_func() {
	CanvasShaderData *shader_data = memnew(CanvasShaderData);
	return shader_data;
}

ShaderData *create_scene_shader_func() {
	SceneShaderData *shader_data = memnew(SceneShaderData);
	return shader_data;
}

ShaderData *create_sky_shader_func() {
	SkyShaderData *shader_data = memnew(SkyShaderData);
	return shader_data;
}

ShaderData *create_compute_shader_func() {
	ComputeShaderData *shader_data = memnew(ComputeShaderData);
	return shader_data;
}

} // namespace WebGPU

#endif // WEBGPU_ENABLED
