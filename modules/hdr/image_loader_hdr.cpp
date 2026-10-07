/**************************************************************************/
/*  image_loader_hdr.cpp                                                  */
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

#include "image_loader_hdr.h"

Error ImageLoaderHDR::load_image(Ref<Image> p_image, Ref<FileAccess> f, BitField<ImageFormatLoader::LoaderFlags> p_flags, float p_scale) {
	String header = f->get_token();

	ERR_FAIL_COND_V_MSG(header != "#?RADIANCE" && header != "#?RGBE", ERR_FILE_UNRECOGNIZED, "Unsupported header information in HDR: " + header + ".");

	while (true) {
		String line = f->get_line();
		ERR_FAIL_COND_V(f->eof_reached(), ERR_FILE_UNRECOGNIZED);
		if (line.is_empty()) { // empty line indicates end of header
			break;
		}
		if (line.begins_with("FORMAT=")) { // leave option to implement other commands
			ERR_FAIL_COND_V_MSG(line != "FORMAT=32-bit_rle_rgbe", ERR_FILE_UNRECOGNIZED, "Only 32-bit_rle_rgbe is supported for HDR files.");
		} else if (!line.begins_with("#")) { // not comment
			WARN_PRINT("Ignoring unsupported header information in HDR: " + line + ".");
		}
	}

	String token = f->get_token();

	ERR_FAIL_COND_V(token != "-Y", ERR_FILE_CORRUPT);

	int64_t height_value = f->get_token().to_int();

	token = f->get_token();

	ERR_FAIL_COND_V(token != "+X", ERR_FILE_CORRUPT);

	int64_t width_value = f->get_line().to_int();
	ERR_FAIL_COND_V(width_value <= 0 || width_value > Image::MAX_WIDTH, ERR_FILE_CORRUPT);
	ERR_FAIL_COND_V(height_value <= 0 || height_value > Image::MAX_HEIGHT, ERR_FILE_CORRUPT);
	ERR_FAIL_COND_V(width_value * height_value > Image::MAX_PIXELS, ERR_FILE_CORRUPT);
	int width = width_value;
	int height = height_value;
	uint64_t data_size = width_value * height_value * sizeof(uint32_t);

	Vector<uint8_t> imgdata;

	Error allocation_error = imgdata.resize(data_size);
	ERR_FAIL_COND_V(allocation_error != OK, allocation_error);

	{
		uint8_t *ptr = imgdata.ptrw();

		uint8_t temp_read_data[128];

		if (width < 8 || width >= 32768) {
			// Read flat data

			ERR_FAIL_COND_V(f->get_buffer(ptr, data_size) != data_size, ERR_FILE_CORRUPT);
		} else {
			// Read RLE-encoded data

			for (int j = 0; j < height; ++j) {
				uint8_t scanline_header[4];
				ERR_FAIL_COND_V(f->get_buffer(scanline_header, 4) != 4, ERR_FILE_CORRUPT);
				int c1 = scanline_header[0];
				int c2 = scanline_header[1];
				int len = scanline_header[2];
				if (c1 != 2 || c2 != 2 || (len & 0x80)) {
					// not run-length encoded, so we have to actually use THIS data as a decoded
					// pixel (note this can't be a valid pixel--one of RGB must be >= 128)

					ptr[(j * width) * 4 + 0] = uint8_t(c1);
					ptr[(j * width) * 4 + 1] = uint8_t(c2);
					ptr[(j * width) * 4 + 2] = uint8_t(len);
					ptr[(j * width) * 4 + 3] = scanline_header[3];

					uint64_t remaining_size = (width - 1) * 4;
					ERR_FAIL_COND_V(f->get_buffer(&ptr[(j * width + 1) * 4], remaining_size) != remaining_size, ERR_FILE_CORRUPT);
					continue;
				}
				len <<= 8;
				len |= scanline_header[3];

				ERR_FAIL_COND_V_MSG(len != width, ERR_FILE_CORRUPT, "Invalid decoded scanline length, corrupt HDR.");

				for (int k = 0; k < 4; ++k) {
					int i = 0;
					while (i < width) {
						uint8_t packet;
						ERR_FAIL_COND_V(f->get_buffer(&packet, 1) != 1, ERR_FILE_CORRUPT);
						int count = packet > 128 ? packet - 128 : packet;
						ERR_FAIL_COND_V(count == 0 || count > width - i, ERR_FILE_CORRUPT);
						if (packet > 128) {
							// Run
							uint8_t value;
							ERR_FAIL_COND_V(f->get_buffer(&value, 1) != 1, ERR_FILE_CORRUPT);
							for (int z = 0; z < count; ++z) {
								ptr[(j * width + i++) * 4 + k] = uint8_t(value);
							}
						} else {
							// Dump
							ERR_FAIL_COND_V(f->get_buffer(temp_read_data, count) != (uint64_t)count, ERR_FILE_CORRUPT);
							for (int z = 0; z < count; ++z) {
								ptr[(j * width + i++) * 4 + k] = temp_read_data[z];
							}
						}
					}
				}
			}
		}

		const bool force_linear = p_flags & FLAG_FORCE_LINEAR;

		//convert
		for (int i = 0; i < width * height; i++) {
			int e = ptr[3] - 128;

			if (force_linear || (e < -15 || e > 15)) {
				float exp = std::pow(2.0f, e);
				Color c(ptr[0] * exp / 255.0, ptr[1] * exp / 255.0, ptr[2] * exp / 255.0);

				if (force_linear) {
					c = c.srgb_to_linear();
				}

				*(uint32_t *)ptr = c.to_rgbe9995();
			} else {
				// https://github.com/george-steel/rgbe-rs/blob/e7cc33b7f42b4eb3272c166dac75385e48687c92/src/types.rs#L123-L129
				uint32_t e5 = (uint32_t)(e + 15);
				*(uint32_t *)ptr = ((e5 << 27) | ((uint32_t)ptr[2] << 19) | ((uint32_t)ptr[1] << 10) | ((uint32_t)ptr[0] << 1));
			}

			ptr += 4;
		}
	}

	p_image->set_data(width, height, false, Image::FORMAT_RGBE9995, imgdata);

	return OK;
}

void ImageLoaderHDR::get_recognized_extensions(List<String> *p_extensions) const {
	p_extensions->push_back("hdr");
}

ImageLoaderHDR::ImageLoaderHDR() {
}
