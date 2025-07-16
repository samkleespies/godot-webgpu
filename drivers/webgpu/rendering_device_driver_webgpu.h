/**************************************************************************/
/*  rendering_device_driver_webgpu.h                                      */
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

#include "servers/rendering/rendering_device_driver.h"

#ifdef WEBGPU_ENABLED

// Use standard WebGPU headers (Dawn-based for Emscripten with --use-port=emdawnwebgpu)
#include <webgpu/webgpu.h>

#include "core/templates/hash_map.h"
#include "core/templates/paged_allocator.h"
#include "servers/rendering/rendering_shader_container.h"
#include "servers/rendering/storage/material_storage.h"
#include "servers/rendering/renderer_geometry_instance.h"
#include "material_storage_webgpu.h"

// Removed WebGPU state enum - using synchronous initialization with pre-JS device creation

// WebGPU-specific shader container
class RenderingShaderContainerWebGPU : public RenderingShaderContainer {
	GDSOFTCLASS(RenderingShaderContainerWebGPU, RenderingShaderContainer);

public:
	static const uint32_t FORMAT_VERSION = 1;

protected:
	virtual uint32_t _format() const override { return 0x57475055; } // 'WGPU'
	virtual uint32_t _format_version() const override { return FORMAT_VERSION; }
	virtual bool _set_code_from_spirv(const Vector<RenderingDeviceCommons::ShaderStageSPIRVData> &p_spirv) override {
		// Simple implementation - just store the SPIR-V data as-is
		shaders.resize(p_spirv.size());
		for (int64_t i = 0; i < p_spirv.size(); i++) {
			shaders.write[i].shader_stage = p_spirv[i].shader_stage;
			shaders.write[i].code_compressed_bytes = p_spirv[i].spirv;
			shaders.write[i].code_compression_flags = 0;
			shaders.write[i].code_decompressed_size = p_spirv[i].spirv.size();
		}
		return true;
	}
};

// WebGPU-specific shader container format
class RenderingShaderContainerFormatWebGPU : public RenderingShaderContainerFormat {
public:
	virtual Ref<RenderingShaderContainer> create_container() const override {
		return Ref<RenderingShaderContainerWebGPU>(memnew(RenderingShaderContainerWebGPU));
	}

	virtual ShaderLanguageVersion get_shader_language_version() const override {
		return SHADER_LANGUAGE_VULKAN_VERSION_1_0;
	}

	virtual ShaderSpirvVersion get_shader_spirv_version() const override {
		return SHADER_SPIRV_VERSION_1_3;
	}
};

// Forward declarations for WebGPU material system
namespace WebGPU {
	struct ShaderData;
	struct MaterialData;
}

class RenderingDeviceDriverWebGPU : public RenderingDeviceDriver {
private:
	WGPUDevice device = nullptr;
	WGPUQueue queue = nullptr;

	// CRITICAL FIX: Deferred initialization parameters
	uint32_t deferred_device_index = 0;
	uint32_t deferred_frame_count = 0;
	bool initialization_deferred = false;

	// Removed async state management - using synchronous initialization

	// Command queue management
	struct CommandQueueInfo {
		CommandQueueFamilyID family_id;
		WGPUQueue webgpu_queue = nullptr;
		bool is_main_queue = false;
	};

	PagedAllocator<CommandQueueInfo> command_queue_allocator;

	// Semaphore management (WebGPU doesn't use traditional semaphores)
	struct SemaphoreInfo {
		uint64_t id = 0; // Simple ID for tracking
	};

	PagedAllocator<SemaphoreInfo> semaphore_allocator;

	// Fence management
	struct FenceInfo {
		uint64_t id = 0; // Simple ID for tracking
		bool signaled = false;
	};

	PagedAllocator<FenceInfo> fence_allocator;

	// Swap chain management
	struct SwapChainInfo {
		RenderingContextDriver::SurfaceID surface = RenderingContextDriver::SurfaceID();
		RenderPassID render_pass;
		DataFormat data_format = DATA_FORMAT_R8G8B8A8_UNORM;
		uint32_t width = 0;
		uint32_t height = 0;
	};

	PagedAllocator<SwapChainInfo> swap_chain_allocator;

	// Render pass management
	struct RenderPassInfo {
		Vector<Attachment> attachments;
		Vector<Subpass> subpasses;
		Vector<SubpassDependency> subpass_dependencies;
		uint32_t view_count = 1;
		AttachmentReference fragment_density_map_attachment;
	};

	PagedAllocator<RenderPassInfo> render_pass_allocator;

	// Resource management structs
	struct BufferInfo {
		WGPUBuffer buffer = nullptr;
		uint64_t size = 0;
		WGPUBufferUsageFlags usage = 0;
		bool is_mapped = false;
		uint8_t *mapped_data = nullptr;
		bool needs_write_back = false; // For emulated mapping that needs wgpuQueueWriteBuffer
	};

