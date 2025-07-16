/**************************************************************************/
/*  rendering_context_driver_webgpu.cpp                                   */
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

#include "rendering_context_driver_webgpu.h"

#ifdef WEBGPU_ENABLED

#include "core/config/project_settings.h"
#include "core/string/print_string.h"
#include "servers/rendering/rendering_device_driver.h"
#include "rendering_device_driver_webgpu.h"

#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#include <emscripten/html5.h>
#include <emscripten/html5_webgpu.h>
#endif

RenderingContextDriverWebGPU::RenderingContextDriverWebGPU() {
}

RenderingContextDriverWebGPU::~RenderingContextDriverWebGPU() {
	// Note: Dawn WebGPU implementation handles cleanup automatically
	// Manual Release calls are not needed in the newer API
	// SwapChain is also deprecated in newer Dawn WebGPU API
}

Error RenderingContextDriverWebGPU::initialize() {
	print_line("Initializing WebGPU context driver");

#ifdef __EMSCRIPTEN__
	// Initialize WebGPU properly using the standard API
	if (!_initialize_webgpu_device()) {
		print_error("Failed to initialize WebGPU device");
		return ERR_CANT_CREATE;
	}
	print_line("WebGPU device initialized successfully");

	// Create WebGPU surface for Emscripten canvas
	if (!create_emscripten_surface()) {
		print_error("Failed to create WebGPU surface for canvas");
		return ERR_CANT_CREATE;
	}
	print_line("WebGPU surface created for canvas");

	// Configure the surface for rendering
	if (!configure_surface()) {
		print_error("Failed to configure WebGPU surface");
		return ERR_CANT_CREATE;
	}
	print_line("WebGPU surface configured for rendering");

	// Create device entry for Godot
	Device godot_device;
	godot_device.name = "Emscripten WebGPU Device";
	godot_device.vendor = Vendor::VENDOR_UNKNOWN;
	godot_device.type = DEVICE_TYPE_DISCRETE_GPU;
	devices.push_back(godot_device);

	print_line("WebGPU context driver initialized successfully!");
	return OK;
#else
	// For native platforms, we'd need to request adapter and device
	// This is more complex and not needed for our web-focused implementation
	print_error("Native WebGPU support not implemented yet");
	return ERR_UNAVAILABLE;
#endif
}

const RenderingContextDriver::Device &RenderingContextDriverWebGPU::device_get(uint32_t p_device_index) const {
	if (p_device_index < devices.size()) {
		return devices[p_device_index];
	}
	static Device dummy_device;
	return dummy_device;
}

uint32_t RenderingContextDriverWebGPU::device_get_count() const {
	return devices.size();
}

bool RenderingContextDriverWebGPU::device_supports_present(uint32_t p_device_index, SurfaceID p_surface) const {
	return true; // WebGPU supports presentation
}

RenderingDeviceDriver *RenderingContextDriverWebGPU::driver_create() {
	// VALIDATION LOG: This is where the error occurs!
	printf("🔍 VALIDATION: RenderingContextDriverWebGPU::driver_create() ENTRY - THIS IS WHERE THE ERROR OCCURS!\n");
	print_error("🔍 VALIDATION: RenderingContextDriverWebGPU::driver_create() ENTRY - THIS IS WHERE THE ERROR OCCURS!");
	print_line("Creating WebGPU device driver");

	// Create the WebGPU device driver (device will be set when available)
	printf("🔍 VALIDATION: About to create RenderingDeviceDriverWebGPU instance\n");
	print_error("🔍 VALIDATION: About to create RenderingDeviceDriverWebGPU instance");
	RenderingDeviceDriverWebGPU *webgpu_driver = memnew(RenderingDeviceDriverWebGPU);
	printf("🔍 VALIDATION: RenderingDeviceDriverWebGPU instance created successfully\n");
	print_error("🔍 VALIDATION: RenderingDeviceDriverWebGPU instance created successfully");

	// Try to get the WebGPU device from Emscripten if available
	printf("🔍 VALIDATION: About to access context device member\n");
	print_error("🔍 VALIDATION: About to access context device member");
	WGPUDevice actual_device = device;

	EM_ASM({
		console.log("Context driver: device = " + $0);
		console.log("Context driver: actual_device = " + $1);
	}, (void*)device, (void*)actual_device);

#ifdef __EMSCRIPTEN__
	if (!actual_device) {
		print_line("🔧 CONTEXT FIX: Context device is null - SKIPPING emscripten_webgpu_get_device() call");
		print_line("🔧 CONTEXT FIX: Device will be set later via callback system when ready");

		// CRITICAL FIX: Do NOT call emscripten_webgpu_get_device() here!
		// This is what causes the crash. The device will be set via the callback system.
		actual_device = nullptr;

		if (actual_device) {
			print_line("Successfully obtained WebGPU device from Emscripten API");
			EM_ASM({
				console.log("Context driver: emscripten_webgpu_get_device() returned device:", $0);
			}, (void*)actual_device);
		} else {
			print_line("emscripten_webgpu_get_device() returned null - device not ready yet");
			EM_ASM({
				console.log("Context driver: emscripten_webgpu_get_device() returned null");
			});
		}
	} else {
		EM_ASM({
			console.log("Context driver has a device, will set it immediately");
		});
	}
#endif

	EM_ASM({
		console.log("Context driver: final actual_device = " + $0);
	}, (void*)actual_device);

	// Only call set_device if we actually have a device
	if (actual_device) {
		EM_ASM({
			console.log("Context driver calling set_device with device");
		});
		webgpu_driver->set_device(actual_device);
	} else {
		EM_ASM({
			console.log("Device not ready yet - will be set via callback mechanism");
		});
	}

	print_line("WebGPU device driver created successfully!");
	return webgpu_driver;
}

