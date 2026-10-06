// library_godot_webgpu_prerun.js
// WebGPU device pre-initialization to prevent timing crashes
// This ensures Module.preinitializedWebGPUDevice is available before library_webgpu.js initializes
// NOTE: This is a pre-js file, so it uses plain JavaScript, not LibraryManager

console.log('GODOT WEBGPU PRERUN: Pre-JS script loaded');

// Add to preRun callbacks - let Emscripten handle WebGPU device creation
if (!Module.preRun) {
	Module.preRun = [];
}

Module.preRun.push(function () {
	console.log('GODOT WEBGPU PRERUN: DISABLED - Using pre_wgpu.js instead to avoid conflicts');
	console.log('GODOT WEBGPU PRERUN: Device creation handled by pre_wgpu.js run dependency system');
});
