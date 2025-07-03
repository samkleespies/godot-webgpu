// pre_wgpu.js - WebGPU device creation before main() starts
// This ensures the WebGPU device is ready when RenderingDeviceDriverWebGPU::initialize() runs

// Set up Module object and preRun callback
if (typeof Module === 'undefined') Module = {};
Module.preRun = Module.preRun || [];

// CRITICAL FIX: Force run dependency mechanism to be available
Module.addRunDependency = Module.addRunDependency || function(id) {
  console.log('🔧 FALLBACK: addRunDependency called for:', id);
  Module.runDependencies = Module.runDependencies || 0;
  Module.runDependencies++;
  console.log('🔧 FALLBACK: runDependencies now:', Module.runDependencies);
};

Module.removeRunDependency = Module.removeRunDependency || function(id) {
  console.log('🔧 FALLBACK: removeRunDependency called for:', id);
  Module.runDependencies = Module.runDependencies || 0;
  if (Module.runDependencies > 0) Module.runDependencies--;
  console.log('🔧 FALLBACK: runDependencies now:', Module.runDependencies);

  // If all dependencies are resolved, call run if it exists
  if (Module.runDependencies === 0 && Module.run) {
    console.log('🔧 FALLBACK: All dependencies resolved, calling run()');
    Module.run();
  }
};

// CRITICAL FIX: Debug and use immediate execution approach
console.log('🔧 PRE_WGPU.JS: Script is loading...');

// EARLY RUN-DEPENDENCY REGISTRATION
// -------------------------------------------------------------------
// Ensure the engine waits until our WebGPU device setup completes.
// We must register this *before* kicking off any async work so that
// the later Module.removeRunDependency('wgpu_device') actually brings
// the counter back to zero.
if (typeof Module !== 'undefined' && Module.addRunDependency && !Module.__wgpu_device_dependency_added) {
  Module.__wgpu_device_dependency_added = true;
  console.log('🔧 PRE_WGPU.JS: Adding run dependency wgpu_device (early)');
  Module.addRunDependency('wgpu_device');
}

// CRITICAL FIX: Try immediate device creation approach
// Since Module callbacks are not working, try creating device immediately when script loads
console.log('🔧 PRE_WGPU.JS: Attempting immediate WebGPU device creation...');

// Start device creation immediately
let immediateDeviceCreated = false;
createWebGPUDeviceAsync().then(() => {
  console.log('🔧 PRE_WGPU.JS: Immediate device creation completed');
  immediateDeviceCreated = true;
}).catch(err => {
  console.error('🔧 PRE_WGPU.JS: Immediate device creation failed:', err);
  immediateDeviceCreated = true;
});

// CRITICAL FIX: Also try Module.onRuntimeInitialized as backup
const originalOnRuntimeInitialized = Module.onRuntimeInitialized;
Module.onRuntimeInitialized = function() {
  if (Module.preinitializedWebGPUDevice) {
    console.log('✅ PRE_WGPU.JS: WebGPU device already initialized – skipping additional creation');
    if (typeof originalOnRuntimeInitialized === 'function') {
      originalOnRuntimeInitialized();
    }
    return;
  }

  console.log('🕒 Runtime initialized: requesting WebGPU device with GUARANTEED blocking before main()…');
  console.log('✅ Using Module.onRuntimeInitialized to guarantee device is ready before main() starts');

  const success = createWebGPUDeviceBlocking();
  if (success) {
    console.log('✅ WebGPU device ready - proceeding with original onRuntimeInitialized');
  } else {
    console.error('❌ WebGPU device creation failed - proceeding anyway');
  }

  if (typeof originalOnRuntimeInitialized === 'function') {
    originalOnRuntimeInitialized();
  }
};