	struct TextureInfo {
		WGPUTexture texture = nullptr;
		WGPUTextureView view = nullptr;
		uint32_t width = 0;
		uint32_t height = 0;
		uint32_t depth = 1;
		uint32_t mip_levels = 1;
		uint32_t array_layers = 1;
		WGPUTextureFormat format = WGPUTextureFormat_Undefined;
		WGPUTextureUsageFlags usage = 0;
		bool is_shared = false; // Track if this texture shares resources with another
	};

	struct SamplerInfo {
		WGPUSampler sampler = nullptr;
	};

	struct ShaderInfo {
		WGPUShaderModule module = nullptr;
		Vector<RenderingDeviceCommons::ShaderStage> stages;
		String name;
		String wgsl_source; // Converted WGSL source code
		HashMap<RenderingDeviceCommons::ShaderStage, String> stage_sources; // Per-stage WGSL sources
		HashMap<RenderingDeviceCommons::ShaderStage, RenderingDeviceCommons::ShaderReflection> stage_reflection; // Per-stage reflection data
	};

	struct PipelineInfo {
		WGPURenderPipeline render_pipeline = nullptr;
		WGPUComputePipeline compute_pipeline = nullptr;
		ShaderID shader_id;
		bool is_compute = false;
	};

	struct CommandPoolInfo {
		CommandQueueFamilyID queue_family_id;
		CommandBufferType type;
	};

	// Push constant management (implemented using uniform buffers)
	struct PushConstantBuffer {
		WGPUBuffer buffer = nullptr;
		uint32_t size = 0;
		uint8_t *mapped_data = nullptr;
		bool is_dirty = false;
	};

	struct CommandBufferInfo {
		WGPUCommandEncoder encoder = nullptr;
		WGPURenderPassEncoder render_pass_encoder = nullptr;
		WGPUComputePassEncoder compute_pass_encoder = nullptr;
		CommandPoolID pool_id;
		bool is_recording = false;
		bool is_in_render_pass = false;
		PipelineID current_pipeline;
		PipelineID current_compute_pipeline;
		Vector<BufferID> bound_vertex_buffers;
		BufferID bound_index_buffer;
		IndexBufferFormat index_buffer_format = INDEX_BUFFER_FORMAT_UINT16;
		uint64_t index_buffer_offset = 0;

		// Push constant management
		HashMap<uint64_t, PushConstantBuffer> push_constant_buffers;
	};

	// Framebuffer management
	struct FramebufferInfo {
		WGPURenderPassDescriptor render_pass_descriptor = {};
		Vector<WGPURenderPassColorAttachment> color_attachments;
		WGPURenderPassDepthStencilAttachment depth_stencil_attachment = {};
		Vector<WGPUTextureView> color_views;
		WGPUTextureView depth_stencil_view = nullptr;
		uint32_t width = 0;
		uint32_t height = 0;
		RenderPassID render_pass_id;
		bool has_depth_stencil = false;

		// Store attachment texture IDs for validation
		Vector<TextureID> attachment_textures;
	};

	// Framebuffer allocator
	PagedAllocator<FramebufferInfo> framebuffer_allocator;

	// Vertex format management
	struct VertexFormatInfo {
		Vector<WGPUVertexAttribute> attributes;
		Vector<WGPUVertexBufferLayout> buffer_layouts;
		Vector<VertexAttribute> godot_attributes; // Store original Godot attributes for reference
		uint32_t buffer_count = 0;
	};

	// Compute pipeline management
	struct ComputePipelineInfo {
		WGPUComputePipeline pipeline = nullptr;
		ShaderID shader_id;
		String name;
		Vector<uint32_t> local_group_size; // [x, y, z] workgroup size
	};

	// Viewport data
	struct ViewportInfo {
		uint32_t width = 0;
		uint32_t height = 0;
		RID render_target;
		RID camera;
		bool is_xr = false;
		uint32_t view_count = 1;
	};

	// Uniform set management
	struct UniformSetInfo {
		WGPUBindGroup bind_group = nullptr;
		ShaderID shader_id;
		uint32_t set_index = 0;
		Vector<BoundUniform> uniforms; // Store original uniforms for reference
	};

	// Resource allocators for managing WebGPU objects
	PagedAllocator<BufferInfo> buffer_allocator;
	PagedAllocator<TextureInfo> texture_allocator;
	PagedAllocator<SamplerInfo> sampler_allocator;
	PagedAllocator<ShaderInfo> shader_allocator;
	PagedAllocator<PipelineInfo> pipeline_allocator;
	PagedAllocator<ComputePipelineInfo> compute_pipeline_allocator;
	PagedAllocator<UniformSetInfo> uniform_set_allocator;
	PagedAllocator<CommandPoolInfo> command_pool_allocator;
	PagedAllocator<CommandBufferInfo> command_buffer_allocator;

	// Simple WebGPU capabilities and limits
	Capabilities capabilities;
	MultiviewCapabilities multiview_capabilities;
	FragmentShadingRateCapabilities fragment_shading_rate_capabilities;
	FragmentDensityMapCapabilities fragment_density_map_capabilities;
	RenderingShaderContainerFormatWebGPU shader_container_format;

