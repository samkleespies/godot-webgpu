#!/usr/bin/env python3
"""Exercise production Vulkan descriptor-building loops without a GPU.

The driver translation unit is compiled by the normal platform matrix. This
standalone harness extracts its actual packing loops, uses real Vulkan structs
and a std::vector adapter for LocalVector, and consumes every pointer after the
loops under ASan/UBSan. It does not emulate a Vulkan driver or render a frame.
"""

import os
import subprocess
import tempfile
from pathlib import Path

root = Path(__file__).resolve().parents[2]
source = (root / "drivers/vulkan/rendering_device_driver_vulkan.cpp").read_text()
commons = (root / "servers/rendering/rendering_device_commons.h").read_text()
start = source.index("RDD::UniformSetID RenderingDeviceDriverVulkan::uniform_set_create(")
uniform = source[source.index("\n", start) + 1 : source.index("\n\t// Need a descriptor pool.", start)]
start = source.index("RDD::RenderPassID RenderingDeviceDriverVulkan::render_pass_create(")
subpass = source[source.index("\n", start) + 1 : source.index("\n\tVkSubpassDependency2KHR *", start)]
start = source.index("\tVkPipelineShaderStageCreateInfo *vk_pipeline_stages = ALLOCA_ARRAY")
stages = source[start : source.index("\n\tconst RenderPassInfo *render_pass", start)]
start = commons.index("\tenum UniformType {")
enum = commons[start : commons.index("\n\t};", start) + 4]