// Function to create WebGPU device with true blocking for Module.preMain
function createWebGPUDeviceBlocking() {
  console.log('🔍 BLOCKING: Starting truly blocking WebGPU device creation...');

  // CRITICAL FIX: Use XMLHttpRequest-style synchronous approach
  // This will actually block the main thread until device is ready

  let deviceReady = false;
  let deviceError = null;

  // Start async device creation
  createWebGPUDeviceAsync().then(() => {
    console.log('🔍 BLOCKING: Async device creation completed');
    deviceReady = true;
  }).catch(err => {
    console.error('🔍 BLOCKING: Async device creation failed:', err);
    deviceError = err;
    deviceReady = true; // Mark as ready even on error to exit loop
  });

  // CRITICAL FIX: Use a true blocking approach with synchronous waiting
  console.log('🔍 BLOCKING: Starting blocking wait loop...');
  const startTime = performance.now();
  const timeout = 20000; // Increased to 20 seconds to accommodate slower adapter/device creation on some systems

  // This is a true blocking loop that will prevent main() from starting
  while (!deviceReady && (performance.now() - startTime) < timeout) {
    // CRITICAL FIX: Use a more aggressive blocking approach
    // Force the event loop to process by using a synchronous delay
    const blockStart = performance.now();
    while (performance.now() - blockStart < 10) {
      // Tight busy wait for 10ms to allow Promise resolution
    }
  }

  if (deviceError) {
    console.error('🔍 BLOCKING: Device creation failed:', deviceError);
    return false;
  }

  if (!deviceReady) {
    console.error('🔍 BLOCKING: Device creation timed out after 20 seconds');
    return false;
  }

  console.log('🔍 BLOCKING: Device creation completed successfully - main() can now start');
  return true;
}

// Function to create WebGPU device synchronously using non-blocking approach (DEPRECATED)
function createWebGPUDeviceSync() {
  console.log('🔍 SYNC: Starting synchronous WebGPU device creation...');

  // CRITICAL FIX: Use a non-blocking approach that doesn't prevent Promise resolution
  // Instead of busy-waiting, we'll use a recursive setTimeout approach

  let attempts = 0;
  const maxAttempts = 100; // 10 seconds with 100ms intervals

  function checkDeviceReady() {
    attempts++;

    // CRITICAL FIX: More comprehensive device detection
    const webgpuDeviceExists = (typeof WebGPU !== 'undefined' && WebGPU.device);
    const moduleDeviceExists = (typeof Module !== 'undefined' && Module.preinitializedWebGPUDevice);
    const moduleWebgpuExists = (typeof Module !== 'undefined' && Module.webgpu && Module.webgpu.device);
    const asyncComplete = window.webgpuDeviceCreationComplete;
    const storageComplete = window.webgpuDeviceStorageComplete;

    console.log('🔍 SYNC: Check', attempts, '- WebGPU.device:', !!webgpuDeviceExists,
                'Module.preinitializedWebGPUDevice:', !!moduleDeviceExists,
                'Module.webgpu.device:', !!moduleWebgpuExists,
                'asyncComplete:', !!asyncComplete,
                'storageComplete:', !!storageComplete);

    // Only consider device ready if BOTH async creation AND storage are complete AND device exists
    const deviceReady = asyncComplete && storageComplete && (webgpuDeviceExists || moduleDeviceExists || moduleWebgpuExists);

    if (deviceReady) {
      console.log('🔍 SYNC: Device detected as ready after', attempts * 100, 'ms');
      console.log('🔍 SYNC: Final device validation before removing run dependency...');

      // Double-check that the device is actually usable
      if (webgpuDeviceExists && WebGPU.device.queue) {
        console.log('🔍 SYNC: WebGPU.device.queue confirmed available');
      }
      if (moduleDeviceExists && Module.preinitializedWebGPUDevice.queue) {
        console.log('🔍 SYNC: Module.preinitializedWebGPUDevice.queue confirmed available');
      }

      Module.removeRunDependency('wgpu_device');
      return;
    }

    if (attempts >= maxAttempts) {
      console.error('🔍 SYNC: Device creation timed out after', maxAttempts * 100, 'ms');
      console.error('🔍 SYNC: Final state - WebGPU:', !!webgpuDeviceExists, 'Module:', !!moduleDeviceExists, 'asyncComplete:', !!asyncComplete, 'storageComplete:', !!storageComplete);

      // CRITICAL FIX: If device exists but storage failed, try to force storage completion
      if (asyncComplete && !storageComplete && (webgpuDeviceExists || moduleDeviceExists)) {
        console.error('🔍 SYNC: Device exists but storage incomplete - forcing storage completion');
        window.webgpuDeviceStorageComplete = true;
      }

      Module.removeRunDependency('wgpu_device');
      return;
    }

    // Continue checking every 100ms
    setTimeout(checkDeviceReady, 100);
  }

  // CRITICAL FIX: Use a shared flag to coordinate between async and sync
  window.webgpuDeviceCreationComplete = false;
  window.webgpuDeviceStorageComplete = false;

  // Start the async device creation
  createWebGPUDeviceAsync().then(() => {
    console.log('🔍 SYNC: Async device creation Promise resolved');
    window.webgpuDeviceCreationComplete = true;
    // Don't set storage complete here - it will be set after actual storage
  }).catch(err => {
    console.error('🔍 SYNC: Async device creation failed:', err);
    window.webgpuDeviceCreationComplete = true; // Mark as complete even on error
    window.webgpuDeviceStorageComplete = true;
    Module.removeRunDependency('wgpu_device');
  });

  // Start checking for device readiness
  console.log('🔍 SYNC: Starting non-blocking device check loop...');
  setTimeout(checkDeviceReady, 100);
}

