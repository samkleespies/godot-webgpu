const vm = require('node:vm');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const source = fs.readFileSync(require('node:path').join(__dirname, '../js/pre_wgpu.js'), 'utf8');
function context(gpu) {
 const sandbox = {
  Module: {}, WebGPU: {}, navigator: {gpu}, console: {log(){},warn(){},error(){}},
  setTimeout(){return 1}, setInterval(){return 1}, clearInterval(){}, requestAnimationFrame(){},
 };
 sandbox.window=sandbox;
 vm.createContext(sandbox);vm.runInContext(source,sandbox);
 return sandbox;
}
(async()=>{
 const missing=context(undefined);missing.Module.addRunDependency('wgpu_device');
 await assert.rejects(vm.runInContext('createWebGPUDeviceAsync()',missing), /WebGPU not supported/);
 assert.equal(missing.Module.runDependencies,0);
 const device={queue:{}};
 const ready=context({async requestAdapter(){return {async requestDevice(){return device}}}});
 ready.Module.addRunDependency('wgpu_device');
 await vm.runInContext('createWebGPUDeviceAsync()',ready);
 assert.equal(ready.Module.preinitializedWebGPUDevice,device);
 assert.equal(ready.Module.runDependencies,0);
 assert.equal(ready.webgpuDeviceStorageComplete,true);
 console.log('WebGPU bootstrap success/failure and run-dependency cleanup pass.');
})().catch(e=>{console.error(e);process.exitCode=1});