	// Material storage integration
	typedef WebGPU::MaterialData *(*MaterialDataRequestFunction)(WebGPU::ShaderData *);
	MaterialDataRequestFunction material_data_request_func[RS::SHADER_MAX];

	// WebGPU device reference for material operations
	WGPUDevice material_device = nullptr;

	// Scene rendering data
	WGPUBuffer transform_uniform_buffer = nullptr;
	uint32_t transform_buffer_size = 0;

	// Transform uniform structure (matches Godot's expectations)
	struct TransformUniforms {
		float world_matrix[16];      // 4x4 world transform matrix
		float normal_matrix[12];     // 3x4 normal transform matrix (inverse transpose of world)
		float model_scale = 1.0f;    // Uniform scale factor
		float _padding[3] = {0, 0, 0}; // Padding for alignment
	};

	// Light data structure (matches Godot's LightData)
	struct LightData {
		float position[3];
		float inv_radius;

		float direction[3];
		float size;

		float color[3];
		float attenuation;

		float cone_attenuation;
		float cone_angle;
		float specular_amount;
		float shadow_opacity;

		float atlas_rect[4];         // Shadow atlas rectangle
		float shadow_matrix[16];     // Shadow transform matrix
		float shadow_bias;
		float shadow_normal_bias;
		float transmittance_bias;
		float soft_shadow_size;
		float soft_shadow_scale;
		uint32_t mask;
		float volumetric_fog_energy;
		uint32_t bake_mode;
		float projector_rect[4];     // Projector texture rectangle
	};

	// Lighting system data
	WGPUBuffer directional_light_buffer = nullptr;
	WGPUBuffer omni_light_buffer = nullptr;
	WGPUBuffer spot_light_buffer = nullptr;
	uint32_t max_directional_lights = 8;
	uint32_t max_omni_lights = 256;
	uint32_t max_spot_lights = 256;

	// Camera and viewport data
	struct CameraData {
		float view_matrix[16];       // 4x4 view matrix (inverse of camera transform)
		float projection_matrix[16]; // 4x4 projection matrix
		float view_projection_matrix[16]; // Combined view-projection matrix
		float camera_position[3];    // World-space camera position
		float z_near;               // Near clipping plane
		float camera_direction[3];   // Camera forward direction
		float z_far;                // Far clipping plane
		float viewport_size[2];      // Viewport width and height
		float _padding[2];          // Padding for alignment
	};

	WGPUBuffer camera_uniform_buffer = nullptr;
	uint32_t camera_buffer_size = 0;

	HashMap<RID, ViewportInfo> viewports;

	// Post-processing pipeline data
	struct PostProcessData {
		// Tone mapping parameters
		uint32_t tonemapper = 0;     // 0=Linear, 1=Reinhard, 2=Filmic, 3=ACES, 4=AGX
		float white_point = 1.0f;
		float exposure = 1.0f;

		// BCS (Brightness/Contrast/Saturation)
		float brightness = 1.0f;
		float contrast = 1.0f;
		float saturation = 1.0f;

		// Glow parameters
		bool use_glow = false;
		float glow_intensity = 1.0f;
		uint32_t glow_mode = 0;      // 0=Mix, 1=Screen, 2=Softlight, 3=Replace

		// Color correction
		bool use_color_correction = false;
		bool convert_to_srgb = true;

		// Screen-space effects
		bool use_ssr = false;        // Screen Space Reflections
		bool use_ssao = false;       // Screen Space Ambient Occlusion

		uint32_t flags = 0;          // Combined flags for shader variants
	};

	WGPUBuffer post_process_uniform_buffer = nullptr;
	uint32_t post_process_buffer_size = 0;

	// Post-processing render targets
	HashMap<RID, RID> intermediate_targets;  // Viewport -> Intermediate render target
	HashMap<RID, RID> glow_targets;         // Viewport -> Glow render target

	// Helper methods
	void _initialize_capabilities();
	bool _initialize_webgpu();
	WGPUDevice _get_webgpu_device_from_js();
	bool _validate_webgpu_device_connection();
	void _initialize_material_storage();
	WGPUTextureFormat _godot_format_to_webgpu(RenderingDeviceCommons::DataFormat p_format);
	RenderingDeviceCommons::DataFormat _webgpu_format_to_godot(WGPUTextureFormat p_format);
	WGPUBufferUsageFlags _godot_buffer_usage_to_webgpu(BitField<BufferUsageBits> p_usage);
	WGPUTextureUsageFlags _godot_texture_usage_to_webgpu(BitField<TextureUsageBits> p_usage);

	// Material helper methods
	WGPUBuffer _create_material_uniform_buffer(uint32_t p_size);
	WGPUBindGroup _create_material_bind_group(WebGPU::MaterialData *p_material, WebGPU::ShaderData *p_shader);
	void _update_material_uniform_buffer(WebGPU::MaterialData *p_material);

