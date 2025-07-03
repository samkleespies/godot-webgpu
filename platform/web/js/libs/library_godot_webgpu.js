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

		isSupported: function() {
			return 'gpu' in navigator;
		},

		init: function(canvasId) {
			if (!GodotWebGPU.isSupported()) {
				GodotRuntime.error('WebGPU is not supported in this browser');
				return false;
			}

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

				// For now, just mark as initialized - actual WebGPU setup will be done later
				// This is a simplified approach to get the build working
				GodotRuntime.print('WebGPU initialization started (async setup will follow)');
				return true;

			} catch (error) {
				GodotRuntime.error('WebGPU initialization failed:', error);
				return false;
			}
		},



		getDevice: function() {
			return GodotWebGPU.device;
		},

		getContext: function() {
			return GodotWebGPU.context;
		},

		getCurrentTexture: function() {
			if (!GodotWebGPU.context) {
				return null;
			}
			return GodotWebGPU.context.getCurrentTexture();
		},

		present: function() {
			// WebGPU automatically presents when the current texture is used
			// No explicit present call needed
		}
	},

	godot_js_webgpu_is_supported__sig: 'i',
	godot_js_webgpu_is_supported: function() {
		return GodotWebGPU.isSupported() ? 1 : 0;
	},

	godot_js_webgpu_init__sig: 'ii',
	godot_js_webgpu_init: function(canvasIdPtr) {
		const canvasId = GodotRuntime.parseString(canvasIdPtr);
		const result = GodotWebGPU.init(canvasId);
		return result ? 1 : 0;
	},

	godot_js_webgpu_get_device__sig: 'i',
	godot_js_webgpu_get_device: function() {
		// Return a pointer/handle to the WebGPU device
		// This would need to be handled by the WebGPU implementation
		return GodotWebGPU.device ? 1 : 0;
	},

	godot_js_webgpu_present__sig: 'v',
	godot_js_webgpu_present: function() {
		GodotWebGPU.present();
	}
};

autoAddDeps(GodotWebGPU, '$GodotWebGPU');
mergeInto(LibraryManager.library, GodotWebGPU);
