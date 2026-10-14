#!/usr/bin/env python3
"""Exercise the real Linux camera decoder with ASan/UBSan and synthetic frames.

Compile the production header and translation unit against small Image, Vector,
and CameraFeed adapters. No camera hardware or rendering server is required;
the regular Linux build additionally checks the real engine integration.
"""

import os
import subprocess
import tempfile
from pathlib import Path

root = Path(__file__).resolve().parents[2]
adapters = r"""
#pragma once
#include <algorithm>
#include <cassert>
#include <cstdint>
#include <cstring>
#include <memory>
#include <vector>
#include <new>
#define ERR_FAIL_COND(condition) do { if (condition) return; } while (0)
#define ERR_FAIL_COND_MSG(condition, message) ERR_FAIL_COND(condition)
#define ERR_FAIL_NULL(pointer) ERR_FAIL_COND(!(pointer))
#define ERR_FAIL_MSG(message) return
#define CLAMP(value, low, high) std::clamp(value, low, high)
enum Error { OK, ERR_OUT_OF_MEMORY };
template <typename T> class Vector {
  std::vector<T> values;
public:
  Error resize(int64_t count) {
    if (count < 0 || count > 1000000) return ERR_OUT_OF_MEMORY;
    values.resize(count);
    return OK;
  }
  bool is_empty() const { return values.empty(); }
  int64_t size() const { return values.size(); }
  T *ptrw() { return values.data(); }
  const T *ptr() const { return values.data(); }
};
class Image {
public:
  enum { MAX_WIDTH = 1 << 24, MAX_HEIGHT = 1 << 24, MAX_PIXELS = 268435456 };
  enum Format { FORMAT_L8, FORMAT_RGB8, FORMAT_RGBA8, FORMAT_LA8 };
  Vector<uint8_t> pixels;
  void set_data(int, int, bool, Format, const Vector<uint8_t> &data) { pixels = data; }
  Error load_jpg_from_buffer(const Vector<uint8_t> &data) { pixels = data; return OK; }
};
template <typename T> class Ref {
  std::shared_ptr<T> value;
public:
  bool is_valid() const { return !!value; }
  T *operator->() { return value.get(); }
  void instantiate() { value = std::make_shared<T>(); }
  template <typename... Args> void instantiate(Args... args) { instantiate(); value->set_data(args...); }
};
class CameraFeed {
public:
  struct FeedFormat { int width = 2; int height = 1; uint32_t pixel_format = 0; } format;
  int frames = 0;
  Vector<uint8_t> pixels, chroma;
  FeedFormat get_format() const { return format; }
  void set_rgb_image(Ref<Image> image) { ++frames; pixels = image->pixels; }
  void set_ycbcr_images(Ref<Image> y, Ref<Image> uv) { ++frames; pixels = y->pixels; chroma = uv->pixels; }
};
"""