	// Scene rendering helper methods
	void _render_geometry_instance(CommandBufferID p_cmd_buffer, RenderGeometryInstance *p_instance, const Transform3D &p_world_transform);
	void _render_mesh_surface(CommandBufferID p_cmd_buffer, RID p_mesh, uint32_t p_surface_index, RID p_material, const Transform3D &p_transform);
	void _setup_transform_uniforms(const Transform3D &p_transform, uint8_t *p_buffer);
	WGPUBuffer _get_or_create_transform_buffer();

	// Lighting system helper methods
	void _initialize_lighting_system();
	void _update_directional_lights(const Vector<RID> &p_lights);
	void _update_omni_lights(const Vector<RID> &p_lights);
	void _update_spot_lights(const Vector<RID> &p_lights);
	WGPUBuffer _get_or_create_light_buffer(uint32_t p_light_type, uint32_t p_max_lights);
	void _setup_light_data(RID p_light, LightData *p_data);
	void _bind_light_buffers(CommandBufferID p_cmd_buffer);

	// Camera and viewport helper methods
	void _initialize_camera_system();
	void _update_camera_data(RID p_camera, const Transform3D &p_transform, const Projection &p_projection, const Size2i &p_viewport_size);
	void _setup_camera_uniforms(const Transform3D &p_camera_transform, const Projection &p_projection, const Size2i &p_viewport_size, CameraData *p_data);
	WGPUBuffer _get_or_create_camera_buffer();
	void _bind_camera_buffer(CommandBufferID p_cmd_buffer);

	// Viewport management
	void _create_viewport(RID p_viewport, const Size2i &p_size);
	void _update_viewport_size(RID p_viewport, const Size2i &p_size);
	void _attach_camera_to_viewport(RID p_viewport, RID p_camera);
	void _set_viewport_render_target(RID p_viewport, RID p_render_target);
	ViewportInfo *_get_viewport_info(RID p_viewport);

	// Post-processing pipeline helper methods
	void _initialize_post_processing();
	void _setup_post_process_data(const PostProcessData &p_settings, uint8_t *p_buffer);
	WGPUBuffer _get_or_create_post_process_buffer();
	void _bind_post_process_buffer(CommandBufferID p_cmd_buffer);

	// Post-processing passes
	void _render_tonemap_pass(CommandBufferID p_cmd_buffer, RID p_source, RID p_destination, const PostProcessData &p_settings);
	void _render_glow_pass(CommandBufferID p_cmd_buffer, RID p_source, RID p_glow_target, const PostProcessData &p_settings);
	void _render_bcs_pass(CommandBufferID p_cmd_buffer, RID p_source, RID p_destination, const PostProcessData &p_settings);
	void _render_color_correction_pass(CommandBufferID p_cmd_buffer, RID p_source, RID p_destination, const PostProcessData &p_settings);

	// Screen-space effects
	void _render_ssr_pass(CommandBufferID p_cmd_buffer, RID p_depth, RID p_normal, RID p_destination);
	void _render_ssao_pass(CommandBufferID p_cmd_buffer, RID p_depth, RID p_normal, RID p_destination);

	// Post-processing utilities
	RID _get_or_create_intermediate_target(RID p_viewport, const Size2i &p_size);
	RID _get_or_create_glow_target(RID p_viewport, const Size2i &p_size);
	void _copy_texture(CommandBufferID p_cmd_buffer, RID p_source, RID p_destination);

	// SPIR-V to WGSL conversion helpers
	String _convert_spirv_to_wgsl(const Vector<uint8_t> &p_spirv_data, RenderingDeviceCommons::ShaderStage p_stage);
	bool _create_shader_module_from_wgsl(const String &p_wgsl_source, const String &p_name, WGPUShaderModule *r_module);

	// Shader reflection helpers - use Godot's existing ShaderReflection struct
	bool _reflect_shader_from_spirv(const Vector<uint8_t> &p_spirv_data, RenderingDeviceCommons::ShaderStage p_stage, RenderingDeviceCommons::ShaderReflection &r_reflection);

	// Framebuffer helpers
	bool _validate_framebuffer_attachments(VectorView<TextureID> p_attachments, uint32_t p_width, uint32_t p_height);
	WGPUTextureView _get_texture_view(TextureID p_texture);
	WGPUTextureFormat _get_texture_format(TextureID p_texture);

	// Vertex format helpers
	WGPUVertexFormat _godot_vertex_format_to_webgpu(RenderingDeviceCommons::DataFormat p_format);
	WGPUVertexStepMode _godot_vertex_frequency_to_webgpu(RenderingDeviceCommons::VertexFrequency p_frequency);

