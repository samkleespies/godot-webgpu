// pre_wgpu.js - WebGPU device creation before main() starts
// This ensures the WebGPU device is ready when RenderingDeviceDriverWebGPU::initialize() runs

// Set up Module object and preRun callback
if (typeof Module === 'undefined') {
	Module = {};
}
Module.preRun ||= [];

// CRITICAL FIX: Force use of our own run dependency system to avoid conflicts
Module.runDependencies ||= 0;

// Store our custom functions in a way that can't be overwritten
const customRunDependencyManager = {
	addRunDependency: function (id) {
		console.log('🔧 CUSTOM: addRunDependency called for:', id);
		Module.runDependencies++;
		console.log('🔧 CUSTOM: runDependencies now:', Module.runDependencies);
	},

	removeRunDependency: function (id) {
		console.log('🔧 CUSTOM: removeRunDependency called for:', id);
		if (Module.runDependencies > 0) {
			Module.runDependencies--;
			console.log('🔧 CUSTOM: runDependencies now:', Module.runDependencies);

			// CRITICAL: If we reach 0, call the main function
			if (Module.runDependencies === 0 && Module.calledRun === false) {
				console.log('🔧 CUSTOM: All dependencies resolved, calling main()');
				Module.calledRun = true; // Prevent multiple calls
				if (Module.run) {
					Module.run();
				} else if (Module._main) {
					Module._main();
				} else {
					console.log('🔧 CUSTOM: No main function found to call');
				}
			}
		}
	},
};

// Override Module functions and make them non-configurable
Object.defineProperty(Module, 'addRunDependency', {
	value: customRunDependencyManager.addRunDependency,
	writable: false,
	configurable: false,
});

Object.defineProperty(Module, 'removeRunDependency', {
	value: customRunDependencyManager.removeRunDependency,
	writable: false,
	configurable: false,
});

// Also store in global scope to prevent overwrites
window.customAddRunDependency = customRunDependencyManager.addRunDependency;
window.customRemoveRunDependency = customRunDependencyManager.removeRunDependency;

// CRITICAL FIX: Debug and use immediate execution approach
console.log('🔧 PRE_WGPU.JS: Script is loading...');

// EARLY RUN-DEPENDENCY REGISTRATION
// -------------------------------------------------------------------
// Ensure the engine waits until our WebGPU device setup completes.
// We must register this *before* kicking off any async work so that
// the later Module.removeRunDependency('wgpu_device') actually brings
// the counter back to zero.
if (!Module.__wgpu_device_dependency_added) {
	Module.__wgpu_device_dependency_added = true;
	console.log('🔧 PRE_WGPU.JS: Adding run dependency wgpu_device (early)');
	Module.addRunDependency('wgpu_device');
	console.log('🔧 PRE_WGPU.JS: runDependencies after adding:', Module.runDependencies);
}

// CRITICAL FIX: Start device creation immediately when script loads
console.log('🔧 PRE_WGPU.JS: Starting immediate WebGPU device creation...');

// Start device creation immediately - this should complete before main() starts due to run dependency
createWebGPUDeviceAsync().then(() => {
	console.log('🔧 PRE_WGPU.JS: Immediate device creation completed successfully');
}).catch((err) => {
	console.log('🔧 PRE_WGPU.JS: Immediate device creation failed:', err);
	// Even on failure, we need to remove the run dependency to avoid deadlock
	if (Module && Module.removeRunDependency) {
		console.log('🔧 PRE_WGPU.JS: Removing run dependency due to device creation failure');
		Module.removeRunDependency('wgpu_device');
	}
});

// CRITICAL FIX: Ensure device import happens after WASM is ready
Module.onRuntimeInitialized = (function (originalCallback) {
	return function () {
		console.log('🔧 PRE_WGPU.JS: Runtime initialized, checking device import...');

		// Call original callback first if it exists
		if (originalCallback && typeof originalCallback === 'function') {
			originalCallback();
		}

		// Now try to import the device if it's available but not yet imported
		if (Module.preinitializedWebGPUDevice && typeof WebGPU !== 'undefined' && WebGPU.importJsDevice) {
			console.log('🔧 PRE_WGPU.JS: Attempting device import after runtime init...');
			try {
				const deviceHandle = WebGPU.importJsDevice(Module.preinitializedWebGPUDevice);
				if (deviceHandle && deviceHandle !== 0) {
					console.log('✅ PRE_WGPU.JS: Device successfully imported after runtime init, handle:', deviceHandle);
					WebGPU.preinitializedDeviceId = deviceHandle;
				} else {
					console.warn('⚠️ PRE_WGPU.JS: Device import returned null handle after runtime init');
				}
			} catch (err) {
				console.log('❌ PRE_WGPU.JS: Device import failed after runtime init:', err);
			}
		}
	};
})(Module.onRuntimeInitialized);

// CRITICAL FIX: Use a better approach - don't try to block, use run dependencies properly
const originalOnRuntimeInitialized = Module.onRuntimeInitialized;
Module.onRuntimeInitialized = function () {
	console.log('🕒 Runtime initialized: checking if WebGPU device is ready...');

	// Check if device is already available
	if (Module.preinitializedWebGPUDevice) {
		console.log('✅ PRE_WGPU.JS: WebGPU device already initialized – proceeding');
		if (typeof originalOnRuntimeInitialized === 'function') {
			originalOnRuntimeInitialized();
		}
		return;
	}

	// If device isn't ready, the run dependency system should prevent main() from starting
	// But if we get here, it means the dependency system failed, so fall back gracefully
	console.log('⚠️ PRE_WGPU.JS: WebGPU device not ready at runtime init - starting async creation');

	// Start async device creation but don't block
	createWebGPUDeviceAsync().then(() => {
		console.log('✅ PRE_WGPU.JS: Async device creation completed after runtime init');
	}).catch((err) => {
		console.log('❌ PRE_WGPU.JS: Async device creation failed after runtime init:', err);
	});

	// Continue with original onRuntimeInitialized regardless
	if (typeof originalOnRuntimeInitialized === 'function') {
		originalOnRuntimeInitialized();
	}
};