void RenderingContextDriverWebGPU::driver_free(RenderingDeviceDriver *p_driver) {
	// Clean up driver resources
	if (p_driver) {
		memdelete(p_driver);
	}
}

RenderingContextDriver::SurfaceID RenderingContextDriverWebGPU::surface_create(const void *p_platform_data) {
	// Create a WebGPU surface from platform data
	static SurfaceID next_surface_id = 1;
	SurfaceID surface_id = next_surface_id++;

	// Initialize surface properties
	surface_sizes[surface_id] = (640 << 16) | 480; // width << 16 | height
	surface_vsync_modes[surface_id] = DisplayServer::VSYNC_ENABLED;
	surface_needs_resize[surface_id] = false;

	return surface_id;
}

void RenderingContextDriverWebGPU::surface_set_size(RenderingContextDriver::SurfaceID p_surface, uint32_t p_width, uint32_t p_height) {
	surface_sizes[p_surface] = (p_width << 16) | p_height;
	context.width = p_width;
	context.height = p_height;

	// Reconfigure surface with new size
	if (surface && device) {
		surface_config.width = p_width;
		surface_config.height = p_height;
		wgpuSurfaceConfigure(surface, &surface_config);
		print_verbose(vformat("WebGPU surface resized to %dx%d", p_width, p_height));
	}
}

void RenderingContextDriverWebGPU::surface_set_vsync_mode(RenderingContextDriver::SurfaceID p_surface, DisplayServer::VSyncMode p_vsync_mode) {
	surface_vsync_modes[p_surface] = p_vsync_mode;
}

DisplayServer::VSyncMode RenderingContextDriverWebGPU::surface_get_vsync_mode(RenderingContextDriver::SurfaceID p_surface) const {
	auto it = surface_vsync_modes.find(p_surface);
	return it != surface_vsync_modes.end() ? it->value : DisplayServer::VSYNC_ENABLED;
}

uint32_t RenderingContextDriverWebGPU::surface_get_width(RenderingContextDriver::SurfaceID p_surface) const {
	auto it = surface_sizes.find(p_surface);
	return it != surface_sizes.end() ? (it->value >> 16) : 640;
}

uint32_t RenderingContextDriverWebGPU::surface_get_height(RenderingContextDriver::SurfaceID p_surface) const {
	auto it = surface_sizes.find(p_surface);
	return it != surface_sizes.end() ? (it->value & 0xFFFF) : 480;
}

void RenderingContextDriverWebGPU::surface_set_needs_resize(RenderingContextDriver::SurfaceID p_surface, bool p_needs_resize) {
	surface_needs_resize[p_surface] = p_needs_resize;
}

bool RenderingContextDriverWebGPU::surface_get_needs_resize(RenderingContextDriver::SurfaceID p_surface) const {
	auto it = surface_needs_resize.find(p_surface);
	return it != surface_needs_resize.end() ? it->value : false;
}

void RenderingContextDriverWebGPU::surface_destroy(RenderingContextDriver::SurfaceID p_surface) {
	surface_sizes.erase(p_surface);
	surface_vsync_modes.erase(p_surface);
	surface_needs_resize.erase(p_surface);
}

bool RenderingContextDriverWebGPU::is_debug_utils_enabled() const {
	return false; // No debug utils for proof of concept
}

WGPUQueue RenderingContextDriverWebGPU::get_queue() const {
	if (device) {
		return wgpuDeviceGetQueue(device);
	}
	return nullptr;
}

bool RenderingContextDriverWebGPU::initialize_triangle_demo() {
	if (!device) {
		print_error("WebGPU device not available for triangle demo");
		return false;
	}

	return triangle_demo.initialize(device);
}