	// Pipeline state conversion helpers
	WGPUPrimitiveTopology _godot_primitive_to_webgpu(RenderPrimitive p_primitive);
	WGPUBlendOperation _godot_blend_op_to_webgpu(RenderingDeviceCommons::BlendOperation p_op);
	WGPUBlendFactor _godot_blend_factor_to_webgpu(RenderingDeviceCommons::BlendFactor p_factor);
	WGPUCompareFunction _godot_compare_op_to_webgpu(RenderingDeviceCommons::CompareOperator p_op);
	WGPUStencilOperation _godot_stencil_op_to_webgpu(RenderingDeviceCommons::StencilOperation p_op);
	WGPUCullMode _godot_cull_mode_to_webgpu(RenderingDeviceCommons::PolygonCullMode p_cull_mode);
	WGPUFrontFace _godot_front_face_to_webgpu(RenderingDeviceCommons::PolygonFrontFace p_front_face);

	// Pipeline state setup helpers
	void _setup_rasterization_state(WGPUPrimitiveState &r_primitive_state, const PipelineRasterizationState &p_rasterization_state);
	void _setup_depth_stencil_state(WGPUDepthStencilState &r_depth_stencil_state, const PipelineDepthStencilState &p_depth_stencil_state);
	void _setup_color_blend_state(WGPUColorTargetState &r_color_target, const PipelineColorBlendState &p_blend_state, uint32_t p_attachment_index);

public:
	// RenderingDeviceDriver interface implementation
	virtual Error initialize(uint32_t p_device_index, uint32_t p_frame_count) override;

	// CRITICAL FIX: Callback-based initialization methods
	Error start_deferred_initialization(uint32_t p_device_index, uint32_t p_frame_count);
	void complete_initialization();

	// WebGPU-specific methods
	void set_device(WGPUDevice p_device);

	// Callback method for when WebGPU device is ready
	void on_webgpu_device_ready();

	// JavaScript-callable function to set device when ready
	static void set_device_from_js(WGPUDevice p_device);

	// Minimal WebGPU implementation - just enough to get it working
	// Most methods will be stubs that return dummy values for proof of concept

	// ----- BUFFERS -----
	virtual BufferID buffer_create(uint64_t p_size, BitField<BufferUsageBits> p_usage, MemoryAllocationType p_allocation_type) override;
	virtual bool buffer_set_texel_format(BufferID p_buffer, RenderingDeviceCommons::DataFormat p_format) override;
	virtual void buffer_free(BufferID p_buffer) override;
	virtual uint64_t buffer_get_allocation_size(BufferID p_buffer) override;
	virtual uint8_t *buffer_map(BufferID p_buffer) override;
	virtual void buffer_unmap(BufferID p_buffer) override;
	virtual uint64_t buffer_get_device_address(BufferID p_buffer) override;

	// ----- TEXTURES -----
	virtual TextureID texture_create(const TextureFormat &p_format, const TextureView &p_view) override;
	virtual TextureID texture_create_from_extension(uint64_t p_native_texture, TextureType p_type, RenderingDeviceCommons::DataFormat p_format, uint32_t p_array_layers, bool p_depth_stencil, uint32_t p_mipmaps) override;
	virtual TextureID texture_create_shared(TextureID p_original_texture, const TextureView &p_view) override;
	virtual TextureID texture_create_shared_from_slice(TextureID p_original_texture, const TextureView &p_view, TextureSliceType p_slice_type, uint32_t p_layer, uint32_t p_layers, uint32_t p_mipmap, uint32_t p_mipmaps) override;
	virtual void texture_free(TextureID p_texture) override;
	virtual uint64_t texture_get_allocation_size(TextureID p_texture) override;
	virtual void texture_get_copyable_layout(TextureID p_texture, const TextureSubresource &p_subresource, TextureCopyableLayout *r_layout) override;
	virtual uint8_t *texture_map(TextureID p_texture, const TextureSubresource &p_subresource) override;
	virtual void texture_unmap(TextureID p_texture) override;
	virtual BitField<TextureUsageBits> texture_get_usages_supported_by_format(RenderingDeviceCommons::DataFormat p_format, bool p_cpu_readable) override;
	virtual bool texture_can_make_shared_with_format(TextureID p_texture, RenderingDeviceCommons::DataFormat p_format, bool &r_raw_reinterpretation) override;

	// ----- SAMPLERS -----
	virtual SamplerID sampler_create(const SamplerState &p_state) override;
	virtual void sampler_free(SamplerID p_sampler) override;
	virtual bool sampler_is_format_supported_for_filter(RenderingDeviceCommons::DataFormat p_format, SamplerFilter p_filter) override;

	// ----- VERTEX FORMATS -----
	virtual VertexFormatID vertex_format_create(VectorView<VertexAttribute> p_vertex_attribs) override;
	virtual void vertex_format_free(VertexFormatID p_vertex_format) override;

	// ----- RENDER PASSES -----
	virtual RenderPassID render_pass_create(VectorView<Attachment> p_attachments, VectorView<Subpass> p_subpasses, VectorView<SubpassDependency> p_subpass_dependencies, uint32_t p_view_count, AttachmentReference p_fragment_density_map_attachment) override;
	virtual void render_pass_free(RenderPassID p_render_pass) override;