// Async function to create WebGPU device
function createWebGPUDeviceAsync() {
  return new Promise(async (resolve, reject) => {
    try {
      // Check if WebGPU is available
      if (!navigator.gpu) {
        throw new Error('WebGPU not supported in this browser');
      }

      console.log('🔍 Requesting WebGPU adapter (async)...');
      const adapter = await navigator.gpu.requestAdapter({
        powerPreference: 'high-performance',
        forceFallbackAdapter: false
      });

      if (!adapter) {
        throw new Error('No WebGPU adapter found');
      }

      console.log('🔍 Requesting WebGPU device (async)...');
      const device = await adapter.requestDevice({
        requiredFeatures: [],
        requiredLimits: {}
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
      Module.webgpu = Module.webgpu || {};
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
        if (!WebGPU.Internals.devices) WebGPU.Internals.devices = [];
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
      if (!WebGPU.devices) WebGPU.devices = [];
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
            console.error('🚩 DEBUG ERROR while probing device handle export:', dbgErr);
          }

          window.webgpuDeviceStorageComplete = true;

          // NEW: Release the run-dependency now that the device is ready.
          if (Module && Module.removeRunDependency) {
            console.log('🔧 PRE_WGPU.JS: WebGPU device ready → removing run dependency');
            Module.removeRunDependency('wgpu_device');
          }
        } else {
          console.error('🔧 FIX ERROR: Some device storage locations are missing');
          console.error('🔧 FIX ERROR: WebGPU.device:', !!WebGPU.device);
          console.error('🔧 FIX ERROR: Module.preinitializedWebGPUDevice:', !!Module.preinitializedWebGPUDevice);
          console.error('🔧 FIX ERROR: Module.webgpu.device:', !!(Module.webgpu && Module.webgpu.device));
          window.webgpuDeviceStorageComplete = false;
        }
      } catch (err) {
        console.error('🔧 FIX ERROR: Exception during device storage validation:', err);
        window.webgpuDeviceStorageComplete = false;
      }

      resolve(); // Success
    } catch (err) {
      console.error('❌ Failed to obtain WebGPU device (async):', err);
      console.error('🔄 Engine will fall back to OpenGL compatibility mode');
      window.webgpuDeviceStorageComplete = true; // Mark as complete even on error
      reject(err);

      // NEW: Ensure the run-dependency is cleared even on failure to avoid dead-lock.
      if (Module && Module.removeRunDependency) {
        console.log('🔧 PRE_WGPU.JS: Device creation failed → removing run dependency');
        Module.removeRunDependency('wgpu_device');
      }
    }
  });
}