cases = r"""
#include "modules/camera/buffer_decoder.h"
#include "servers/camera/camera_feed.h"
#include <iostream>

template <typename Decoder> void reject_short_and_null() {
  CameraFeed feed;
  Decoder decoder(&feed);
  std::vector<uint8_t> short_frame(3, 128);
  decoder.decode({short_frame.data(), short_frame.size()});
  assert(feed.frames == 0);
  decoder.decode({nullptr, 4});
  assert(feed.frames == 0);
}
template <typename Decoder> void reject_invalid_dimensions(int width, int height) {
  CameraFeed feed;
  feed.format.width = width;
  feed.format.height = height;
  Decoder decoder(&feed);
  uint8_t bytes[16] = {};
  decoder.decode({bytes, sizeof(bytes)});
  assert(feed.frames == 0);
}
int main() {
  // Driver buffers may contain padding beyond the decoded image's capacity.
  // The old memcpy overflows this 8-byte destination with the 12-byte source.
  for (bool rgba : {true, false}) {
    CameraFeed feed;
    CopyBufferDecoder decoder(&feed, rgba);
    const size_t expected = rgba ? 8 : 4;
    std::vector<uint8_t> frame(expected + 4, 42);
    decoder.decode({frame.data(), frame.size()});
    assert(feed.frames == 1);
    assert(feed.pixels.size() == static_cast<int64_t>(expected));
    for (int64_t i = 0; i < feed.pixels.size(); ++i) assert(feed.pixels.ptr()[i] == 42);
    decoder.decode({frame.data(), expected - 1});
    decoder.decode({nullptr, expected});
    assert(feed.frames == 1);
  }
  reject_short_and_null<SeparateYuyvBufferDecoder>();
  reject_short_and_null<YuyvToGrayscaleBufferDecoder>();
  reject_short_and_null<YuyvToRgbBufferDecoder>();
  for (int width : {0, -1, 3, Image::MAX_WIDTH + 1}) {
    reject_invalid_dimensions<SeparateYuyvBufferDecoder>(width, 1);
    reject_invalid_dimensions<YuyvToGrayscaleBufferDecoder>(width, 1);
    reject_invalid_dimensions<YuyvToRgbBufferDecoder>(width, 1);
  }
  reject_invalid_dimensions<YuyvToRgbBufferDecoder>(65536, 65536);
  // Allocation failure must not leave a decoder that writes through null data.
  reject_invalid_dimensions<YuyvToRgbBufferDecoder>(2000, 2000);
  uint8_t yuyv[] = {16, 128, 235, 128};
  CameraFeed gray_feed;
  YuyvToGrayscaleBufferDecoder gray(&gray_feed);
  gray.decode({yuyv, sizeof(yuyv)});
  assert(gray_feed.frames == 1 && gray_feed.pixels.size() == 2);
  assert(gray_feed.pixels.ptr()[0] == 16 && gray_feed.pixels.ptr()[1] == 235);
  CameraFeed rgb_feed;
  YuyvToRgbBufferDecoder rgb(&rgb_feed);
  rgb.decode({yuyv, sizeof(yuyv)});
  assert(rgb_feed.frames == 1 && rgb_feed.pixels.size() == 6);
  for (int i = 0; i < 3; ++i) {
    assert(rgb_feed.pixels.ptr()[i] == 16);
    assert(rgb_feed.pixels.ptr()[i + 3] == 235);
  }
  CameraFeed separate_feed;
  SeparateYuyvBufferDecoder separate(&separate_feed);
  separate.decode({yuyv, sizeof(yuyv)});
  assert(separate_feed.frames == 1 && separate_feed.chroma.size() == 2);
  assert(separate_feed.pixels.ptr()[0] == 16 && separate_feed.pixels.ptr()[1] == 235);
  assert(separate_feed.chroma.ptr()[0] == 128 && separate_feed.chroma.ptr()[1] == 128);
  // Non-neutral chroma exercises signed color arithmetic under UBSan.
  uint8_t colored[] = {100, 64, 150, 192};
  rgb.decode({colored, sizeof(colored)});
  const uint8_t expected_rgb[] = {196, 76, 0, 246, 126, 21};
  assert(rgb_feed.frames == 2);
  for (int i = 0; i < 6; ++i) assert(rgb_feed.pixels.ptr()[i] == expected_rgb[i]);
  for (int height : {0, -1, Image::MAX_HEIGHT + 1}) {
    reject_invalid_dimensions<YuyvToRgbBufferDecoder>(2, height);
  }
  for (int width : {0, -1, Image::MAX_WIDTH + 1, 65536}) {
    CameraFeed feed;
    feed.format.width = width;
    feed.format.height = 65536;
    CopyBufferDecoder decoder(&feed, true);
    decoder.decode({yuyv, sizeof(yuyv)});
    assert(feed.frames == 0);
  }
  CameraFeed jpeg_feed;
  JpegBufferDecoder jpeg(&jpeg_feed);
  jpeg.decode({yuyv, sizeof(yuyv)});
  assert(jpeg_feed.frames == 1 && jpeg_feed.pixels.size() == 4);
  jpeg.decode({nullptr, 4});
  jpeg.decode({yuyv, 0});
  jpeg.decode({yuyv, SIZE_MAX});
  // The adapter rejects this allocation, preserving the previous small vector.
  jpeg.decode({yuyv, 1000001});
  assert(jpeg_feed.frames == 1);
  reject_invalid_dimensions<JpegBufferDecoder>(0, 1);
  std::cout << "Camera frame bounds and valid YUYV/RGBA output passed ASan/UBSan.\n";
}
"""

with tempfile.TemporaryDirectory(prefix="godot-camera-bounds-") as directory:
    work = Path(directory)
    for name in ["core/io/image.h", "core/templates/vector.h", "servers/camera/camera_feed.h"]:
        path = work / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text('#include "adapters.h"\n')
    (work / "adapters.h").write_text(adapters)
    (work / "test.cpp").write_text(cases)
    executable = work / "test-camera"
    subprocess.run(
        [
            os.environ.get("CXX", "clang++"),
            "-std=c++17",
            "-fsanitize=address,undefined",
            "-fno-sanitize-recover=all",
            "-g",
            "-I",
            str(work),
            "-I",
            str(root),
            str(root / "modules/camera/buffer_decoder.cpp"),
            str(work / "test.cpp"),
            "-o",
            str(executable),
        ],
        check=True,
    )
    subprocess.run([str(executable)], check=True)