	// ----- FRAMEBUFFERS -----
	virtual FramebufferID framebuffer_create(RenderPassID p_render_pass, VectorView<TextureID> p_attachments, uint32_t p_width, uint32_t p_height) override;
	virtual void framebuffer_free(FramebufferID p_framebuffer) override;

	// ----- SHADERS -----
	virtual ShaderID shader_create_from_container(const Ref<RenderingShaderContainer> &p_shader_container, const Vector<ImmutableSampler> &p_immutable_samplers) override;
	ShaderID shader_create_from_bytecode(const Vector<uint8_t> &p_shader_binary, const Vector<ImmutableSampler> &p_immutable_samplers);
	virtual void shader_free(ShaderID p_shader) override;
	virtual void shader_destroy_modules(ShaderID p_shader) override;

	// ----- UNIFORM SETS -----
	virtual UniformSetID uniform_set_create(VectorView<BoundUniform> p_uniforms, ShaderID p_shader, uint32_t p_set_index, int p_linear_pool_index) override;
	virtual void uniform_set_free(UniformSetID p_uniform_set) override;

	// ----- COMMAND BUFFERS -----
	virtual CommandPoolID command_pool_create(CommandQueueFamilyID p_cmd_queue_family, CommandBufferType p_cmd_buffer_type) override;
	virtual bool command_pool_reset(CommandPoolID p_cmd_pool) override;
	virtual void command_pool_free(CommandPoolID p_cmd_pool) override;
	virtual CommandBufferID command_buffer_create(CommandPoolID p_cmd_pool) override;
	virtual bool command_buffer_begin(CommandBufferID p_cmd_buffer) override;
	virtual bool command_buffer_begin_secondary(CommandBufferID p_cmd_buffer, RenderPassID p_render_pass, uint32_t p_subpass, FramebufferID p_framebuffer) override;
	virtual void command_buffer_end(CommandBufferID p_cmd_buffer) override;
	virtual void command_buffer_execute_secondary(CommandBufferID p_cmd_buffer, VectorView<CommandBufferID> p_secondary_cmd_buffers) override;

	// ----- SWAP CHAINS -----
	virtual SwapChainID swap_chain_create(RenderingContextDriver::SurfaceID p_surface) override;
	virtual Error swap_chain_resize(CommandQueueID p_cmd_queue, SwapChainID p_swap_chain, uint32_t p_desired_framebuffer_count) override;
	virtual FramebufferID swap_chain_acquire_framebuffer(CommandQueueID p_cmd_queue, SwapChainID p_swap_chain, bool &r_resize_required) override;
	virtual RenderPassID swap_chain_get_render_pass(SwapChainID p_swap_chain) override;
	virtual RenderingDeviceCommons::DataFormat swap_chain_get_format(SwapChainID p_swap_chain) override { return RenderingDeviceCommons::DATA_FORMAT_R8G8B8A8_UNORM; }
	virtual void swap_chain_free(SwapChainID p_swap_chain) override {}

	// ----- COMMAND QUEUE -----
	virtual CommandQueueFamilyID command_queue_family_get(BitField<CommandQueueFamilyBits> p_cmd_queue_family_bits, RenderingContextDriver::SurfaceID p_surface) override;
	virtual CommandQueueID command_queue_create(CommandQueueFamilyID p_cmd_queue_family, bool p_identify_as_main_queue = false) override;
	virtual Error command_queue_execute_and_present(CommandQueueID p_cmd_queue, VectorView<SemaphoreID> p_wait_semaphores, VectorView<CommandBufferID> p_cmd_buffers, VectorView<SemaphoreID> p_cmd_semaphores, FenceID p_cmd_fence, VectorView<SwapChainID> p_swap_chains) override;
	virtual void command_queue_free(CommandQueueID p_cmd_queue) override;

	// ----- FENCES & SEMAPHORES -----
	virtual FenceID fence_create() override;
	virtual Error fence_wait(FenceID p_fence) override;
	virtual void fence_free(FenceID p_fence) override;
	virtual SemaphoreID semaphore_create() override;
	virtual void semaphore_free(SemaphoreID p_semaphore) override;

	// Essential methods that need basic implementation
	virtual String get_api_name() const override;
	virtual String get_api_version() const override;
	virtual String get_pipeline_cache_uuid() const override;
	virtual const Capabilities &get_capabilities() const override;
	virtual bool has_feature(Features p_feature) override;
	virtual uint64_t get_total_memory_used() override;
	virtual uint64_t get_lazily_memory_used() override;
	virtual uint64_t limit_get(Limit p_limit) override;
	virtual void set_object_name(ObjectType p_type, ID p_driver_id, const String &p_name) override;
	virtual uint64_t get_resource_native_handle(DriverResource p_type, ID p_driver_id) override;
	virtual const MultiviewCapabilities &get_multiview_capabilities() override;
	virtual const FragmentShadingRateCapabilities &get_fragment_shading_rate_capabilities() override;
	virtual const FragmentDensityMapCapabilities &get_fragment_density_map_capabilities() override;
	virtual const RenderingShaderContainerFormat &get_shader_container_format() const override;
	virtual void begin_segment(uint32_t p_frame_index, uint32_t p_frames_drawn) override;
	virtual void end_segment() override;