// CRITICAL FIX: Add missing Module.createWebGPUTexture function
Module.createWebGPUTexture = function(deviceHandle, width, height, depthOrArrayLayers, usage, dimension, mipLevelCount, sampleCount) {
  console.log('🔧 JS TEXTURE: createWebGPUTexture called with:', {
    deviceHandle, width, height, depthOrArrayLayers, usage, dimension, mipLevelCount, sampleCount
  });

  try {
    // CRITICAL FIX: Use the pre-stored device instead of trying to look up by handle
    // The deviceHandle from C++ is a pointer, not a JavaScript object handle
    const device = WebGPU.device || Module.preinitializedWebGPUDevice;
    if (!device) {
      console.error('🔧 JS TEXTURE ERROR: No WebGPU device available');
      return 0;
    }

    // Create texture descriptor
    const textureDescriptor = {
      size: {
        width: width,
        height: height,
        depthOrArrayLayers: depthOrArrayLayers
      },
      mipLevelCount: mipLevelCount,
      sampleCount: sampleCount,
      // GPUTextureDimension enum: 0 = '1d', 1 = '2d', 2 = '3d'
      dimension: dimension === 0 ? '1d' : dimension === 1 ? '2d' : '3d',
      format: 'bgra8unorm', // Default format, should be passed as parameter
      usage: _sanitizeTextureUsage(usage, 'bgra8unorm')
    };

    console.log('🔧 JS TEXTURE: Creating texture with descriptor:', textureDescriptor);

    // Create the texture
    const texture = device.createTexture(textureDescriptor);
    if (!texture) {
      console.error('🔧 JS TEXTURE ERROR: Failed to create texture');
      return 0;
    }

    // Store texture in WebGPU object table and return handle
    const textureHandle = _jsObjectInsert(texture);
    console.log('🔧 JS TEXTURE SUCCESS: Created texture with handle:', textureHandle);
    return textureHandle;

  } catch (err) {
    console.error('🔧 JS TEXTURE ERROR: Exception during texture creation:', err);
    return 0;
  }
};

// CRITICAL FIX: Add missing Module.createWebGPUBuffer function
Module.createWebGPUBuffer = function(deviceHandle, size, usage, mappedAtCreation) {
  console.log('🔧 JS BUFFER: createWebGPUBuffer called with:', {
    deviceHandle, size, usage, mappedAtCreation
  });

  try {
    // Use the pre-stored device
    const device = WebGPU.device || Module.preinitializedWebGPUDevice;
    if (!device) {
      console.error('🔧 JS BUFFER ERROR: No WebGPU device available');
      return 0;
    }

    // Create buffer descriptor
    const bufferDescriptor = {
      size: size,
      usage: _sanitizeBufferUsage(usage),
      mappedAtCreation: mappedAtCreation || false
    };

    console.log('🔧 JS BUFFER: Creating buffer with descriptor:', bufferDescriptor);

    // Create the buffer
    const buffer = device.createBuffer(bufferDescriptor);
    if (!buffer) {
      console.error('🔧 JS BUFFER ERROR: Failed to create buffer');
      return 0;
    }

    // Store buffer in WebGPU object table and return handle
    const bufferHandle = _jsObjectInsert(buffer);
    console.log('🔧 JS BUFFER SUCCESS: Created buffer with handle:', bufferHandle);
    return bufferHandle;

  } catch (err) {
    console.error('🔧 JS BUFFER ERROR: Exception during buffer creation:', err);
    return 0;
  }
};

// CRITICAL FIX: Add missing Module.createWebGPUSampler function
Module.createWebGPUSampler = function(deviceHandle, magFilter, minFilter, mipmapFilter, addressModeU, addressModeV, addressModeW) {
  console.log('🔧 JS SAMPLER: createWebGPUSampler called with:', {
    deviceHandle, magFilter, minFilter, mipmapFilter, addressModeU, addressModeV, addressModeW
  });

  try {
    // Use the pre-stored device
    const device = WebGPU.device || Module.preinitializedWebGPUDevice;
    if (!device) {
      console.error('🔧 JS SAMPLER ERROR: No WebGPU device available');
      return 0;
    }

    // Create sampler descriptor
    const samplerDescriptor = {
      magFilter: magFilter === 1 ? 'linear' : 'nearest',
      minFilter: minFilter === 1 ? 'linear' : 'nearest',
      mipmapFilter: mipmapFilter === 1 ? 'linear' : 'nearest',
      addressModeU: addressModeU === 1 ? 'repeat' : addressModeU === 2 ? 'mirror-repeat' : 'clamp-to-edge',
      addressModeV: addressModeV === 1 ? 'repeat' : addressModeV === 2 ? 'mirror-repeat' : 'clamp-to-edge',
      addressModeW: addressModeW === 1 ? 'repeat' : addressModeW === 2 ? 'mirror-repeat' : 'clamp-to-edge',
      lodMinClamp: 0.0,
      lodMaxClamp: 32.0,
      maxAnisotropy: 1
    };

    console.log('🔧 JS SAMPLER: Creating sampler with descriptor:', samplerDescriptor);

    // Create the sampler
    const sampler = device.createSampler(samplerDescriptor);
    if (!sampler) {
      console.error('🔧 JS SAMPLER ERROR: Failed to create sampler');
      return 0;
    }

    // Store sampler in WebGPU object table and return handle
    const samplerHandle = _jsObjectInsert(sampler);
    console.log('🔧 JS SAMPLER SUCCESS: Created sampler with handle:', samplerHandle);
    return samplerHandle;

  } catch (err) {
    console.error('🔧 JS SAMPLER ERROR: Exception during sampler creation:', err);
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
    const safeGet = function() {
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
    WebGPU.importJsDevice = function(dev, parentPtr) {
      if (!dev || !dev.queue) {
        console.log('🔧 PATCH: importJsDevice received incomplete device – returning 0');
        return 0;
      }
      return originalImport(dev, parentPtr);
    };
    console.log('🔧 PATCH: WebGPU.importJsDevice safeguarded');
  };
  installPatch();
})();