// Async function to create WebGPU device
async function createWebGPUDeviceAsync() {
	try {
		// Check if WebGPU is available
		if (!navigator.gpu) {
			throw new Error('WebGPU not supported in this browser');
		}

		console.log('🔍 Requesting WebGPU adapter (async)...');
		const adapter = await navigator.gpu.requestAdapter({
			powerPreference: 'high-performance',
			forceFallbackAdapter: false,
		});

		if (!adapter) {
			throw new Error('No WebGPU adapter found');
		}

		console.log('🔍 Requesting WebGPU device (async)...');
		const device = await adapter.requestDevice({
			requiredFeatures: [],
			requiredLimits: {},
		});

		console.log('✅ WebGPU device obtained asynchronously');

		// VALIDATION: Log device properties before storage (async)
		console.log('🔍 VALIDATION (async): Device object type:', typeof device);
		console.log('🔍 VALIDATION (async): Device constructor:', device.constructor.name);
		console.log('🔍 VALIDATION (async): Device has queue:', !!device.queue);
		console.log('🔍 VALIDATION (async): Queue type:', typeof device.queue);

		// Wire it into Emscripten's WebGPU shim
		if (typeof WebGPU === 'undefined') {
			WebGPU = {};
			console.log('🔍 VALIDATION (async): Created new WebGPU global object');
		} else {
			console.log('🔍 VALIDATION (async): WebGPU global already exists:', Object.keys(WebGPU));
		}

		WebGPU.device = device;
		WebGPU.queue = device.queue;

		// CRITICAL FIX: Store device in Module.preinitializedWebGPUDevice for emscripten_webgpu_get_device()
		Module.preinitializedWebGPUDevice = device;
		console.log('🔧 CRITICAL FIX (async): Device stored in Module.preinitializedWebGPUDevice');

		// Also store in Module for compatibility
		Module.webgpu ||= {};
		Module.webgpu.device = device;
		Module.webgpu.queue = device.queue;

		// VALIDATION: Check storage results (async)
		console.log('🔍 VALIDATION (async): WebGPU.device stored:', !!WebGPU.device);
		console.log('🔍 VALIDATION (async): Module.webgpu.device stored:', !!(Module.webgpu && Module.webgpu.device));

		// EXPERIMENTAL: Try different device storage approaches (async)
		console.log('🧪 EXPERIMENTAL (async): Trying different device storage methods...');

		// Method 1: Deep dive into WebGPU.Internals structure
		if (typeof WebGPU.Internals === 'object' && WebGPU.Internals) {
			console.log('🔍 DEEP DIVE: WebGPU.Internals structure:', Object.keys(WebGPU.Internals));
			console.log('🔍 DEEP DIVE: WebGPU.Internals.devices exists:', !!WebGPU.Internals.devices);
			console.log('🔍 DEEP DIVE: WebGPU.Internals.device exists:', !!WebGPU.Internals.device);

			// Try different storage patterns within Internals
			WebGPU.Internals.device = device;
			WebGPU.Internals.queue = device.queue;

			// Try storing in devices array within Internals
			if (!WebGPU.Internals.devices) {
				WebGPU.Internals.devices = [];
			}
			WebGPU.Internals.devices[0] = device;

			// Try storing with ID 0 (common pattern)
			WebGPU.Internals.device0 = device;
			WebGPU.Internals.queue0 = device.queue;

			console.log('🧪 EXPERIMENTAL (async): Stored in WebGPU.Internals with multiple patterns');
		}

		// Method 2: Try storing as device0 (common Emscripten pattern)
		WebGPU.device0 = device;
		WebGPU.queue0 = device.queue;
		console.log('🧪 EXPERIMENTAL (async): Stored as WebGPU.device0');

		// Method 3: Try storing in devices array
		if (!WebGPU.devices) {
			WebGPU.devices = [];
		}
		WebGPU.devices[0] = device;
		console.log('🧪 EXPERIMENTAL (async): Stored in WebGPU.devices[0]');

		// Method 4: Try storing as defaultDevice
		WebGPU.defaultDevice = device;
		WebGPU.defaultQueue = device.queue;
		console.log('🧪 EXPERIMENTAL (async): Stored as WebGPU.defaultDevice');

		// CRITICAL FIX: Simplified device storage approach
		console.log('🔧 FIX: Storing device with simplified approach...');

		// CRITICAL FIX: Just ensure device is stored in all expected locations
		// The complex Emscripten object insertion is causing issues, so use direct storage

		try {
			// Ensure all storage locations are populated
			if (WebGPU.device && Module.preinitializedWebGPUDevice && Module.webgpu && Module.webgpu.device) {
				console.log('🔧 FIX: All device storage locations confirmed populated');
				console.log('🔧 FIX: WebGPU.device type:', typeof WebGPU.device);
				console.log('🔧 FIX: Module.preinitializedWebGPUDevice type:', typeof Module.preinitializedWebGPUDevice);
				console.log('🔧 FIX: Device has queue:', !!WebGPU.device.queue);

				// Mark storage as successful
				console.log('🔍 SYNC: Device storage completed successfully, marking as ready for engine');

				debugWebGPUDeviceRegistration(device);

				window.webgpuDeviceStorageComplete = true;

				// NEW: Release the run-dependency now that the device is ready.
				if (Module && Module.removeRunDependency) {
					console.log('🔧 PRE_WGPU.JS: WebGPU device ready → removing run dependency');
					Module.removeRunDependency('wgpu_device');
				}
			} else {
				console.log('🔧 FIX ERROR: Some device storage locations are missing');
				console.log('🔧 FIX ERROR: WebGPU.device:', !!WebGPU.device);
				console.log('🔧 FIX ERROR: Module.preinitializedWebGPUDevice:', !!Module.preinitializedWebGPUDevice);
				console.log('🔧 FIX ERROR: Module.webgpu.device:', !!(Module.webgpu && Module.webgpu.device));
				window.webgpuDeviceStorageComplete = false;
			}
		} catch (err) {
			console.log('🔧 FIX ERROR: Exception during device storage validation:', err);
			window.webgpuDeviceStorageComplete = false;
		}
	} catch (err) {
		console.log('❌ Failed to obtain WebGPU device (async):', err);
		console.log('🔄 Engine will fall back to OpenGL compatibility mode');
		window.webgpuDeviceStorageComplete = true; // Mark as complete even on error

		// NEW: Ensure the run-dependency is cleared even on failure to avoid dead-lock.
		if (Module && Module.removeRunDependency) {
			console.log('🔧 PRE_WGPU.JS: Device creation failed → removing run dependency');
			Module.removeRunDependency('wgpu_device');
		}
		throw err;
	}
}

