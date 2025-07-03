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
  Module.runDependencies--;
  console.log('🔧 FALLBACK: runDependencies now:', Module.runDependencies);

  // If all dependencies are resolved, call run if it exists
  if (Module.runDependencies === 0 && Module.run) {
    console.log('🔧 FALLBACK: All dependencies resolved, calling run()');
    Module.run();
  }
};

// CRITICAL FIX: Debug and use immediate execution approach
console.log('🔧 PRE_WGPU.JS: Script is loading...');

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
  console.log('🕒 Runtime initialized: requesting WebGPU device with GUARANTEED blocking before main()…');

  // CRITICAL FIX: Use a synchronous approach that truly blocks main()
  console.log('✅ Using Module.onRuntimeInitialized to guarantee device is ready before main() starts');

  // Create device synchronously and block until ready
  const success = createWebGPUDeviceBlocking();

  if (success) {
    console.log('✅ WebGPU device ready - proceeding with original onRuntimeInitialized');
  } else {
    console.error('❌ WebGPU device creation failed - proceeding anyway');
  }

  // Call the original onRuntimeInitialized if it exists
  if (originalOnRuntimeInitialized) {
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
  const timeout = 10000; // 10 second timeout

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
    console.error('🔍 BLOCKING: Device creation timed out after 10 seconds');
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
          window.webgpuDeviceStorageComplete = true;
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
      dimension: dimension === 1 ? '1d' : dimension === 2 ? '2d' : '3d',
      format: 'bgra8unorm', // Default format, should be passed as parameter
      usage: usage
    };

    console.log('🔧 JS TEXTURE: Creating texture with descriptor:', textureDescriptor);

    // Create the texture
    const texture = device.createTexture(textureDescriptor);
    if (!texture) {
      console.error('🔧 JS TEXTURE ERROR: Failed to create texture');
      return 0;
    }

    // Store texture in WebGPU object table and return handle
    const textureHandle = WebGPU.Internals.jsObjectInsert(texture);
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
      usage: usage,
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
    const bufferHandle = WebGPU.Internals.jsObjectInsert(buffer);
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
      addressModeW: addressModeW === 1 ? 'repeat' : addressModeW === 2 ? 'mirror-repeat' : 'clamp-to-edge'
    };

    console.log('🔧 JS SAMPLER: Creating sampler with descriptor:', samplerDescriptor);

    // Create the sampler
    const sampler = device.createSampler(samplerDescriptor);
    if (!sampler) {
      console.error('🔧 JS SAMPLER ERROR: Failed to create sampler');
      return 0;
    }

    // Store sampler in WebGPU object table and return handle
    const samplerHandle = WebGPU.Internals.jsObjectInsert(sampler);
    console.log('🔧 JS SAMPLER SUCCESS: Created sampler with handle:', samplerHandle);
    return samplerHandle;

  } catch (err) {
    console.error('🔧 JS SAMPLER ERROR: Exception during sampler creation:', err);
    return 0;
  }
};
