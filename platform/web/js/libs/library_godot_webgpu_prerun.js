// library_godot_webgpu_prerun.js
// WebGPU device pre-initialization to prevent timing crashes
// This ensures Module.preinitializedWebGPUDevice is available before library_webgpu.js initializes
// NOTE: This is a pre-js file, so it uses plain JavaScript, not LibraryManager

console.log("GODOT WEBGPU PRERUN: Pre-JS script loaded");

// Global variable to store the device for debugging
var webgpuPreDevice = null;

function webgpuCreateDevice() {
  console.log("GODOT WEBGPU PRERUN: Starting device creation...");

  if (!navigator.gpu) {
    console.error("GODOT WEBGPU PRERUN ERROR: WebGPU not supported – falling back.");
    return;
  }

  console.log("GODOT WEBGPU PRERUN: Adding run dependency for webgpu-device...");
  addRunDependency('webgpu-device');

  navigator.gpu.requestAdapter()
    .then(adapter => {
      if (!adapter) {
        throw new Error('No WebGPU adapter available');
      }
      console.log("GODOT WEBGPU PRERUN: WebGPU adapter obtained");
      return adapter.requestDevice();
    })
    .then(device => {
      console.log("GODOT WEBGPU PRERUN: WebGPU device created successfully");
      console.log("GODOT WEBGPU PRERUN: Device has queue:", !!device.queue);

      // Store device globally for debugging
      webgpuPreDevice = device;

      // KEY LINE: Set the device BEFORE library_webgpu.js initializes
      Module['preinitializedWebGPUDevice'] = device;

      // CRITICAL FIX: Set device in multiple places to ensure Emscripten WebGPU can find it

      // 1. Set in Module.webgpu (for Emscripten WebGPU library) - DON'T overwrite the whole object
      Module.webgpu = Module.webgpu || {};
      Module.webgpu.device = device;
      Module.webgpu.queue = device.queue;
      console.log("GODOT WEBGPU PRERUN: Device set in Module.webgpu system (preserving existing managers)");

      // 2. Set global device for emscripten_webgpu_get_device() function
      globalThis.emscriptenWebGPUDevice = device;

      // 3. Override emscripten_webgpu_get_device to return our device
      if (typeof Module.asm !== 'undefined') {
        // For when asm is already loaded
        Module.asm.emscripten_webgpu_get_device = function() {
          console.log("GODOT WEBGPU PRERUN: emscripten_webgpu_get_device called, returning device");
          return device;
        };
      }

      // 4. Set up a global function that Emscripten can call
      globalThis.getWebGPUDevice = function() {
        console.log("GODOT WEBGPU PRERUN: getWebGPUDevice called, returning device");
        return device;
      };

      // 5. Skip handle manager registration since they're not available in this Emscripten build
      console.log("GODOT WEBGPU PRERUN: Skipping handle manager registration - using direct JavaScript objects");
      console.log("GODOT WEBGPU PRERUN: Module.webgpu =", Module.webgpu);
      console.log("GODOT WEBGPU PRERUN: Device and queue will be returned directly to C++");

      console.log("GODOT WEBGPU PRERUN: Module.preinitializedWebGPUDevice set successfully");
      console.log("GODOT WEBGPU PRERUN: Removing run dependency...");
      removeRunDependency('webgpu-device');
    })
    .catch(err => {
      console.error("GODOT WEBGPU PRERUN ERROR: Couldn't obtain WebGPU device:", err);
      console.log("GODOT WEBGPU PRERUN: Removing run dependency (failed)...");
      removeRunDependency('webgpu-device');            // fail fast
    });
}

// Add to preRun callbacks - let Emscripten handle WebGPU device creation
if (!Module.preRun) {
  Module.preRun = [];
}

Module.preRun.push(function() {
  console.log("GODOT WEBGPU PRERUN: DISABLED - Using pre_wgpu.js instead to avoid conflicts");
  console.log("GODOT WEBGPU PRERUN: Device creation handled by pre_wgpu.js run dependency system");
});