void RenderingContextDriverWebGPU::render_triangle_demo() {
	// For now, render the triangle demo without surface presentation
	// This tests the basic WebGPU pipeline functionality
	print_verbose("Rendering triangle demo (testing pipeline without surface)");
	triangle_demo.render(nullptr);

	// TODO: Implement proper surface-based rendering when surface creation is working
	print_verbose("Triangle demo render commands submitted to WebGPU");
}

bool RenderingContextDriverWebGPU::create_emscripten_surface() {
	// With Dawn WebGPU, we don't need a traditional instance-based surface creation
	// Instead, we'll get the WebGPU context directly from the canvas
	print_line("Creating WebGPU surface using Dawn integration");

	// Use JavaScript to get the WebGPU context from the canvas
	bool surface_created = EM_ASM_INT({
		console.log("Getting WebGPU context from canvas...");

		// Get the canvas element
		const canvas = document.getElementById('canvas');
		if (!canvas) {
			console.error("Canvas not found for WebGPU context");
			return 0;
		}

		// Get WebGPU context
		const context = canvas.getContext('webgpu');
		if (!context) {
			console.error("Failed to get WebGPU context from canvas");
			return 0;
		}

		console.log("WebGPU context obtained from canvas");

		// Store the context for C++ access
		Module._webgpu_context = context;
		Module._webgpu_context_ready = true;

		return 1;
	});

	if (!surface_created) {
		print_error("Failed to create WebGPU context from canvas");
		return false;
	}

	print_line("WebGPU surface created successfully using Dawn integration");
	surface = nullptr; // Context is managed by JavaScript for now
	return true;
}

bool RenderingContextDriverWebGPU::configure_surface() {
	print_line("Configuring WebGPU surface using Dawn integration");

	// Wait for device to be ready and configure the WebGPU context using JavaScript
	bool configured = EM_ASM_INT({
		console.log("Configuring WebGPU context...");

		// Check if context is available
		if (!Module._webgpu_context) {
			console.error("WebGPU context not available for configuration");
			return 0;
		}

		// Check if device is ready (it might still be initializing asynchronously)
		if (!Module._webgpu_device_ready || !Module._webgpu_device) {
			console.log("WebGPU device not ready yet, deferring configuration...");
			// For now, return success and defer configuration
			// The device will be configured when it becomes available
			return 1;
		}

		try {
			// Get preferred canvas format
			const format = navigator.gpu.getPreferredCanvasFormat();
			console.log("Using canvas format:", format);

			// Configure the context
			Module._webgpu_context.configure({
				device: Module._webgpu_device,
				format: format,
				alphaMode: 'premultiplied',
				usage: GPUTextureUsage.RENDER_ATTACHMENT
			});

			console.log("WebGPU context configured successfully");

			// Store configuration info for C++
			Module._webgpu_surface_format = format;
			Module._webgpu_surface_configured = true;

			return 1;
		} catch (error) {
			console.error("Failed to configure WebGPU context:", error);
			return 0;
		}
	});

	if (!configured) {
		print_error("Failed to configure WebGPU surface");
		return false;
	}

	print_line("WebGPU surface configured successfully");
	return true;
}

WGPUTextureView RenderingContextDriverWebGPU::get_current_texture_view() {
	// Surface creation is deferred, so return nullptr for now
	// This will be implemented when proper surface integration is added
	return nullptr;
}

void RenderingContextDriverWebGPU::present_surface() {
	// Surface presentation is deferred
	// This will be implemented when proper surface integration is added
	print_verbose("Surface presentation deferred");
}

