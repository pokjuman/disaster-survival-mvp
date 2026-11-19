// ============================================================================
// 재난생존 MVP — 중앙 게임 상태 (T1 스캐폴드)
// ----------------------------------------------------------------------------
// 수치는 godot-seed/ 의 두 스크립트를 기준으로 한다.
//   - tactical_grid_combat.gd : 전투(HP/AP/탄약/붕대, 적 수치)
//   - scavenge_noise_manager.gd : 탐사(소음, 수색 전리품, 방 인덱스)
// T1 은 골격만 만든다. 여기 담긴 값은 T2~T5 가 그대로 끼워 쓰도록 자리만 잡아둔다.
// 게임 로직(소음 누적·전투 판정·루프)은 T1 범위가 아니다.
// ============================================================================

// 화면 상태 머신의 상태값
const Screen = Object.freeze({
  SHELTER: 'SHELTER',  // 쉼터
  SCAVENGE: 'SCAVENGE', // 탐사
  COMBAT: 'COMBAT',    // 전투
});

// 단일 중앙 상태 객체. T2~T5 가 이 객체를 읽고 갱신한다.
const gameState = {
  // 플레이어 — tactical_grid_combat.gd 기준
  player: {
    hp: 100,       // player_hp
    maxHp: 100,    // player_max_hp
    ap: 6,         // current_ap
    maxAp: 6,      // max_ap
    ammo: 12,      // ammo_count
    bandages: 2,   // bandage_count
  },

  // 소지품/전리품 카운터 — scavenge_noise_manager.gd 의 loot 키와 정렬
  // 출발값은 전부 0(아직 아무것도 줍지 않은 상태). // 임의값(T1)
  inventory: {
    scrap: 0,
    ammo: 0,
    cannedFood: 0,   // canned_food
    cleanWater: 0,   // clean_water
    bandage: 0,
  },

  // 탐사 — scavenge_noise_manager.gd 기준
  scavenge: {
    noise: 0,        // current_noise
    maxNoise: 100,   // MAX_NOISE
    currentRoom: 1,  // current_room
  },

  // 적(자리표시) — tactical_grid_combat.gd 기준. T3 전투에서 교체/확장.
  enemy: {
    name: '돌연변이 워커',  // enemy_name
    hp: 65,               // enemy_hp
    maxHp: 65,            // enemy_max_hp
  },

  // 메타
  meta: {
    currentScreen: Screen.SHELTER, // 시작 화면 // 임의값(T1)
  },
};

// 모듈 없이 전역으로 노출(buildless, 스크립트 태그 로드).
window.Screen = Screen;
window.gameState = gameState;
