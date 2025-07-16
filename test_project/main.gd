extends Control

var rotation_speed = 2.0
var color_cycle_speed = 1.0
var time = 0.0
var rectangles = []

func _ready():
	print("WebGPU Advanced Test Project Started!")

	# Change the page title to confirm _ready() is running (web-compatible)
	print("🎉 GODOT WEBGPU _READY() EXECUTED! 🎉")

	# Detect rendering backend
	var rendering_method = ProjectSettings.get_setting("rendering/renderer/rendering_method", "unknown")
	var rendering_driver = ProjectSettings.get_setting("rendering/rendering_device/driver", "unknown")

	print("Rendering Method: ", rendering_method)
	print("Rendering Driver: ", rendering_driver)

	# Create title label
	var title_label = Label.new()
	title_label.text = "Godot Rendering Backend Test"
	title_label.position = Vector2(50, 20)
	title_label.size = Vector2(400, 50)
	title_label.add_theme_font_size_override("font_size", 24)
	add_child(title_label)

	# Create status label
	var status_label = Label.new()
	status_label.name = "StatusLabel"

	# Use the reliable rendering driver detection
	if rendering_driver == "webgpu":
		status_label.text = "Using WebGPU Renderer ✅"
		status_label.modulate = Color.GREEN
		print("WebGPU renderer confirmed via ProjectSettings")
	else:
		status_label.text = "Using " + rendering_driver + " Renderer"
		status_label.modulate = Color.YELLOW
		print("Non-WebGPU renderer detected: ", rendering_driver)

	status_label.position = Vector2(50, 70)
	status_label.size = Vector2(500, 30)
	add_child(status_label)

	# Try to get rendering device info (web-compatible) - but don't rely on it for status
	print("Attempting to get rendering device info...")
	if RenderingServer.get_rendering_device():
		print("Rendering device is available!")
	else:
		print("Rendering device not available to GDScript (this is normal for WebGPU)")

	# Create animated rectangles
	create_animated_demo()

	# Create performance info
	create_performance_display()

func create_animated_demo():
	# Create multiple animated rectangles
	for i in range(5):
		var rect = ColorRect.new()
		rect.size = Vector2(80, 80)
		rect.position = Vector2(100 + i * 100, 150)
		rect.color = Color.from_hsv(i * 0.2, 0.8, 0.9)
		add_child(rect)
		rectangles.append(rect)

	# Create a spinning triangle (using polygon)
	var triangle = Polygon2D.new()
	triangle.polygon = PackedVector2Array([
		Vector2(0, -40),
		Vector2(-35, 35),
		Vector2(35, 35)
	])
	triangle.color = Color.CYAN
	triangle.position = Vector2(400, 300)
	add_child(triangle)
	rectangles.append(triangle)

func create_performance_display():
	# FPS counter
	var fps_label = Label.new()
	fps_label.name = "FPSLabel"
	fps_label.text = "FPS: 60"
	fps_label.position = Vector2(50, 400)
	fps_label.size = Vector2(200, 30)
	add_child(fps_label)

	# Render info (web-compatible)
	var render_info = Label.new()
	render_info.name = "RenderInfo"
	var current_driver = ProjectSettings.get_setting("rendering/rendering_device/driver", "unknown")
	var current_method = ProjectSettings.get_setting("rendering/renderer/rendering_method", "unknown")
	render_info.text = "Driver: " + current_driver + " | Method: " + current_method
	render_info.position = Vector2(50, 430)
	render_info.size = Vector2(600, 30)
	add_child(render_info)

func _process(delta):
	time += delta

	# Update FPS
	var fps_label = get_node("FPSLabel")
	if fps_label:
		fps_label.text = "FPS: " + str(Engine.get_frames_per_second())

	# Animate rectangles
	for i in range(rectangles.size()):
		var rect = rectangles[i]
		if rect is ColorRect:
			# Bounce animation
			rect.position.y = 150 + sin(time * 2.0 + i * 0.5) * 30
			# Color cycling
			rect.color = Color.from_hsv((time * color_cycle_speed + i * 0.2), 0.8, 0.9)
		elif rect is Polygon2D:
			# Rotate triangle
			rect.rotation += delta * rotation_speed
			# Pulsing effect
			var scale = 1.0 + sin(time * 3.0) * 0.3
			rect.scale = Vector2(scale, scale)

func _input(event):
	if event is InputEventKey and event.pressed:
		match event.keycode:
			KEY_SPACE:
				print("WebGPU Test: Space pressed - toggling animation speed")
				rotation_speed = 4.0 if rotation_speed == 2.0 else 2.0
			KEY_C:
				print("WebGPU Test: C pressed - cycling colors faster")
				color_cycle_speed = 3.0 if color_cycle_speed == 1.0 else 1.0
