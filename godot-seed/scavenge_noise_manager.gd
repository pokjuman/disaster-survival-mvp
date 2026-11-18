class_name ScavengeNoiseManager
extends Node

## Into the Dead: Our Darkest Days 스타일 룸 바이 룸 파밍 및 실시간 소음 게이지 관리자 (Godot 4.x)

signal noise_changed(current_noise: float, max_noise: float)
signal ambush_triggered(enemy_name: String)
signal room_cleared(room_index: int, loot_summary: Dictionary)

const MAX_NOISE: float = 100.0
const AMBUSH_THRESHOLD: float = 75.0

var current_noise: float = 0.0
var current_room: int = 1
var is_ambush_triggered: bool = false

## 수색 방식에 따른 소음 발생
enum SearchMode { SILENT, FAST, BREACH }

func reset_scavenge_run() -> void:
	current_noise = 0.0
	current_room = 1
	is_ambush_triggered = false
	emit_signal("noise_changed", current_noise, MAX_NOISE)

func perform_scavenge(mode: SearchMode) -> Dictionary:
	var noise_delta: float = 0.0
	var loot: Dictionary = {
		"scrap": 0,
		"ammo": 0,
		"canned_food": 0,
		"clean_water": 0,
		"bandage": 0
	}
	
	match mode:
		SearchMode.SILENT:
			noise_delta = randf_range(6.0, 10.0)
			loot["scrap"] = randi_range(1, 3)
			loot["ammo"] = randi_range(1, 2)
		SearchMode.FAST:
			noise_delta = randf_range(25.0, 35.0)
			loot["scrap"] = randi_range(3, 6)
			loot["ammo"] = randi_range(2, 5)
			if randf() < 0.4: loot["canned_food"] = 1
		SearchMode.BREACH:
			noise_delta = randf_range(40.0, 50.0)
			loot["scrap"] = randi_range(5, 8)
			loot["ammo"] = randi_range(4, 8)
			loot["bandage"] = 1
			
	add_noise(noise_delta)
	emit_signal("room_cleared", current_room, loot)
	return loot

func add_noise(amount: float) -> void:
	current_noise = min(MAX_NOISE, current_noise + amount)
	emit_signal("noise_changed", current_noise, MAX_NOISE)
	
	if current_noise >= MAX_NOISE or (current_noise >= AMBUSH_THRESHOLD and randf() < 0.45):
		trigger_ambush()

func trigger_ambush() -> void:
	if is_ambush_triggered:
		return
	is_ambush_triggered = true
	print("🚨 [위험] 과도한 소음으로 인해 인근 돌연변이가 유입되었습니다!")
	emit_signal("ambush_triggered", "방사능 돌연변이 워커")