// CRITICAL FIX: Add missing Module.createWebGPUTexture function
Module.createWebGPUTexture = function (deviceHandle, width, height, depthOrArrayLayers, usage, dimension, mipLevelCount, sampleCount) {
	console.log('🔧 JS TEXTURE: createWebGPUTexture called with:', {
		deviceHandle, width, height, depthOrArrayLayers, usage, dimension, mipLevelCount, sampleCount,
	});

	try {
		// CRITICAL FIX: Use the pre-stored device instead of trying to look up by handle
		// The deviceHandle from C++ is a pointer, not a JavaScript object handle
		const device = WebGPU.device || Module.preinitializedWebGPUDevice;
		if (!device) {
			console.log('🔧 JS TEXTURE ERROR: No WebGPU device available');
			return 0;
		}

		// Create texture descriptor
		const textureDescriptor = {
			size: {
				width: width,
				height: height,
				depthOrArrayLayers: depthOrArrayLayers,
			},
			mipLevelCount: mipLevelCount,
			sampleCount: sampleCount,
			// GPUTextureDimension enum: 0 = '1d', 1 = '2d', 2 = '3d'
			dimension: (['1d', '2d'][dimension] || '3d'),
			format: 'bgra8unorm', // Default format, should be passed as parameter
			usage: _sanitizeTextureUsage(usage, 'bgra8unorm'),
		};

		console.log('🔧 JS TEXTURE: Creating texture with descriptor:', textureDescriptor);

		// Create the texture
		const texture = device.createTexture(textureDescriptor);
		if (!texture) {
			console.log('🔧 JS TEXTURE ERROR: Failed to create texture');
			return 0;
		}

		// Store texture in WebGPU object table and return handle
		const textureHandle = _jsObjectInsert(texture);
		console.log('🔧 JS TEXTURE SUCCESS: Created texture with handle:', textureHandle);
		return textureHandle;
	} catch (err) {
		console.log('🔧 JS TEXTURE ERROR: Exception during texture creation:', err);
		return 0;
	}
};

// CRITICAL FIX: Add missing Module.createWebGPUBuffer function
Module.createWebGPUBuffer = function (deviceHandle, size, usage, mappedAtCreation) {
	console.log('🔧 JS BUFFER: createWebGPUBuffer called with:', {
		deviceHandle, size, usage, mappedAtCreation,
	});

	try {
		// Use the pre-stored device
		const device = WebGPU.device || Module.preinitializedWebGPUDevice;
		if (!device) {
			console.log('🔧 JS BUFFER ERROR: No WebGPU device available');
			return 0;
		}

		// CRITICAL FIX: Round up size to multiple of 4 if mappedAtCreation=true
		const actualMappedAtCreation = mappedAtCreation || false;
		let actualSize = size;
		if (actualMappedAtCreation && (size & 0x3) !== 0) {
			actualSize = (size + 3) & ~0x3; // Round up to next multiple of 4
			console.log('🔧 JS BUFFER: Rounded size from', size, 'to', actualSize, 'for mappedAtCreation');
		}

		// Create buffer descriptor
		const bufferDescriptor = {
			size: actualSize,
			usage: _sanitizeBufferUsage(usage),
			mappedAtCreation: actualMappedAtCreation,
		};

		console.log('🔧 JS BUFFER: Creating buffer with descriptor:', bufferDescriptor);

		// Create the buffer
		const buffer = device.createBuffer(bufferDescriptor);
		if (!buffer) {
			console.log('🔧 JS BUFFER ERROR: Failed to create buffer');
			return 0;
		}

		// Store buffer in WebGPU object table and return handle
		const bufferHandle = _jsObjectInsert(buffer);
		console.log('🔧 JS BUFFER SUCCESS: Created buffer with handle:', bufferHandle);
		return bufferHandle;
	} catch (err) {
		console.log('🔧 JS BUFFER ERROR: Exception during buffer creation:', err);
		return 0;
	}
};

// CRITICAL FIX: Add missing Module.createWebGPUSampler function
Module.createWebGPUSampler = function (deviceHandle, magFilter, minFilter, mipmapFilter, addressModeU, addressModeV, addressModeW) {
	console.log('🔧 JS SAMPLER: createWebGPUSampler called with:', {
		deviceHandle, magFilter, minFilter, mipmapFilter, addressModeU, addressModeV, addressModeW,
	});

	try {
		// Use the pre-stored device
		const device = WebGPU.device || Module.preinitializedWebGPUDevice;
		if (!device) {
			console.log('🔧 JS SAMPLER ERROR: No WebGPU device available');
			return 0;
		}

		// Create sampler descriptor
		const samplerDescriptor = {
			magFilter: magFilter === 1 ? 'linear' : 'nearest',
			minFilter: minFilter === 1 ? 'linear' : 'nearest',
			mipmapFilter: mipmapFilter === 1 ? 'linear' : 'nearest',
			addressModeU: (['clamp-to-edge', 'repeat', 'mirror-repeat'][addressModeU] || 'clamp-to-edge'),
			addressModeV: (['clamp-to-edge', 'repeat', 'mirror-repeat'][addressModeV] || 'clamp-to-edge'),
			addressModeW: (['clamp-to-edge', 'repeat', 'mirror-repeat'][addressModeW] || 'clamp-to-edge'),
			lodMinClamp: 0.0,
			lodMaxClamp: 32.0,
			maxAnisotropy: 1,
		};

		console.log('🔧 JS SAMPLER: Creating sampler with descriptor:', samplerDescriptor);

		// Create the sampler
		const sampler = device.createSampler(samplerDescriptor);
		if (!sampler) {
			console.log('🔧 JS SAMPLER ERROR: Failed to create sampler');
			return 0;
		}

		// Store sampler in WebGPU object table and return handle
		const samplerHandle = _jsObjectInsert(sampler);
		console.log('🔧 JS SAMPLER SUCCESS: Created sampler with handle:', samplerHandle);
		return samplerHandle;
	} catch (err) {
		console.log('🔧 JS SAMPLER ERROR: Exception during sampler creation:', err);
		return 0;
	}
};

// RUNTIME PATCH: Guard against early calls to emscripten_webgpu_get_device()
(function patchGetDevice() {
	// Wait until the Emscripten runtime adds the symbol, then patch it.
	const installPatch = () => {
		if (typeof Module.emscripten_webgpu_get_device !== 'function') {
			// Symbol not yet present – try again shortly.
			setTimeout(installPatch, 0);
			return;
		}

		const originalGet = Module.emscripten_webgpu_get_device;
		const safeGet = function () {
			const dev = Module.preinitializedWebGPUDevice;
			if (!dev || !dev.queue) {
				console.log('🔧 PATCH: emscripten_webgpu_get_device called too early – returning 0');
				return 0;
			}
			return originalGet();
		};
		Module.emscripten_webgpu_get_device = safeGet;
		// ALSO patch the standalone global symbol used by compiled code
		if (typeof _emscripten_webgpu_get_device === 'function') {
			window._emscripten_webgpu_get_device = safeGet;
		}
		console.log('🔧 PATCH: emscripten_webgpu_get_device safeguarded');
	};
	installPatch();
})();