	// ----- COMMAND METHODS -----
	virtual void command_uniform_set_prepare_for_use(CommandBufferID p_cmd_buffer, UniformSetID p_uniform_set, ShaderID p_shader, uint32_t p_set_index) override {}
	virtual void command_pipeline_barrier(CommandBufferID p_cmd_buffer, BitField<PipelineStageBits> p_src_stages, BitField<PipelineStageBits> p_dst_stages, VectorView<MemoryBarrier> p_memory_barriers, VectorView<BufferBarrier> p_buffer_barriers, VectorView<TextureBarrier> p_texture_barriers) override;
	virtual void command_clear_buffer(CommandBufferID p_cmd_buffer, BufferID p_buffer, uint64_t p_offset, uint64_t p_size) override;
	virtual void command_copy_buffer(CommandBufferID p_cmd_buffer, BufferID p_src_buffer, BufferID p_dst_buffer, VectorView<BufferCopyRegion> p_regions) override;
	virtual void command_copy_texture(CommandBufferID p_cmd_buffer, TextureID p_src_texture, TextureLayout p_src_texture_layout, TextureID p_dst_texture, TextureLayout p_dst_texture_layout, VectorView<TextureCopyRegion> p_regions) override;
	virtual void command_resolve_texture(CommandBufferID p_cmd_buffer, TextureID p_src_texture, TextureLayout p_src_texture_layout, uint32_t p_src_layer, uint32_t p_src_mipmap, TextureID p_dst_texture, TextureLayout p_dst_texture_layout, uint32_t p_dst_layer, uint32_t p_dst_mipmap) override {}
	virtual void command_clear_color_texture(CommandBufferID p_cmd_buffer, TextureID p_texture, TextureLayout p_texture_layout, const Color &p_color, const TextureSubresourceRange &p_subresources) override;
	virtual void command_copy_buffer_to_texture(CommandBufferID p_cmd_buffer, BufferID p_src_buffer, TextureID p_dst_texture, TextureLayout p_dst_texture_layout, VectorView<BufferTextureCopyRegion> p_regions) override;
	virtual void command_copy_texture_to_buffer(CommandBufferID p_cmd_buffer, TextureID p_src_texture, TextureLayout p_src_texture_layout, BufferID p_dst_buffer, VectorView<BufferTextureCopyRegion> p_regions) override;

	// ----- PIPELINE METHODS -----
	virtual void pipeline_free(PipelineID p_pipeline) override;
	virtual void command_bind_push_constants(CommandBufferID p_cmd_buffer, ShaderID p_shader, uint32_t p_dst_first_index, VectorView<uint32_t> p_data) override;
	virtual bool pipeline_cache_create(const Vector<uint8_t> &p_data) override { return true; }
	virtual void pipeline_cache_free() override {}
	virtual size_t pipeline_cache_query_size() override { return 0; }
	virtual Vector<uint8_t> pipeline_cache_serialize() override { return Vector<uint8_t>(); }

	// ----- RENDER PASS COMMANDS -----
	virtual void command_begin_render_pass(CommandBufferID p_cmd_buffer, RenderPassID p_render_pass, FramebufferID p_framebuffer, CommandBufferType p_cmd_buffer_type, const Rect2i &p_rect, VectorView<RenderPassClearValue> p_clear_values) override;
	virtual void command_end_render_pass(CommandBufferID p_cmd_buffer) override;
	virtual void command_next_render_subpass(CommandBufferID p_cmd_buffer, CommandBufferType p_cmd_buffer_type) override;
	virtual void command_render_set_viewport(CommandBufferID p_cmd_buffer, VectorView<Rect2i> p_viewports) override;
	virtual void command_render_set_scissor(CommandBufferID p_cmd_buffer, VectorView<Rect2i> p_scissors) override;
	virtual void command_render_clear_attachments(CommandBufferID p_cmd_buffer, VectorView<AttachmentClear> p_attachment_clears, VectorView<Rect2i> p_rects) override;
	virtual void command_bind_render_pipeline(CommandBufferID p_cmd_buffer, PipelineID p_pipeline) override;
	virtual void command_bind_render_uniform_set(CommandBufferID p_cmd_buffer, UniformSetID p_uniform_set, ShaderID p_shader, uint32_t p_set_index) override;
	virtual void command_bind_render_uniform_sets(CommandBufferID p_cmd_buffer, VectorView<UniformSetID> p_uniform_sets, ShaderID p_shader, uint32_t p_first_set_index, uint32_t p_set_count) override;