// 🚑 SANITIZE FLAGS HELPERS
const GPUBufferUsageMask = (() => {
  const G = (typeof GPUBufferUsage !== 'undefined') ? GPUBufferUsage : {
    MAP_READ: 0x1, MAP_WRITE: 0x2, COPY_SRC: 0x4, COPY_DST: 0x8,
    INDEX: 0x10, VERTEX: 0x20, UNIFORM: 0x40, STORAGE: 0x80,
    INDIRECT: 0x100, QUERY_RESOLVE: 0x200
  };
  return G.MAP_READ | G.MAP_WRITE | G.COPY_SRC | G.COPY_DST | G.INDEX | G.VERTEX | G.UNIFORM | G.STORAGE | G.INDIRECT | G.QUERY_RESOLVE;
})();

const GPUTextureUsageMask = (() => {
  const T = (typeof GPUTextureUsage !== 'undefined') ? GPUTextureUsage : {
    COPY_SRC: 0x1, COPY_DST: 0x2, TEXTURE_BINDING: 0x4,
    STORAGE_BINDING: 0x8, RENDER_ATTACHMENT: 0x10
  };
  return T.COPY_SRC | T.COPY_DST | T.TEXTURE_BINDING | T.STORAGE_BINDING | T.RENDER_ATTACHMENT;
})();

function _sanitizeBufferUsage(rawUsage) {
  let usage = rawUsage & GPUBufferUsageMask; // keep only valid bits
  if (usage === 0) usage = (typeof GPUBufferUsage !== 'undefined') ? GPUBufferUsage.STORAGE : 0x80; // default
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
    const T = (typeof GPUTextureUsage !== 'undefined') ? GPUTextureUsage : {TEXTURE_BINDING:0x4, RENDER_ATTACHMENT:0x10};
    const defaultBits = ((T.TEXTURE_BINDING||0x4) | (T.RENDER_ATTACHMENT||0x10));
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
  return table.length - 1; // index is new handle
}
function _jsObjectGet(handle) {
  return Module.__godotWebGPUObjects[handle] || null;
}
Module.__getJsObject = _jsObjectGet;