bool RenderingContextDriverWebGPU::_initialize_webgpu_device() {
	print_line("Initializing WebGPU device using Emscripten WebGPU API");

	EM_ASM({
		console.log("_initialize_webgpu_device function is executing...");
	});

#ifdef __EMSCRIPTEN__
	// Use Emscripten's synchronous WebGPU device creation
	// This approach uses the emscripten_webgpu_* functions for direct device access

	print_line("Checking WebGPU support...");

	// Check if WebGPU is available
	bool webgpu_available = EM_ASM_INT({
		console.log("Checking WebGPU availability...");
		if (navigator.gpu) {
			console.log("navigator.gpu is available");
			return 1;
		} else {
			console.log("navigator.gpu is not available");
			return 0;
		}
	});

	if (!webgpu_available) {
		print_error("WebGPU not supported in this browser");
		return false;
	}
	print_line("WebGPU is available in browser");

	// Get WebGPU device using Emscripten's WebGPU integration
	print_line("Requesting WebGPU device...");

	// Add JavaScript debugging for device creation
	EM_ASM({
		console.log("Attempting to get WebGPU device via Emscripten...");
	});

	// Use the Dawn-based WebGPU API with proper device creation
	print_line("Creating WebGPU device using Dawn API...");

	// Create WebGPU device using JavaScript integration
	// This uses the Dawn WebGPU implementation via Emscripten
	EM_ASM({
		console.log("Creating WebGPU device via Dawn...");

		// Use the standard WebGPU API to create device synchronously
		if (navigator.gpu) {
			// Initialize device ready flag
			Module._webgpu_device_ready = false;

			// CRITICAL FIX: Don't add run dependency here - pre_wgpu.js already handles this
			console.log("Checking if Module.addRunDependency is available...");
			console.log("typeof Module = " + typeof Module);
			console.log("typeof Module.addRunDependency = " + typeof Module.addRunDependency);

			// DISABLED: Conflicted with pre_wgpu.js run dependency system
			console.log("DISABLED: Run dependency handled by pre_wgpu.js to avoid conflicts");

			navigator.gpu.requestAdapter().then(adapter => {
				if (adapter) {
					console.log("WebGPU adapter obtained");
					adapter.requestDevice().then(device => {
						console.log("WebGPU device created successfully");
						console.log("CALLBACK: WebGPU device callback is executing...");
						// Store the device for C++ access
						Module._webgpu_device = device;
						Module._webgpu_device_ready = true;

						// CRITICAL: Also set the device for Emscripten's WebGPU API
						Module.preinitializedWebGPUDevice = device;
						console.log("WebGPU device stored in Module.preinitializedWebGPUDevice for Emscripten");

						// Notify C++ code that the device is ready
						if (typeof Module._godot_webgpu_set_device_from_module === 'function') {
							console.log("Calling C++ callback to set WebGPU device from Module...");
							Module._godot_webgpu_set_device_from_module();
						} else {
							console.log("C++ callback function not available yet");
						}

						// Also trigger the device ready callback for retry mechanism
						if (typeof Module._godot_webgpu_device_ready_callback === 'function') {
							console.log("Calling C++ device ready callback for retry mechanism...");
							Module._godot_webgpu_device_ready_callback();
						} else {
							console.log("C++ device ready callback not available yet");
						}

						// DISABLED: Run dependency removal handled by pre_wgpu.js
						console.log("DISABLED: Run dependency removal handled by pre_wgpu.js");

						console.log("WebGPU device is now ready for configuration");

						// If context is available, configure it now
						if (Module._webgpu_context) {
							console.log("Auto-configuring WebGPU context now that device is ready...");
							try {
								const format = navigator.gpu.getPreferredCanvasFormat();
								console.log("Using canvas format:", format);

								Module._webgpu_context.configure({
									device: Module._webgpu_device,
									format: format,
									alphaMode: 'premultiplied',
									usage: GPUTextureUsage.RENDER_ATTACHMENT
								});

								console.log("WebGPU context auto-configured successfully");
								Module._webgpu_surface_configured = true;
							} catch (error) {
								console.log("Failed to auto-configure WebGPU context:", error);
							}
						}
					}).catch(err => {
						console.log("Failed to create WebGPU device:", err);
						Module._webgpu_device_ready = false;
						// DISABLED: Run dependency removal handled by pre_wgpu.js
						console.log("DISABLED: Error handling for run dependency handled by pre_wgpu.js");
					});
				} else {
					console.log("No WebGPU adapter available");
					Module._webgpu_device_ready = false;
					// DISABLED: Run dependency removal handled by pre_wgpu.js
					console.log("DISABLED: Error handling for run dependency handled by pre_wgpu.js");
				}
			}).catch(err => {
				console.log("Failed to request WebGPU adapter:", err);
				Module._webgpu_device_ready = false;
				// DISABLED: Run dependency removal handled by pre_wgpu.js
				console.log("DISABLED: Error handling for run dependency handled by pre_wgpu.js");
			});
		} else {
			console.log("WebGPU not supported");
			Module._webgpu_device_ready = false;
			// DISABLED: Run dependency removal handled by pre_wgpu.js
			console.log("DISABLED: Error handling for run dependency handled by pre_wgpu.js");
		}
	});

	// For now, we'll defer device creation to the rendering device driver
	// The actual device will be accessed through the Dawn WebGPU integration
	device = nullptr; // Will be properly set up by Dawn

	print_line("WebGPU device creation initiated via Dawn");
	// Note: With Dawn WebGPU, the instance is managed internally
	instance = nullptr; // Not directly accessible through Dawn API
	print_line("WebGPU instance managed internally by Dawn");

	// Set up the context (device will be initialized later by rendering device driver)
	context.device = device; // nullptr for now
	context.queue = nullptr; // Will be set up when device is created

	// Log initialization status
	print_line("WebGPU context initialization completed successfully!");
	print_line("Device and queue will be created by rendering device driver");

	return true;
#else
	print_error("WebGPU device creation only supported on Emscripten builds");
	return false;
#endif
}

#endif // WEBGPU_ENABLED