preamble = r"""
#include <vulkan/vulkan.h>
#include <cassert>
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <vector>
#include <iostream>
#include <alloca.h>
#include <pthread.h>
#define ALLOCA_ARRAY(T, n) static_cast<T *>(alloca(sizeof(T) * (n)))
#define ALLOCA_SINGLE(T) static_cast<T *>(alloca(sizeof(T)))
#define ERR_FAIL_COND_V_MSG(cond, value, msg) do { assert(!(cond)); } while (0)
#define DEV_ASSERT(cond) assert(cond)
#define CRASH_NOW_MSG(msg) abort()
template <typename T> struct LocalVector : std::vector<T> {
  using std::vector<T>::vector;
  T *ptr() { return this->data(); }
  const T *ptr() const { return this->data(); }
};
struct ID { uintptr_t id; };
struct TextureInfo { VkImageView vk_view; bool transient = false; };
struct BufferInfo { VkBuffer vk_buffer; VkDeviceSize size; VkBufferView vk_view; };
"""
fixtures = r"""
struct BoundUniform { UniformType type; uint32_t binding; LocalVector<ID> ids; bool immutable_sampler = false; };
struct DescriptorSetPoolKey { uint32_t uniform_type[UNIFORM_TYPE_MAX] = {}; };
constexpr uint32_t MAX_UNIFORM_POOL_ELEMENT = 65535;
struct Attachment { int format=0, samples=0, load_op=0, store_op=0, stencil_load_op=0, stencil_store_op=0, initial_layout=0, final_layout=0; };
struct AttachmentReference { static constexpr uint32_t UNUSED=0xffffffff; uint32_t attachment=UNUSED; VkImageLayout layout=VK_IMAGE_LAYOUT_GENERAL; };
struct Subpass {
  LocalVector<AttachmentReference> input_references, color_references, resolve_references;
  AttachmentReference depth_stencil_reference, fragment_shading_rate_reference;
  LocalVector<uint32_t> preserve_attachments;
  struct { uint32_t x=1, y=1; } fragment_shading_rate_texel_size;
};
static const VkFormat RD_TO_VK_FORMAT[] = { VK_FORMAT_R8G8B8A8_UNORM };
static const VkImageLayout RD_TO_VK_LAYOUT[] = { VK_IMAGE_LAYOUT_GENERAL };
static VkSampleCountFlagBits _ensure_supported_sample_count(int) { return VK_SAMPLE_COUNT_1_BIT; }
static void _attachment_reference_to_vk(AttachmentReference r, VkAttachmentReference2KHR *out) {
  *out = {}; out->sType = VK_STRUCTURE_TYPE_ATTACHMENT_REFERENCE_2_KHR;
  out->attachment = r.attachment; out->layout = r.layout;
}
struct PipelineSpecializationConstant { uint32_t constant_id; uint32_t int_value; };
struct ShaderInfo { LocalVector<VkPipelineShaderStageCreateInfo> vk_stages_create_info; };
static void check_uniforms(const LocalVector<BoundUniform> &p_uniforms) {
  bool linear_descriptor_pools_enabled=false, immutable_samplers_enabled=true;
  int p_linear_pool_index=-1;
"""
uniform_checks = r"""
  uint32_t write = 0;
  for (const auto &uniform : p_uniforms) {
    if (uniform.immutable_sampler) continue;
    auto &entry = vk_writes[write++];
    assert(entry.dstBinding == uniform.binding);
    assert(entry.descriptorCount == 1);
    if (entry.pImageInfo) {
      const auto &image = entry.pImageInfo[0];
      if (uniform.type == UNIFORM_TYPE_SAMPLER || uniform.type == UNIFORM_TYPE_SAMPLER_WITH_TEXTURE || uniform.type == UNIFORM_TYPE_SAMPLER_WITH_TEXTURE_BUFFER) assert(image.sampler == (VkSampler)11);
      if (uniform.type == UNIFORM_TYPE_TEXTURE || uniform.type == UNIFORM_TYPE_IMAGE || uniform.type == UNIFORM_TYPE_INPUT_ATTACHMENT || uniform.type == UNIFORM_TYPE_SAMPLER_WITH_TEXTURE) assert(image.imageView == (VkImageView)22);
    }
    if (entry.pBufferInfo) { assert(entry.pBufferInfo[0].buffer == (VkBuffer)33); assert(entry.pBufferInfo[0].range == 4096); }
    if (entry.pTexelBufferView) assert(entry.pTexelBufferView[0] == (VkBufferView)44);
  }
  assert(write == writes_amount);
}
static void check_subpasses(const LocalVector<Subpass> &p_subpasses) {
  LocalVector<Attachment> p_attachments;
  uint32_t p_view_count = 2;
  struct { bool attachment_supported=true; } fsr_capabilities;
"""
subpass_checks = r"""
  for (uint32_t i=0; i<p_subpasses.size(); ++i) {
    const auto &s = vk_subpasses[i];
    assert(s.viewMask == 3);
    assert(s.pInputAttachments[0].attachment == i);
    assert(s.pColorAttachments[0].attachment == i+1);
    assert(s.pResolveAttachments[0].attachment == i+2);
    assert(s.pDepthStencilAttachment->attachment == i+3);
    const auto *fsr = static_cast<const VkFragmentShadingRateAttachmentInfoKHR *>(s.pNext);
    assert(fsr->pFragmentShadingRateAttachment->attachment == i+4);
    assert(fsr->shadingRateAttachmentTexelSize.width == 1);
  }
}
static void check_stages(uint32_t count) {
  ShaderInfo shader; shader.vk_stages_create_info.resize(count);
  ShaderInfo *shader_info = &shader;
  LocalVector<PipelineSpecializationConstant> p_specialization_constants;
  p_specialization_constants.push_back({7, 123}); p_specialization_constants.push_back({19, 456});
"""
stage_checks = r"""
  for (uint32_t i=0; i<count; ++i) {
    const auto *info = vk_pipeline_stages[i].pSpecializationInfo;
    assert(info->mapEntryCount == 2);
    assert(info->dataSize == 2 * sizeof(PipelineSpecializationConstant));
    for (uint32_t j=0; j<2; ++j) {
      const auto &entry = info->pMapEntries[j];
      assert(entry.constantID == p_specialization_constants[j].constant_id);
      assert(entry.size == sizeof(uint32_t));
      uint32_t value; memcpy(&value, static_cast<const char *>(info->pData) + entry.offset, sizeof value);
      assert(value == p_specialization_constants[j].int_value);
    }
  }
}
static void *run(void *) {
  TextureInfo texture{(VkImageView)22}; BufferInfo buffer{(VkBuffer)33, 4096, (VkBufferView)44};
  LocalVector<BoundUniform> uniforms;
  for (uint32_t i=0; i<2000; ++i) for (int type=0; type<UNIFORM_TYPE_MAX; ++type) {
    if (type == UNIFORM_TYPE_IMAGE_BUFFER) continue;
    BoundUniform u{static_cast<UniformType>(type), static_cast<uint32_t>(uniforms.size()), {}};
    switch (type) {
      case UNIFORM_TYPE_SAMPLER: u.ids.push_back({11}); break;
      case UNIFORM_TYPE_SAMPLER_WITH_TEXTURE: u.ids.push_back({11}); u.ids.push_back({reinterpret_cast<uintptr_t>(&texture)}); break;
      case UNIFORM_TYPE_TEXTURE: case UNIFORM_TYPE_IMAGE: case UNIFORM_TYPE_INPUT_ATTACHMENT: u.ids.push_back({reinterpret_cast<uintptr_t>(&texture)}); break;
      case UNIFORM_TYPE_SAMPLER_WITH_TEXTURE_BUFFER: u.ids.push_back({11}); [[fallthrough]];
      default: u.ids.push_back({reinterpret_cast<uintptr_t>(&buffer)});
    }
    uniforms.push_back(u);
  }
  BoundUniform immutable{UNIFORM_TYPE_SAMPLER, 99999, {{11}}, true}; uniforms.push_back(immutable);
  check_uniforms({}); check_uniforms(uniforms);
  LocalVector<Subpass> subpasses; subpasses.resize(3000);
  for (uint32_t i=0; i<subpasses.size(); ++i) {
    auto &s=subpasses[i]; s.input_references.push_back({i}); s.color_references.push_back({i+1});
    s.resolve_references.push_back({i+2}); s.depth_stencil_reference.attachment=i+3;
    s.fragment_shading_rate_reference.attachment=i+4;
  }
  check_subpasses({}); check_subpasses(subpasses); check_stages(0); check_stages(6);
  return nullptr;
}
int main() {
  // A deliberately bounded worker stack exposes allocations that accumulate in loops.
  pthread_attr_t attr; assert(pthread_attr_init(&attr) == 0);
  assert(pthread_attr_setstacksize(&attr, 1024 * 1024) == 0);
  pthread_t worker; assert(pthread_create(&worker, &attr, run, nullptr) == 0);
  assert(pthread_join(worker, nullptr) == 0); pthread_attr_destroy(&attr);
  std::cout << "Vulkan descriptor, subpass and specialization pointer lifetimes pass\n";
}
"""
with tempfile.TemporaryDirectory(prefix="godot-vulkan-") as temp:
    cpp = Path(temp) / "test.cpp"
    binary = Path(temp) / "test"
    cpp.write_text(
        preamble + enum + fixtures + uniform + uniform_checks + subpass + subpass_checks + stages + stage_checks
    )
    subprocess.run(
        [
            os.environ.get("CXX", "clang++"),
            "-std=c++17",
            "-O1",
            "-g",
            "-fsanitize=address,undefined",
            "-fno-omit-frame-pointer",
            "-pthread",
            "-I",
            str(root / "thirdparty/vulkan/include"),
            str(cpp),
            "-o",
            str(binary),
        ],
        check=True,
    )
    subprocess.run([str(binary)], check=True)
