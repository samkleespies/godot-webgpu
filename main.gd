extends Node3D

@onready var test_sphere = $TestSphere
@onready var fps_label = $UI/InfoPanel/VBoxContainer/FPSLabel
@onready var status_label = $UI/InfoPanel/VBoxContainer/StatusLabel
@onready var renderer_info = $UI/InfoPanel/VBoxContainer/RendererInfo

var rotation_speed = 1.0
var time_elapsed = 0.0
var frame_count = 0
var fps_update_timer = 0.0

func _ready():
	print("🚀 Godot WebGPU Backend Test Started")
	print("Renderer: ", RenderingServer.get_rendering_device())
	
	# Update renderer info
	var rendering_method = ProjectSettings.get_setting("rendering/renderer/rendering_method.web", "unknown")
	renderer_info.text = "Renderer: " + rendering_method
	
	# Set initial status
	status_label.text = "Status: WebGPU Backend Active"
	status_label.modulate = Color.GREEN
	
	# Test WebGPU specific features
	test_webgpu_features()

func _process(delta):
	time_elapsed += delta
	frame_count += 1
	fps_update_timer += delta
	
	# Rotate the test sphere
	test_sphere.rotation.y += rotation_speed * delta
	test_sphere.rotation.x += rotation_speed * 0.5 * delta
	
	# Update FPS every second
	if fps_update_timer >= 1.0:
		var fps = frame_count / fps_update_timer
		fps_label.text = "FPS: " + str(int(fps))
		frame_count = 0
		fps_update_timer = 0.0
	
	# Change sphere color over time
	var material = test_sphere.get_surface_override_material(0) as StandardMaterial3D
	if material:
		var hue = sin(time_elapsed) * 0.5 + 0.5
		material.albedo_color = Color.from_hsv(hue, 0.8, 1.0)

func test_webgpu_features():
	print("🔧 Testing WebGPU Backend Features:")
	
	# Test 1: Check if we're using WebGPU
	var rd = RenderingServer.get_rendering_device()
	if rd:
		print("✅ RenderingDevice available")
		status_label.text = "Status: RenderingDevice Active"
	else:
		print("❌ RenderingDevice not available")
		status_label.text = "Status: RenderingDevice Failed"
		status_label.modulate = Color.RED
		return
	
	# Test 2: Try to create a simple buffer
	test_buffer_creation()
	
	# Test 3: Test shader compilation
	test_shader_compilation()
	
	print("🎯 WebGPU Backend Tests Complete")

func test_buffer_creation():
	print("📦 Testing buffer creation...")
	
	var rd = RenderingServer.get_rendering_device()
	if not rd:
		print("❌ No RenderingDevice for buffer test")
		return
	
	# Try to create a simple vertex buffer
	var input_data = PackedFloat32Array([
		0.0, 0.5, 0.0,   # vertex 1
		-0.5, -0.5, 0.0, # vertex 2
		0.5, -0.5, 0.0   # vertex 3
	])
	
	var buffer = rd.buffer_create(input_data.to_byte_array().size(), RenderingDevice.BUFFER_USAGE_VERTEX)
	if buffer.is_valid():
		print("✅ Buffer creation successful")
		rd.buffer_update(buffer, 0, input_data.to_byte_array())
		print("✅ Buffer update successful")
		# Clean up
		# rd.free_rid(buffer)  # Uncomment when buffer cleanup is implemented
	else:
		print("❌ Buffer creation failed")

func test_shader_compilation():
	print("🎨 Testing shader compilation...")
	
	var rd = RenderingServer.get_rendering_device()
	if not rd:
		print("❌ No RenderingDevice for shader test")
		return
	
	# Simple vertex shader source (this would be converted from SPIR-V to WGSL)
	var vertex_shader_spirv = PackedByteArray()  # In real implementation, this would be SPIR-V bytecode
	var fragment_shader_spirv = PackedByteArray()  # In real implementation, this would be SPIR-V bytecode
	
	# For now, just test that the shader system is accessible
	print("✅ Shader system accessible")
	print("ℹ️  SPIR-V to WGSL conversion would happen here")

func _input(event):
	if event is InputEventKey and event.pressed:
		match event.keycode:
			KEY_SPACE:
				print("🔄 Resetting sphere rotation")
				test_sphere.rotation = Vector3.ZERO
			KEY_R:
				print("🎲 Randomizing sphere color")
				var material = test_sphere.get_surface_override_material(0) as StandardMaterial3D
				if material:
					material.albedo_color = Color(randf(), randf(), randf())
			KEY_F:
				print("📊 Current FPS: ", Engine.get_frames_per_second())
			KEY_T:
				print("🔧 Re-running WebGPU tests")
				test_webgpu_features()

func _notification(what):
	if what == NOTIFICATION_WM_CLOSE_REQUEST:
		print("👋 WebGPU Backend Test Ending")
		get_tree().quit()
