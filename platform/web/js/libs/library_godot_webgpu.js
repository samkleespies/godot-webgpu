/**************************************************************************/
/*  library_godot_webgpu.js                                               */
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

const GodotWebGPU = {
	$GodotWebGPU__deps: ['$GodotRuntime'],
	$GodotWebGPU: {
		adapter: null,
		device: null,
		context: null,
		canvas: null,

		isSupported: function () {
			return 'gpu' in navigator;
		},

		init: function (canvasId) {
			GodotRuntime.print('🔧 CRITICAL DEBUG: GodotWebGPU.init() function CALLED with canvasId:', canvasId);

			if (!GodotWebGPU.isSupported()) {
				GodotRuntime.print('🔧 CRITICAL DEBUG: WebGPU is NOT supported in this browser');
				GodotRuntime.error('WebGPU is not supported in this browser');
				return false;
			}

			GodotRuntime.print('🔧 CRITICAL DEBUG: WebGPU is supported, proceeding with initialization');

			try {
				// Remove # prefix if present (canvasId might be "#canvas" or "canvas")
				const cleanId = canvasId.startsWith('#') ? canvasId.substring(1) : canvasId;

				// Get the canvas
				GodotWebGPU.canvas = document.getElementById(cleanId);
				if (!GodotWebGPU.canvas) {
					GodotRuntime.error('Canvas not found with ID:', cleanId, '(original:', canvasId, ')');
					return false;
				}

				GodotRuntime.print('✅ Canvas found with ID:', cleanId);

				// CRITICAL FIX: Use the pre-created device from pre_wgpu.js
				// The device should already be available due to run dependency system
				if (Module.preinitializedWebGPUDevice) {
					GodotRuntime.print('✅ Using pre-initialized WebGPU device from Module.preinitializedWebGPUDevice');

					// Ensure device is also stored in GodotWebGPU object
					GodotWebGPU.device = Module.preinitializedWebGPUDevice;
					GodotWebGPU.queue = Module.preinitializedWebGPUDevice.queue;

					return true;
				}

				// CRITICAL FIX: If we get here, the run dependency system failed
				// This means the device creation is still in progress or failed
				// We should NOT block the main thread with a busy wait as that prevents Promises from resolving
				GodotRuntime.error('❌ No pre-initialized WebGPU device found - run dependency system failed');
				GodotRuntime.error('❌ Device creation may still be in progress asynchronously');
				GodotRuntime.error('❌ Falling back to OpenGL - WebGPU will be available later if creation succeeds');

				return false;
			} catch (error) {
				GodotRuntime.error('WebGPU initialization failed:', error);
				return false;
			}
		},

		getDevice: function () {
			return GodotWebGPU.device;
		},

		getContext: function () {
			return GodotWebGPU.context;
		},

		getCurrentTexture: function () {
			if (!GodotWebGPU.context) {
				return null;
			}
			return GodotWebGPU.context.getCurrentTexture();
		},

		present: function () {
			// WebGPU automatically presents when the current texture is used
			// No explicit present call needed
		},
	},

	godot_js_webgpu_is_supported__sig: 'i',
	godot_js_webgpu_is_supported: function () {
		return GodotWebGPU.isSupported() ? 1 : 0;
	},

	godot_js_webgpu_init__sig: 'ii',
	godot_js_webgpu_init: function (canvasIdPtr) {
		GodotRuntime.print('🔧 CRITICAL DEBUG: godot_js_webgpu_init() JavaScript function CALLED!');
		const canvasId = GodotRuntime.parseString(canvasIdPtr);
		GodotRuntime.print('🔧 CRITICAL DEBUG: Canvas ID parsed:', canvasId);
		const result = GodotWebGPU.init(canvasId);
		GodotRuntime.print('🔧 CRITICAL DEBUG: GodotWebGPU.init() returned:', result);
		return result ? 1 : 0;
	},

	godot_js_webgpu_get_device__sig: 'i',
	godot_js_webgpu_get_device: function () {
		// Return a pointer/handle to the WebGPU device
		// This would need to be handled by the WebGPU implementation
		return GodotWebGPU.device ? 1 : 0;
	},

	godot_js_webgpu_present__sig: 'v',
	godot_js_webgpu_present: function () {
		GodotWebGPU.present();
	},
};

autoAddDeps(GodotWebGPU, '$GodotWebGPU');
mergeInto(LibraryManager.library, GodotWebGPU);