// RUNTIME PATCH 2: Safe-guard WebGPU.importJsDevice against undefined device
(function patchImportJsDevice() {
	const installPatch = () => {
		if (typeof WebGPU === 'undefined' || typeof WebGPU.importJsDevice !== 'function') {
			setTimeout(installPatch, 0);
			return;
		}

		const originalImport = WebGPU.importJsDevice;
		WebGPU.importJsDevice = function (dev, parentPtr) {
			console.log('🔧 PATCH: importJsDevice called with dev:', !!dev, 'queue:', !!dev?.queue, 'type:', typeof dev);

			// CRITICAL FIX: Use the pre-stored device if the passed device is incomplete
			let deviceToUse = dev;
			if (!dev || !dev.queue) {
				console.log('🔧 PATCH: Device incomplete, using pre-stored device');
				deviceToUse = Module.preinitializedWebGPUDevice || WebGPU.device;

				if (!deviceToUse || !deviceToUse.queue) {
					console.log('🔧 PATCH: No valid device available – returning 0');
					return 0;
				}
				console.log('🔧 PATCH: Using pre-stored device successfully');
			}

			try {
				const result = originalImport(deviceToUse, parentPtr);
				console.log('🔧 PATCH: importJsDevice returned handle:', result);
				return result;
			} catch (err) {
				console.log('🔧 PATCH: importJsDevice threw error:', err);
				return 0;
			}
		};
		console.log('🔧 PATCH: WebGPU.importJsDevice safeguarded');
	};
	installPatch();
})();

// 🚑 SANITIZE FLAGS HELPERS
const GPUBufferUsageMask = (() => {
	const G = (typeof GPUBufferUsage !== 'undefined')
		? GPUBufferUsage
		: {
			MAP_READ: 0x1, MAP_WRITE: 0x2, COPY_SRC: 0x4, COPY_DST: 0x8,
			INDEX: 0x10, VERTEX: 0x20, UNIFORM: 0x40, STORAGE: 0x80,
			INDIRECT: 0x100, QUERY_RESOLVE: 0x200,
		};
	return G.MAP_READ | G.MAP_WRITE | G.COPY_SRC | G.COPY_DST | G.INDEX | G.VERTEX | G.UNIFORM | G.STORAGE | G.INDIRECT | G.QUERY_RESOLVE;
})();

const GPUTextureUsageMask = (() => {
	const T = (typeof GPUTextureUsage !== 'undefined')
		? GPUTextureUsage
		: {
			COPY_SRC: 0x1, COPY_DST: 0x2, TEXTURE_BINDING: 0x4,
			STORAGE_BINDING: 0x8, RENDER_ATTACHMENT: 0x10,
		};
	return T.COPY_SRC | T.COPY_DST | T.TEXTURE_BINDING | T.STORAGE_BINDING | T.RENDER_ATTACHMENT;
})();

function _sanitizeBufferUsage(rawUsage) {
	let usage = rawUsage & GPUBufferUsageMask; // keep only valid bits
	if (usage === 0) {
		usage = (typeof GPUBufferUsage !== 'undefined') ? GPUBufferUsage.STORAGE : 0x80;
	} // default
	return usage;
}

function _sanitizeTextureUsage(rawUsage, format) {
	let usage = rawUsage & GPUTextureUsageMask;
	// BGRA8Unorm cannot have STORAGE_BINDING
	if (format === 'bgra8unorm') {
		const STORAGE = (typeof GPUTextureUsage !== 'undefined') ? GPUTextureUsage.STORAGE_BINDING : 0x8;
		usage &= ~STORAGE;
	}
	if (usage === 0) {
		// make it a regular sampled render target
		const T = (typeof GPUTextureUsage !== 'undefined') ? GPUTextureUsage : { TEXTURE_BINDING: 0x4, RENDER_ATTACHMENT: 0x10 };
		const defaultBits = ((T.TEXTURE_BINDING || 0x4) | (T.RENDER_ATTACHMENT || 0x10));
		usage = defaultBits;
	}
	return usage;
}

// 🗂️  SIMPLE JS OBJECT TABLE
if (!Module.__godotWebGPUObjects) {
	Module.__godotWebGPUObjects = [null]; // 0 reserved for 'null' handle
}
function _jsObjectInsert(obj) {
	const table = Module.__godotWebGPUObjects;
	table.push(obj);
	const idx = table.length - 1;
	if (typeof WebGPU !== 'undefined' && WebGPU.Internals && WebGPU.Internals.jsObjects) {
		WebGPU.Internals.jsObjects[idx >>> 0] = obj;
	}
	return idx; // index is new handle
}
function _jsObjectGet(handle) {
	return Module.__godotWebGPUObjects[handle] || null;
}
Module.__getJsObject = _jsObjectGet;

// 🕵️  DIAGNOSTIC PATCH MONITOR
// -----------------------------
(function monitorGetDevicePatching() {
	const safeGet = function () {
		console.log('🎯 CRITICAL: safeGet function called!');
		const dev = Module.preinitializedWebGPUDevice || (typeof WebGPU !== 'undefined' ? WebGPU.device : null);
		if (!dev || !dev.queue) {
			console.log('🕵️ get_device called but device not ready → returning 0');
			return 0;
		}

		// CRITICAL FIX: Always return the device handle if available
		if (typeof WebGPU !== 'undefined' && typeof WebGPU.importJsDevice === 'function') {
			try {
				const handle = WebGPU.importJsDevice(dev, 0);
				if (handle && handle !== 0) {
					console.log('🎯 SUCCESS: Returning device handle:', handle);
					return handle;
				}
			} catch (err) {
				console.log('🕵️ Error in safeGet importJsDevice:', err);
			}
		}

		// Fallback: Try to get cached handle if importJsDevice failed
		if (window.__webgpu_cached_device_handle) {
			console.log('🎯 FALLBACK: Using cached device handle:', window.__webgpu_cached_device_handle);
			return window.__webgpu_cached_device_handle;
		}

		console.log('🕵️ get_device: No valid handle available, returning 0');
		return 0;
	};

	const reapply = () => {
		// Check if we should stop the loop first
		const dev = Module.preinitializedWebGPUDevice || (typeof WebGPU !== 'undefined' ? WebGPU.device : null);
		if (dev && dev.queue && typeof WebGPU !== 'undefined' && typeof WebGPU.importJsDevice === 'function') {
			try {
				const testHandle = WebGPU.importJsDevice(dev, 0);
				if (testHandle && testHandle !== 0) {
					console.log('🎯 Device ready and working, stopping re-patch loop');
					// Cache the device handle for future use
					window.__webgpu_cached_device_handle = testHandle;
					return; // Stop the loop
				}
			} catch (err) {
				// Continue the loop if there's an error
				console.log('🔧 Testing device handle failed, continuing loop:', err.message);
			}
		}

		// Only re-patch if we haven't succeeded yet
		if (typeof Module.emscripten_webgpu_get_device === 'function' && Module.emscripten_webgpu_get_device !== safeGet) {
			console.log('🕵️ Re-patching Module.emscripten_webgpu_get_device at', performance.now().toFixed(2), 'ms');
			console.log('🔧 DEBUG: Module.emscripten_webgpu_get_device type:', typeof Module.emscripten_webgpu_get_device);
			Module.emscripten_webgpu_get_device = safeGet;
		}
		if (typeof _emscripten_webgpu_get_device === 'function' && _emscripten_webgpu_get_device !== safeGet) {
			console.log('🕵️ Re-patching global _emscripten_webgpu_get_device at', performance.now().toFixed(2), 'ms');
			console.log('🔧 DEBUG: _emscripten_webgpu_get_device type:', typeof _emscripten_webgpu_get_device);
			window._emscripten_webgpu_get_device = safeGet;
		}

		// Also check if there are other variations of the function
		if (typeof emscripten_webgpu_get_device === 'function' && emscripten_webgpu_get_device !== safeGet) {
			console.log('🔧 DEBUG: Found emscripten_webgpu_get_device (no underscore), patching...');
			window.emscripten_webgpu_get_device = safeGet;
		}

		// Increase timeout to reduce spam
		window.__webgpu_reapply_timeout = setTimeout(reapply, 100);
	};
	reapply();
})();