	// ----- RENDER DRAW COMMANDS -----
	virtual void command_render_draw(CommandBufferID p_cmd_buffer, uint32_t p_vertex_count, uint32_t p_instance_count, uint32_t p_base_vertex, uint32_t p_first_instance) override;
	virtual void command_render_draw_indexed(CommandBufferID p_cmd_buffer, uint32_t p_index_count, uint32_t p_instance_count, uint32_t p_first_index, int32_t p_vertex_offset, uint32_t p_first_instance) override;
	virtual void command_render_draw_indexed_indirect(CommandBufferID p_cmd_buffer, BufferID p_indirect_buffer, uint64_t p_offset, uint32_t p_draw_count, uint32_t p_stride) override {}
	virtual void command_render_draw_indexed_indirect_count(CommandBufferID p_cmd_buffer, BufferID p_indirect_buffer, uint64_t p_offset, BufferID p_count_buffer, uint64_t p_count_buffer_offset, uint32_t p_max_draw_count, uint32_t p_stride) override {}
	virtual void command_render_draw_indirect(CommandBufferID p_cmd_buffer, BufferID p_indirect_buffer, uint64_t p_offset, uint32_t p_draw_count, uint32_t p_stride) override {}
	virtual void command_render_draw_indirect_count(CommandBufferID p_cmd_buffer, BufferID p_indirect_buffer, uint64_t p_offset, BufferID p_count_buffer, uint64_t p_count_buffer_offset, uint32_t p_max_draw_count, uint32_t p_stride) override {}
	virtual void command_render_bind_vertex_buffers(CommandBufferID p_cmd_buffer, uint32_t p_binding_count, const BufferID *p_buffers, const uint64_t *p_offsets) override;
	virtual void command_render_bind_index_buffer(CommandBufferID p_cmd_buffer, BufferID p_buffer, IndexBufferFormat p_format, uint64_t p_offset) override;
	virtual void command_render_set_blend_constants(CommandBufferID p_cmd_buffer, const Color &p_constants) override {}
	virtual void command_render_set_line_width(CommandBufferID p_cmd_buffer, float p_width) override {}

	// ----- RENDER PIPELINE -----
	virtual PipelineID render_pipeline_create(ShaderID p_shader, VertexFormatID p_vertex_format, RenderPrimitive p_render_primitive, PipelineRasterizationState p_rasterization_state, PipelineMultisampleState p_multisample_state, PipelineDepthStencilState p_depth_stencil_state, PipelineColorBlendState p_blend_state, VectorView<int32_t> p_color_attachments, BitField<PipelineDynamicStateFlags> p_dynamic_state, RenderPassID p_render_pass, uint32_t p_render_subpass, VectorView<PipelineSpecializationConstant> p_specialization_constants) override;

	// ----- COMPUTE PIPELINE -----
	virtual void command_bind_compute_pipeline(CommandBufferID p_cmd_buffer, PipelineID p_pipeline) override;
	virtual void command_bind_compute_uniform_set(CommandBufferID p_cmd_buffer, UniformSetID p_uniform_set, ShaderID p_shader, uint32_t p_set_index) override;
	virtual void command_bind_compute_uniform_sets(CommandBufferID p_cmd_buffer, VectorView<UniformSetID> p_uniform_sets, ShaderID p_shader, uint32_t p_first_set_index, uint32_t p_set_count) override;
	virtual void command_compute_dispatch(CommandBufferID p_cmd_buffer, uint32_t p_x_groups, uint32_t p_y_groups, uint32_t p_z_groups) override;
	virtual void command_compute_dispatch_indirect(CommandBufferID p_cmd_buffer, BufferID p_indirect_buffer, uint64_t p_offset) override;
	virtual PipelineID compute_pipeline_create(ShaderID p_shader, VectorView<PipelineSpecializationConstant> p_specialization_constants) override;

	// ----- QUERY METHODS -----
	virtual QueryPoolID timestamp_query_pool_create(uint32_t p_query_count) override { return QueryPoolID(); }
	virtual void timestamp_query_pool_free(QueryPoolID p_pool_id) override {}
	virtual void timestamp_query_pool_get_results(QueryPoolID p_pool_id, uint32_t p_query_count, uint64_t *r_results) override {}
	virtual uint64_t timestamp_query_result_to_time(uint64_t p_result) override { return p_result; }
	virtual void command_timestamp_query_pool_reset(CommandBufferID p_cmd_buffer, QueryPoolID p_pool_id, uint32_t p_query_count) override {}
	virtual void command_timestamp_write(CommandBufferID p_cmd_buffer, QueryPoolID p_pool_id, uint32_t p_index) override {}

	// ----- DEBUG METHODS -----
	virtual void command_begin_label(CommandBufferID p_cmd_buffer, const char *p_label_name, const Color &p_color) override {}
	virtual void command_end_label(CommandBufferID p_cmd_buffer) override {}
	virtual void command_insert_breadcrumb(CommandBufferID p_cmd_buffer, uint32_t p_data) override {}

	// Constructor/Destructor
	RenderingDeviceDriverWebGPU();
	virtual ~RenderingDeviceDriverWebGPU();

	// WebGPU specific methods
	WGPUDevice get_device() const { return device; }
	WGPUQueue get_queue() const { return queue; }
};

#endif // WEBGPU_ENABLED