// 🕵️  DIAGNOSTIC PATCH MONITOR
// -----------------------------
(function monitorGetDevicePatching() {
  const safeGet = function() {
    const dev = Module.preinitializedWebGPUDevice;
    if (!dev || !dev.queue) {
      console.log('🕵️ get_device called but queue missing → returning 0');
      return 0;
    }
    return WebGPU.importJsDevice(dev, 0);
  };

  const reapply = () => {
    if (typeof Module.emscripten_webgpu_get_device === 'function' && Module.emscripten_webgpu_get_device !== safeGet) {
      console.log('🕵️ Re-patching Module.emscripten_webgpu_get_device at', performance.now().toFixed(2), 'ms');
      Module.emscripten_webgpu_get_device = safeGet;
    }
    if (typeof _emscripten_webgpu_get_device === 'function' && _emscripten_webgpu_get_device !== safeGet) {
      console.log('🕵️ Re-patching global _emscripten_webgpu_get_device at', performance.now().toFixed(2), 'ms');
      window._emscripten_webgpu_get_device = safeGet;
    }
    setTimeout(reapply, 0); // keep checking each tick until stable
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
    if (orig.__patched_for_logs__) return; // avoid double-patch
    const wrapped = function(dev, parentPtr) {
      console.log('🕵️ importJsDevice invoked. dev?', !!dev, 'queue?', dev && dev.queue);
      return orig.call(this, dev, parentPtr);
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
  if (!Module.preinitializedWebGPUDevice) return;
  Module._webgpu_device = Module.preinitializedWebGPUDevice;
  Module._webgpu_device_ready = true;
  if (typeof Module._godot_webgpu_device_ready_callback === 'function') {
    console.log('🔔 Calling _godot_webgpu_device_ready_callback');
    try { Module._godot_webgpu_device_ready_callback(); } catch (e) { console.error('Callback threw', e); }
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

// Enhance _jsObjectInsert to also populate WebGPU.Internals.jsObjects so later look-ups succeed
(function patchJsObjectInsertSync() {
  const oldInsert = _jsObjectInsert;
  _jsObjectInsert = function(obj) {
    const idx = oldInsert(obj);
    if (typeof WebGPU !== 'undefined' && WebGPU.Internals && WebGPU.Internals.jsObjects) {
      WebGPU.Internals.jsObjects[idx >>> 0] = obj; // keep same numeric key
    }
    return idx;
  };
})();

// Provide a fallback in WebGPU.getJsObject so pointers that only exist in our custom table are still resolved.
(function patchGetJsObjectFallback() {
  const attempt = () => {
    if (typeof WebGPU === 'undefined' || typeof WebGPU.getJsObject !== 'function') {
      setTimeout(attempt, 0);
      return;
    }
    const origGet = WebGPU.getJsObject;
    if (origGet.__patched_with_fallback__) return;
    const wrapped = function(ptr) {
      let obj = origGet(ptr);
      if (obj !== undefined) return obj;
      return Module.__godotWebGPUObjects[ptr] || undefined;
    };
    wrapped.__patched_with_fallback__ = true;
    WebGPU.getJsObject = wrapped;
    console.log('🔧 PATCH: WebGPU.getJsObject now falls back to custom table');
  };
  attempt();
})();

// Globally sanitize every GPU buffer creation, even those bypassing our helpers
(function patchGPUDeviceCreateBuffer() {
  if (typeof GPUDevice === 'undefined' || !GPUDevice.prototype) return;
  const proto = GPUDevice.prototype;
  const origCreate = proto.createBuffer;
  if (!origCreate || origCreate.__patched_for_sanitize__) return;
  proto.createBuffer = function(descriptor) {
    try {
      const sanitized = Object.assign({}, descriptor);
      if (sanitized && 'usage' in sanitized) {
        sanitized.usage = _sanitizeBufferUsage(sanitized.usage);
      }
      return origCreate.call(this, sanitized);
    } catch (e) {
      console.error('🔧 PATCH ERROR: createBuffer sanitize failed', e);
      // Fallback to original call if something went wrong
      return origCreate.call(this, descriptor);
    }
  };
  proto.createBuffer.__patched_for_sanitize__ = true;
  console.log('🔧 PATCH: GPUDevice.createBuffer sanitized globally');
})();

// 🔔 WATCH & CALL NATIVE CALLBACKS WHEN THEY APPEAR
// -----------------------------
(function waitAndCallNativeCallbacks() {
  let called = false;
  const tick = () => {
    if (called) return;
    if (!Module.preinitializedWebGPUDevice || !Module.preinitializedWebGPUDevice.queue) {
      requestAnimationFrame(tick);
      return;
    }
    const setFn = Module._godot_webgpu_set_device_from_module;
    const readyFn = Module._godot_webgpu_device_ready_callback;
    if (typeof setFn === 'function') {
      console.log('🔔 Calling _godot_webgpu_set_device_from_module');
      try { setFn(); } catch (e) { console.error('set_device callback threw', e); }
    }
    if (typeof readyFn === 'function') {
      console.log('🔔 Calling _godot_webgpu_device_ready_callback');
      try { readyFn(); } catch (e) { console.error('device_ready callback threw', e); }
    }
    // Call only once
    called = true;
  };
  tick();
})();