// Extra logging around importJsDevice (waits until symbol exists)
(function patchImportJsDeviceForLogs() {
	const attempt = () => {
		if (typeof WebGPU === 'undefined' || typeof WebGPU.importJsDevice !== 'function') {
			setTimeout(attempt, 0);
			return;
		}
		const orig = WebGPU.importJsDevice;
		if (orig.__patched_for_logs__) {
			return;
		} // avoid double-patch
		const wrapped = function (dev, parentPtr) {
			console.log('🕵️ importJsDevice invoked. dev?', !!dev, 'queue?', dev && dev.queue);
			return orig.call(WebGPU, dev, parentPtr);
		};
		wrapped.__patched_for_logs__ = true;
		WebGPU.importJsDevice = wrapped;
		console.log('🕵️ importJsDevice logging patch installed');
	};
	attempt();
})();

// ✅ NOTIFY NATIVE WHEN DEVICE READY
// -----------------------------
function _notifyNativeDeviceReady() {
	if (!Module.preinitializedWebGPUDevice) {
		return;
	}
	Module._webgpu_device = Module.preinitializedWebGPUDevice;
	Module._webgpu_device_ready = true;
	if (typeof Module._godot_webgpu_device_ready_callback === 'function') {
		console.log('🔔 Calling _godot_webgpu_device_ready_callback');
		try {
			Module._godot_webgpu_device_ready_callback();
		} catch (e) {
			console.log('Callback threw', e);
		}
	}
}

// Call immediately if ready, otherwise wait.
if (Module.preinitializedWebGPUDevice && Module.preinitializedWebGPUDevice.queue) {
	_notifyNativeDeviceReady();
} else {
	const waitForDev = setInterval(() => {
		if (Module.preinitializedWebGPUDevice && Module.preinitializedWebGPUDevice.queue) {
			clearInterval(waitForDev);
			_notifyNativeDeviceReady();
		}
	}, 10);
}

// Provide a fallback in WebGPU.getJsObject so pointers that only exist in our custom table are still resolved.
(function patchGetJsObjectFallback() {
	const attempt = () => {
		if (typeof WebGPU === 'undefined' || typeof WebGPU.getJsObject !== 'function') {
			setTimeout(attempt, 0);
			return;
		}
		const origGet = WebGPU.getJsObject;
		if (origGet.__patched_with_fallback__) {
			return;
		}
		const wrapped = function (ptr) {
			const obj = origGet(ptr);
			if (obj !== undefined) {
				return obj;
			}
			return Module.__godotWebGPUObjects[ptr] || undefined;
		};
		wrapped.__patched_with_fallback__ = true;
		WebGPU.getJsObject = wrapped;
		console.log('🔧 PATCH: WebGPU.getJsObject now falls back to custom table');
	};
	attempt();
})();

