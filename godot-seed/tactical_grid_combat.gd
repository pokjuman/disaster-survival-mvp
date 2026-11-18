class_name TacticalGridCombat
extends Node2D

## Day R Survival 스타일 턴제 전술 그리드 전투 매니저 (Godot 4.x)
## 6x6 그리드, AP 행동력 시스템, 엄폐율 계산, 탄도학 및 하드코어 상태이상 처리

signal turn_started(is_player: bool)
signal combat_ended(victory: bool, scrap_reward: int)
signal ap_changed(current_ap: int, max_ap: int)

enum CoverType { NONE, HALF, FULL }
enum HazardType { NONE, RADIATION, FIRE, TOXIC }

const GRID_SIZE: int = 6
const TILE_PX: int = 64

# Combatant Data
var player_pos: Vector2i = Vector2i(0, 2)
var player_hp: int = 100
var player_max_hp: int = 100
var current_ap: int = 6
var max_ap: int = 6

var enemy_pos: Vector2i = Vector2i(5, 3)
var enemy_name: String = "돌연변이 워커"
var enemy_hp: int = 65
var enemy_max_hp: int = 65

var ammo_count: int = 12
var bandage_count: int = 2

# Grid Data (Covers & Hazards)
var grid_covers: Dictionary = {
	Vector2i(2, 1): CoverType.HALF,
	Vector2i(2, 4): CoverType.FULL,
	Vector2i(3, 2): CoverType.HALF
}
var grid_hazards: Dictionary = {
	Vector2i(4, 1): HazardType.RADIATION
}

var is_player_turn: bool = true

func _ready() -> void:
	start_combat("돌연변이 워커", 70)

func start_combat(e_name: String, e_hp: int) -> void:
	enemy_name = e_name
	enemy_hp = e_hp
	enemy_max_hp = e_hp
	current_ap = max_ap
	is_player_turn = true
	emit_signal("turn_started", true)
	emit_signal("ap_changed", current_ap, max_ap)
	queue_redraw()

## 이동 액션 (1 AP 소모)
func try_move_player(target_tile: Vector2i) -> bool:
	if not is_player_turn or current_ap < 1:
		return false
	
	var dist: int = abs(target_tile.x - player_pos.x) + abs(target_tile.y - player_pos.y)
	if dist != 1:
		return false # 1칸씩만 이동 가능
		
	if target_tile.x < 0 or target_tile.x >= GRID_SIZE or target_tile.y < 0 or target_tile.y >= GRID_SIZE:
		return false
		
	if grid_covers.has(target_tile) or target_tile == enemy_pos:
		return false # 장애물 또는 적 타일 통과 불가
		
	player_pos = target_tile
	current_ap -= 1
	emit_signal("ap_changed", current_ap, max_ap)
	
	# 방사능 타일 피폭 검사
	if grid_hazards.get(player_pos, HazardType.NONE) == HazardType.RADIATION:
		player_hp -= 5
		print("☢️ 방사능 오염 구역 통과! 체력 -5")
		
	queue_redraw()
	return true

## 일반 사격 (2 AP 소모, 탄약 1 소모)
func action_quick_shot() -> void:
	if not is_player_turn or current_ap < 2 or ammo_count < 1:
		return
		
	current_ap -= 2
	ammo_count -= 1
	emit_signal("ap_changed", current_ap, max_ap)
	
	var dist: int = abs(player_pos.x - enemy_pos.x) + abs(player_pos.y - enemy_pos.y)
	var cover_def: float = get_target_cover_defense(enemy_pos)
	var hit_chance: float = clamp(0.95 - (dist * 0.08) - cover_def, 0.25, 0.95)
	
	if randf() <= hit_chance:
		var dmg: int = randi_range(16, 26)
		enemy_hp = max(0, enemy_hp - dmg)
		print("🎯 [속사 적중] %d 피해! (적 남은 체력: %d)" % [dmg, enemy_hp])
	else:
		print("💨 [속사 빗나감] 탄환이 빗나갔습니다!")
		
	check_battle_end()
	queue_redraw()

## 정밀 조준 사격 (4 AP 소모, 탄약 1 소모, 높은 치명타)
func action_aimed_shot() -> void:
	if not is_player_turn or current_ap < 4 or ammo_count < 1:
		return
		
	current_ap -= 4
	ammo_count -= 1
	emit_signal("ap_changed", current_ap, max_ap)
	
	var dmg: int = randi_range(38, 55)
	enemy_hp = max(0, enemy_hp - dmg)
	print("💥 [정밀 조준 치명타] %d의 막대한 피해! (적 남은 체력: %d)" % [dmg, enemy_hp])
	
	check_battle_end()
	queue_redraw()

## 응급처치 (3 AP 소모, 붕대 1 소모)
func action_first_aid() -> void:
	if not is_player_turn or current_ap < 3 or bandage_count < 1:
		return
		
	current_ap -= 3
	bandage_count -= 1
	player_hp = min(player_max_hp, player_hp + 35)
	emit_signal("ap_changed", current_ap, max_ap)
	print("🩹 [응급처치] 상처 지혈 및 HP 35 회복")
	queue_redraw()

## 턴 종료
func end_player_turn() -> void:
	is_player_turn = false
	current_ap = 0
	emit_signal("turn_started", false)
	execute_enemy_turn()

## 적 AI 턴 루틴
func execute_enemy_turn() -> void:
	await get_tree().create_timer(0.6).timeout
	
	var dx: int = player_pos.x - enemy_pos.x
	var dy: int = player_pos.y - enemy_pos.y
	var dist: int = abs(dx) + abs(dy)
	
	if dist > 1:
		# 플레이어 쪽으로 1칸 전진
		if abs(dx) > abs(dy):
			enemy_pos.x += 1 if dx > 0 else -1
		else:
			enemy_pos.y += 1 if dy > 0 else -1
		print("🧟 %s가 플레이어를 향해 접근합니다." % enemy_name)
	else:
		# 근접 공격
		var player_cover: float = get_target_cover_defense(player_pos)
		var base_dmg: int = randi_range(14, 24)
		var actual_dmg: int = int(base_dmg * (1.0 - player_cover))
		player_hp -= actual_dmg
		print("🩸 [피격] %s의 근접 공격! %d 피해 (엄폐 감쇄: %d%%)" % [enemy_name, actual_dmg, int(player_cover * 100)])
		
	if player_hp <= 0:
		emit_signal("combat_ended", false, 0)
		return
		
	# 새 턴 시작
	is_player_turn = true
	current_ap = max_ap
	emit_signal("turn_started", true)
	emit_signal("ap_changed", current_ap, max_ap)
	queue_redraw()

func get_target_cover_defense(pos: Vector2i) -> float:
	# 주변 엄폐물 검사
	var directions: Array[Vector2i] = [Vector2i(1,0), Vector2i(-1,0), Vector2i(0,1), Vector2i(0,-1)]
	var max_cover: float = 0.0
	for d in directions:
		var check: Vector2i = pos + d
		if grid_covers.has(check):
			var type: CoverType = grid_covers[check]
			if type == CoverType.FULL: max_cover = max(max_cover, 0.50)
			elif type == CoverType.HALF: max_cover = max(max_cover, 0.25)
	return max_cover

func check_battle_end() -> void:
	if enemy_hp <= 0:
		var scrap: int = randi_range(4, 8)
		emit_signal("combat_ended", true, scrap)
		print("🏆 승리! 전리품 고철 %d개 획득" % scrap)