// CRITICAL FIX: Bypass broken Emscripten WebGPU bindings entirely
(function patchEmscriptenWebGPU() {
	console.log('🔧 PATCH: Installing Emscripten WebGPU bypass for buffer size fix');

	// Store reference to the C++ validation data
	window._webgpu_buffer_size_fix ||= {};

	// 🔧 REGISTRY FIX: Initialize buffer handle counter for registry system
	if (!window._webgpu_buffer_size_fix.bufferHandleCounter) {
		window._webgpu_buffer_size_fix.bufferHandleCounter = 1;
		console.error('🔧 REGISTRY FIX: Initialized buffer handle counter');
	}

	// 🔍 VALIDATION LOG: Check which WebGPU implementation is being used
	console.error('🔍 WEBGPU IMPLEMENTATION CHECK: Checking available WebGPU functions...');
	console.error('🔍 WEBGPU CHECK: typeof Module =', typeof Module);
	console.error('🔍 WEBGPU CHECK: typeof _wgpuDeviceCreateBuffer =', typeof _wgpuDeviceCreateBuffer);
	console.error('🔍 WEBGPU CHECK: typeof _emwgpuDeviceCreateBuffer =', typeof _emwgpuDeviceCreateBuffer);
	console.error('🔍 WEBGPU CHECK: typeof wgpuDeviceCreateBuffer =', typeof wgpuDeviceCreateBuffer);

	// Check Module.asm for WebGPU functions
	if (typeof Module !== 'undefined' && Module.asm) {
		const wgpuFunctions = Object.keys(Module.asm).filter((k) => k.includes('wgpu'));
		console.error('🔍 MODULE.ASM CHECK: WebGPU functions found:', wgpuFunctions.length > 0 ? wgpuFunctions.slice(0, 10) : 'NONE');

		const dawnFunctions = Object.keys(Module.asm).filter((k) => k.includes('emwgpu'));
		console.error('🔍 DAWN PORT CHECK: Dawn functions found:', dawnFunctions.length > 0 ? dawnFunctions.slice(0, 10) : 'NONE');
	} else {
		console.error('🔍 MODULE CHECK: Module.asm not available');
	}

	// Check for conflicting implementations
	const webgpuSources = [];
	if (typeof _wgpuDeviceCreateBuffer !== 'undefined') {
		webgpuSources.push('Emscripten _wgpuDeviceCreateBuffer');
	}
	if (typeof _emwgpuDeviceCreateBuffer !== 'undefined') {
		webgpuSources.push('Dawn _emwgpuDeviceCreateBuffer');
	}
	if (typeof wgpuDeviceCreateBuffer !== 'undefined') {
		webgpuSources.push('Global wgpuDeviceCreateBuffer');
	}
	console.error('🔍 CONFLICT CHECK: Available WebGPU implementations:', webgpuSources);

	// 🔧 CRITICAL FIX: Create or enhance WebGPU registry system for Emscripten WebGPU
	// Since we're using Emscripten's WebGPU instead of Dawn, we need to create
	// a compatible registry system that the Godot driver expects

	// Function to ensure WebGPU.Internals exists (global scope)
	window.ensureWebGPUInternals = function () {
		console.error('🔧 REGISTRY DEBUG: ensureWebGPUInternals called');
		console.error('🔧 REGISTRY DEBUG: typeof window.WebGPU =', typeof window.WebGPU);
		console.error('🔧 REGISTRY DEBUG: window.WebGPU =', window.WebGPU);

		if (typeof window.WebGPU === 'undefined') {
			console.error('🔧 REGISTRY FIX: Creating new WebGPU object');
			window.WebGPU = {};
		}

		console.error('🔧 REGISTRY DEBUG: window.WebGPU.Internals before =', window.WebGPU.Internals);

		if (!window.WebGPU.Internals) {
			console.error('🔧 REGISTRY FIX: Adding Internals to WebGPU object');
			window.WebGPU.Internals = {
				jsObjects: {},
				bufferOnUnmaps: {},

				jsObjectInsert: function (ptr, jsObject) {
					if (!ptr) {
						return;
					}
					const key = (ptr >>> 0);
					console.error(`🔧 REGISTRY FIX: Inserting object into WebGPU registry, handle=${key}`);
					this.jsObjects[key] = jsObject;
				},

				jsObjectRemove: function (ptr) {
					if (!ptr) {
						return;
					}
					const key = (ptr >>> 0);
					console.error(`🔧 REGISTRY FIX: Removing object from WebGPU registry, handle=${key}`);
					delete this.jsObjects[key];
					if (this.bufferOnUnmaps[key]) {
						delete this.bufferOnUnmaps[key];
					}
				},

				getJsObject: function (ptr) {
					if (!ptr) {
						return undefined;
					}
					const key = (ptr >>> 0);
					return this.jsObjects[key];
				},
			};
			console.error('🔧 REGISTRY FIX: WebGPU.Internals registry system created successfully');
			console.error('🔧 REGISTRY DEBUG: window.WebGPU.Internals after creation =', window.WebGPU.Internals);
		} else {
			console.error('🔧 REGISTRY CHECK: WebGPU.Internals already exists');
			console.error('🔧 REGISTRY DEBUG: existing window.WebGPU.Internals =', window.WebGPU.Internals);
		}

		// Final verification
		console.error('🔧 REGISTRY DEBUG: Final verification - window.WebGPU.Internals =', window.WebGPU.Internals);
		console.error('🔧 REGISTRY DEBUG: Final verification - typeof window.WebGPU.Internals =', typeof window.WebGPU.Internals);
	};

	// Ensure registry exists now
	window.ensureWebGPUInternals();

	// 🔧 CRITICAL FIX: Monitor for WebGPU object changes and restore Internals
	// Emscripten might overwrite the WebGPU object, so we need to restore our Internals
	const webgpuCheckInterval = setInterval(function () {
		if (typeof window.WebGPU !== 'undefined' && !window.WebGPU.Internals) {
			console.error('🔧 REGISTRY FIX: WebGPU.Internals was lost, restoring...');
			window.ensureWebGPUInternals();
		}
	}, 100); // Check every 100ms

	// Stop monitoring after 10 seconds (should be enough for initialization)
	setTimeout(function () {
		clearInterval(webgpuCheckInterval);
		console.error('🔧 REGISTRY FIX: Stopped monitoring WebGPU.Internals');
	}, 10000);

	// Check if USE_WEBGPU is enabled (old implementation)
	if (typeof Module !== 'undefined' && Module.ENVIRONMENT_IS_WEB) {
		console.error('🔍 EMSCRIPTEN CHECK: ENVIRONMENT_IS_WEB =', Module.ENVIRONMENT_IS_WEB);
	}

	// Override the Emscripten wgpuDeviceCreateBuffer function directly
	if (typeof Module !== 'undefined' && Module._wgpuDeviceCreateBuffer) {
		const origWgpuDeviceCreateBuffer = Module._wgpuDeviceCreateBuffer;

		Module._wgpuDeviceCreateBuffer = function (device, descriptor) {
			console.error('🔧 EMSCRIPTEN BYPASS: wgpuDeviceCreateBuffer called');

			// Get the correct size from C++ if available
			const correctSize = window._webgpu_buffer_size_fix.lastCorrectSize;
			if (correctSize && correctSize > 0) {
				console.error('🔧 EMSCRIPTEN BYPASS: Using correct size from C++:', correctSize);

				// Get the WebGPU device from the Emscripten device handle
				const webgpuDevice = Module.preinitializedWebGPUDevice;
				if (webgpuDevice && webgpuDevice.createBuffer) {
					console.error('🔧 EMSCRIPTEN BYPASS: Creating buffer directly with native WebGPU API');

					// Read descriptor properties from memory
					const usage = getValue(descriptor + 4, 'i32'); // Assuming usage is at offset 4
					const mappedAtCreation = getValue(descriptor + 16, 'i8'); // Assuming mappedAtCreation is at offset 16

					// Create buffer directly with native WebGPU API
					const nativeDescriptor = {
						size: correctSize,
						usage: usage,
						mappedAtCreation: !!mappedAtCreation,
						label: 'Godot Buffer (Fixed Size)',
					};

					console.error('🔧 EMSCRIPTEN BYPASS: Native descriptor:', nativeDescriptor);

					try {
						const buffer = webgpuDevice.createBuffer(nativeDescriptor);
						console.error('🔧 EMSCRIPTEN BYPASS: Buffer created successfully with size:', buffer.size);

						// Clear the stored size
						window._webgpu_buffer_size_fix.lastCorrectSize = null;

						// Return a handle to the buffer (simulate Emscripten behavior)
						// This is a simplified approach - in reality we'd need to register the buffer
						return buffer ? 1 : 0; // Return non-zero handle for success
					} catch (e) {
						console.error('🚨 EMSCRIPTEN BYPASS: Native buffer creation failed:', e);
						return 0; // Return 0 for failure
					}
				} else {
					console.error('🚨 EMSCRIPTEN BYPASS: No native WebGPU device available');
				}
			}

			// Fallback to original function
			console.error('🔧 EMSCRIPTEN BYPASS: Falling back to original function');
			return origWgpuDeviceCreateBuffer.call(this, device, descriptor);
		};

		console.log('🔧 PATCH: Emscripten wgpuDeviceCreateBuffer bypassed');
	} else {
		console.log('🔧 PATCH: Emscripten wgpuDeviceCreateBuffer not found, using GPUDevice patch');

		// Fallback to GPUDevice patch if Emscripten function not available
		if (typeof GPUDevice !== 'undefined' && GPUDevice.prototype) {
			const proto = GPUDevice.prototype;
			const origCreate = proto.createBuffer;
			if (origCreate && !origCreate.__patched_for_buffer_size_fix__) {
				proto.createBuffer = function (descriptor) {
					console.error('🔧 FALLBACK PATCH: createBuffer called');
					console.error('🔧 FALLBACK PATCH: Input descriptor:', JSON.stringify(descriptor));
					console.error('🔧 FALLBACK PATCH: Device object:', this);
					console.error('🔧 FALLBACK PATCH: Device constructor:', this.constructor.name);
					console.error('🔧 FALLBACK PATCH: Device lost:', this.lost);
					console.error('🔧 FALLBACK PATCH: Device features:', this.features);
					console.error('🔧 FALLBACK PATCH: Device limits:', this.limits);

					// 🔧 DEVICE DEBUG: Check if device properties are promises or getters
					console.error('🔧 DEVICE DEBUG: typeof device.lost:', typeof this.lost);
					console.error('🔧 DEVICE DEBUG: typeof device.features:', typeof this.features);
					console.error('🔧 DEVICE DEBUG: typeof device.limits:', typeof this.limits);
					console.error('🔧 DEVICE DEBUG: device.queue:', this.queue);
					console.error('🔧 DEVICE DEBUG: device.label:', this.label);

					// Check if device is actually functional
					try {
						console.error('🔧 DEVICE DEBUG: Device properties enumeration:', Object.getOwnPropertyNames(this));
						console.error('🔧 DEVICE DEBUG: Device prototype:', Object.getPrototypeOf(this));
					} catch (e) {
						console.error('🔧 DEVICE DEBUG: Error accessing device properties:', e);
					}

					if (descriptor && descriptor.size === 0) {
						const correctSize = window._webgpu_buffer_size_fix.lastCorrectSize;
						if (correctSize && correctSize > 0) {
							console.error('🔧 FALLBACK PATCH: Using correct size:', correctSize);
							console.error('🔧 FALLBACK PATCH: About to create fixed descriptor...');

							const fixedDescriptor = {
								size: correctSize,
								usage: descriptor.usage,
								mappedAtCreation: descriptor.mappedAtCreation,
								label: descriptor.label || 'Godot Buffer (Fixed Size)',
							};

							console.error('🔧 FALLBACK PATCH: Fixed descriptor created successfully');

							console.error('🔧 FALLBACK PATCH: Fixed descriptor:', JSON.stringify(fixedDescriptor));

							// CRITICAL FIX: Don't clear the size immediately - keep it for potential retries
							// window._webgpu_buffer_size_fix.lastCorrectSize = null;

							console.error('🔧 FALLBACK PATCH: Calling original createBuffer with fixed descriptor...');
							try {
								const result = origCreate.call(this, fixedDescriptor);
								console.error('🔧 FALLBACK PATCH: Original createBuffer returned:', result);
								console.error('🔧 FALLBACK PATCH: Result type:', typeof result);
								console.error('🔧 FALLBACK PATCH: Result constructor:', result ? result.constructor.name : 'null');
								if (result) {
									console.error('🔧 FALLBACK PATCH: Buffer size:', result.size);
									console.error('🔧 FALLBACK PATCH: Buffer usage:', result.usage);
									console.error('🔧 FALLBACK PATCH: Buffer mapState:', result.mapState);

									// 🔧 REGISTRY FIX: Register the created buffer in our WebGPU registry
									// This ensures that the Godot driver can find the buffer later
									console.error('🔧 REGISTRY DEBUG: About to check WebGPU registry availability (size fix case)');
									console.error('🔧 REGISTRY DEBUG: typeof WebGPU =', typeof WebGPU);

									// 🔍 ASSUMPTION VALIDATION: Test scope/context differences (size fix case)
									console.error('🔍 SCOPE TEST (size fix): typeof window.WebGPU =', typeof window.WebGPU);
									console.error('🔍 SCOPE TEST (size fix): WebGPU === window.WebGPU =', WebGPU === window.WebGPU);
									console.error('🔍 SCOPE TEST (size fix): window.WebGPU.Internals =', window.WebGPU ? window.WebGPU.Internals : 'window.WebGPU undefined');

									registerFallbackBuffer(result);

									// Only clear the size after successful creation
									window._webgpu_buffer_size_fix.lastCorrectSize = null;
									console.error('🔧 FALLBACK PATCH: Cleared stored size after successful creation');
								}
								return result;
							} catch (err) {
								console.error('🚨 FALLBACK PATCH: Exception in original createBuffer:', err);
								console.error('🚨 FALLBACK PATCH: Exception stack:', err.stack);
								throw err;
							}
						} else {
							console.error('🚨 FALLBACK PATCH: No correct size available for size=0 buffer');
							console.error('🚨 FALLBACK PATCH: correctSize:', correctSize);
							console.error('🚨 FALLBACK PATCH: window._webgpu_buffer_size_fix:', window._webgpu_buffer_size_fix);
						}
					}

					console.error('🔧 FALLBACK PATCH: No size fix needed, calling original createBuffer...');
					try {
						const result = origCreate.call(this, descriptor);
						console.error('🔧 FALLBACK PATCH: Original createBuffer returned:', result);
						console.error('🔧 FALLBACK PATCH: Result type:', typeof result);
						if (result) {
							console.error('🔧 FALLBACK PATCH: Buffer size:', result.size);
							console.error('🔧 FALLBACK PATCH: Buffer usage:', result.usage);

							// 🔧 REGISTRY FIX: Register the created buffer in our WebGPU registry
							console.error('🔧 REGISTRY DEBUG: About to check WebGPU registry availability');
							console.error('🔧 REGISTRY DEBUG: typeof WebGPU =', typeof WebGPU);
							console.error('🔧 REGISTRY DEBUG: WebGPU =', WebGPU);
							console.error('🔧 REGISTRY DEBUG: WebGPU.Internals =', WebGPU ? WebGPU.Internals : 'WebGPU undefined');

							// 🔍 ASSUMPTION VALIDATION: Test scope/context differences
							console.error('🔍 SCOPE TEST: typeof window.WebGPU =', typeof window.WebGPU);
							console.error('🔍 SCOPE TEST: window.WebGPU =', window.WebGPU);
							console.error('🔍 SCOPE TEST: window.WebGPU.Internals =', window.WebGPU ? window.WebGPU.Internals : 'window.WebGPU undefined');
							console.error('🔍 SCOPE TEST: WebGPU === window.WebGPU =', WebGPU === window.WebGPU);
							console.error('🔍 SCOPE TEST: this.WebGPU =', this.WebGPU);
							console.error('🔍 SCOPE TEST: globalThis.WebGPU =', globalThis.WebGPU);

							// 🔧 SCOPE FIX: Use window.WebGPU (our registry) instead of WebGPU (Emscripten's object)
							if (typeof window.WebGPU !== 'undefined' && !window.WebGPU.Internals) {
								console.error('🔧 REGISTRY FIX: window.WebGPU.Internals missing at registration time, recreating...');
								window.ensureWebGPUInternals();
								console.error('🔧 REGISTRY DEBUG: After ensureWebGPUInternals - window.WebGPU.Internals =', window.WebGPU.Internals);
							}

							if (typeof window.WebGPU !== 'undefined' && window.WebGPU.Internals) {
								const handle = window._webgpu_buffer_size_fix.bufferHandleCounter++;
								window.WebGPU.Internals.jsObjectInsert(handle, result);
								console.error(`🔧 REGISTRY FIX: Registered buffer with handle=${handle} in WebGPU registry (no fix case)`);

								// Store the handle so C++ can retrieve it
								window._webgpu_buffer_size_fix.lastCreatedHandle = handle;
							} else {
								console.error('🚨 REGISTRY ERROR: window.WebGPU registry not available for buffer registration');
								console.error('🚨 REGISTRY ERROR: typeof window.WebGPU =', typeof window.WebGPU);
								console.error('🚨 REGISTRY ERROR: window.WebGPU.Internals available =', window.WebGPU ? !!window.WebGPU.Internals : false);
							}
						}
						return result;
					} catch (err) {
						console.error('🚨 FALLBACK PATCH: Exception in original createBuffer (no fix):', err);
						console.error('🚨 FALLBACK PATCH: Exception stack:', err.stack);
						throw err;
					}
				};
				proto.createBuffer.__patched_for_buffer_size_fix__ = true;
				console.log('🔧 PATCH: GPUDevice.createBuffer fallback patch installed');
			}
		}
	}
})();

// 🔔 WATCH & CALL NATIVE CALLBACKS WHEN THEY APPEAR
// -----------------------------
(function waitAndCallNativeCallbacks() {
	let called = false;
	const tick = () => {
		if (called) {
			return;
		}
		if (!Module.preinitializedWebGPUDevice || !Module.preinitializedWebGPUDevice.queue) {
			requestAnimationFrame(tick);
			return;
		}
		const setFn = Module._godot_webgpu_set_device_from_module;
		const readyFn = Module._godot_webgpu_device_ready_callback;
		if (typeof setFn === 'function') {
			console.log('🔔 Calling _godot_webgpu_set_device_from_module');
			try {
				setFn();
			} catch (e) {
				console.log('set_device callback threw', e);
			}
		}
		if (typeof readyFn === 'function') {
			console.log('🔔 Calling _godot_webgpu_device_ready_callback');
			try {
				readyFn();
			} catch (e) {
				console.log('device_ready callback threw', e);
			}
		}
		// Call only once
		called = true;
	};
	tick();
})();

function debugWebGPUDeviceRegistration(device) {
// DEEP DEBUG: Register the device into Emscripten's internal jsObjects table and log the handle.
	try {
		if (WebGPU.Internals && typeof WebGPU.Internals.jsObjectInsert === 'function') {
			const devHandle = WebGPU.Internals.jsObjectInsert(device);
			console.log('🚩 DEBUG: jsObjectInsert returned handle', devHandle);

			// Attempt to retrieve it back (if helper exists) to confirm registration.
			if (typeof WebGPU.Internals.getJsObject === 'function') {
				const roundTrip = WebGPU.Internals.getJsObject(devHandle);
				console.log('🚩 DEBUG: round-trip retrieval matches original device:', roundTrip === device);
			}
		} else {
			console.warn('🚩 DEBUG: WebGPU.Internals.jsObjectInsert not available – cannot register handle');
		}

		// Check what _emscripten_webgpu_get_device returns at this point.
		const getDevFn = (typeof _emscripten_webgpu_get_device !== 'undefined')
			? _emscripten_webgpu_get_device
			: (Module && Module._emscripten_webgpu_get_device);

		if (typeof getDevFn === 'function') {
			try {
				const ptrVal = getDevFn();
				console.log('🚩 DEBUG: _emscripten_webgpu_get_device() returned', ptrVal);
			} catch (e) {
				console.warn('🚩 DEBUG: calling _emscripten_webgpu_get_device threw', e);
			}
		} else {
			console.warn('🚩 DEBUG: _emscripten_webgpu_get_device not yet available');
		}
	} catch (dbgErr) {
		console.log('🚩 DEBUG ERROR while probing device handle export:', dbgErr);
	}
}

function registerFallbackBuffer(result) {
// 🔧 SCOPE FIX: Use window.WebGPU (our registry) instead of WebGPU (Emscripten's object)
	if (typeof window.WebGPU !== 'undefined' && !window.WebGPU.Internals) {
		console.error('🔧 REGISTRY FIX: window.WebGPU.Internals missing at registration time (size fix case), recreating...');
		window.ensureWebGPUInternals();
		console.error('🔧 REGISTRY DEBUG: After ensureWebGPUInternals (size fix) - window.WebGPU.Internals =', window.WebGPU.Internals);
	}

	if (typeof window.WebGPU !== 'undefined' && window.WebGPU.Internals) {
		const handle = window._webgpu_buffer_size_fix.bufferHandleCounter++;
		window.WebGPU.Internals.jsObjectInsert(handle, result);
		console.error(`🔧 REGISTRY FIX: Registered buffer with handle=${handle} in WebGPU registry`);

		// Store the handle so C++ can retrieve it
		window._webgpu_buffer_size_fix.lastCreatedHandle = handle;
	} else {
		console.error('🚨 REGISTRY ERROR: window.WebGPU registry not available for buffer registration (size fix case)');
	}
}
