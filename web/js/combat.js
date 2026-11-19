// ============================================================================
// 재난생존 MVP — 전투(전술 그리드) 매니저 (T3)
// ----------------------------------------------------------------------------
// godot-seed/tactical_grid_combat.gd 를 1:1 포팅한다.
// 수치·공식·확률은 시드와 "정확히" 일치해야 한다. UI/상태 배선은 app.js 가 맡고,
// 여기서는 순수(pure)에 가까운 전투 로직만 담아 Node 단위 테스트와 T4(출정 루프)
// 재사용이 쉽게 한다.
//
// 시드 대응(핵심):
//   GRID_SIZE=6, max_ap=6, player_hp=100, ammo=12, bandages=2
//   player_pos=(0,2), enemy_pos=(5,3), enemy_name="돌연변이 워커"
//   엄폐물: (2,1)=HALF, (2,4)=FULL, (3,2)=HALF / 위험: (4,1)=RADIATION
//   이동 1AP(인접 1칸·엄폐/적 타일 불가·방사능 진입 시 HP-5)
//   속사 2AP: hit=clamp(0.95-dist*0.08-cover,0.25,0.95), dmg randi(16,26)
//   조준 4AP: 항상 적중, dmg randi(38,55)
//   응급 3AP: HP +35(min maxHp), 붕대 -1
//   엄폐 방어: 인접 FULL=0.50 / HALF=0.25 중 최대값
//   적 AI: dist>1 이면 1칸 접근(|dx|>|dy| → x축, 아니면 y축[동률 포함]),
//          인접이면 근접 base randi(14,24)·int(base*(1-cover)) 감쇄
//   승리: enemy_hp<=0 → 고철 randi(4,8) / 패배: player_hp<=0
//
// 시드 수치 주의(T4/확인 항목):
//   - enemy_hp 변수 기본값은 65 지만, _ready()가 start_combat("돌연변이 워커", 70)
//     으로 덮어써 시드가 "실제로 도는" 값은 70. 여기 standalone 기본값은 70.
//   - 매복 적 이름: T2 는 "방사능 돌연변이 워커", 전투 시드는 "돌연변이 워커".
//     어느 쪽을 쓸지 T4 에서 확정(여기선 시드 전투값 "돌연변이 워커"를 기본으로).
//   - 조준사격: 시드엔 명중 판정이 없어 항상 적중. 기획 "+35% 명중"은 적용 안 함.
//   - 플레이어 근접 공격(탄약 0 대안)은 시드에 없음 → 만들지 않음(T4 확인 항목).
//
// Godot 난수 주의(T2 와 동일):
//   randi_range(a,b) 는 양끝 포함 정수 → Math.floor(Math.random()*(b-a+1))+a
// ============================================================================

(function (root) {
  'use strict';

  var GRID_SIZE = 6;          // 시드: GRID_SIZE
  var MAX_AP = 6;             // 시드: max_ap
  var ENEMY_NAME = '돌연변이 워커'; // 시드: enemy_name (전투 시드값)
  var ENEMY_HP_READY = 70;   // 시드 _ready(): start_combat(..., 70) — 실제 구동값
  var ENEMY_HP_VAR = 65;     // 시드 var enemy_hp 기본값(덮어쓰기됨) — 참고용

  // 탄약 0 대안 근접 공격 — 시드에 없음(T4 보완 규칙 "탄약 0일 때 근접 기본 행동").
  // 사격보다 싸되(2 AP) 피해가 작고 인접해야만 가능 → 탄약이 떨어져도 교착되지 않게.
  var MELEE_AP = 2;        // 임의값(T4): 근접 공격 AP 비용
  var MELEE_DMG_MIN = 6;   // 임의값(T4): 근접 피해 하한
  var MELEE_DMG_MAX = 12;  // 임의값(T4): 근접 피해 상한

  // 엄폐/위험 타입 — 시드 enum
  var CoverType = Object.freeze({ NONE: 0, HALF: 1, FULL: 2 });
  var HazardType = Object.freeze({ NONE: 0, RADIATION: 1, FIRE: 2, TOXIC: 3 });

  // 키 "x,y" 로 좌표 사전 구성(시드 Vector2i Dictionary 대응)
  function key(x, y) { return x + ',' + y; }

  // 시드 grid_covers
  var DEFAULT_COVERS = {};
  DEFAULT_COVERS[key(2, 1)] = CoverType.HALF;
  DEFAULT_COVERS[key(2, 4)] = CoverType.FULL;
  DEFAULT_COVERS[key(3, 2)] = CoverType.HALF;

  // 시드 grid_hazards
  var DEFAULT_HAZARDS = {};
  DEFAULT_HAZARDS[key(4, 1)] = HazardType.RADIATION;

  // --- Godot 난수 대응 -------------------------------------------------------
  function randiRange(a, b) {
    // Godot randi_range(a,b): 양끝 포함
    return Math.floor(Math.random() * (b - a + 1)) + a;
  }

  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

  function manhattan(ax, ay, bx, by) {
    return Math.abs(ax - bx) + Math.abs(ay - by);
  }

  // --- 순수 함수: 명중 공식 --------------------------------------------------
  // 시드 action_quick_shot: clamp(0.95 - dist*0.08 - cover_def, 0.25, 0.95)
  function hitChance(dist, coverDef) {
    return clamp(0.95 - dist * 0.08 - coverDef, 0.25, 0.95);
  }

  // --- 순수 함수: 엄폐 방어율 -------------------------------------------------
  // 시드 get_target_cover_defense: 4방 인접 타일 중 엄폐물 최대값(FULL 0.50 / HALF 0.25)
  function coverDefenseAt(covers, x, y) {
    var dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    var maxCover = 0.0;
    for (var i = 0; i < dirs.length; i++) {
      var cx = x + dirs[i][0];
      var cy = y + dirs[i][1];
      var t = covers[key(cx, cy)];
      if (t === CoverType.FULL) maxCover = Math.max(maxCover, 0.50);
      else if (t === CoverType.HALF) maxCover = Math.max(maxCover, 0.25);
    }
    return maxCover;
  }

  // --- 매니저(상태 보유) ------------------------------------------------------
  // 시드 TacticalGridCombat 노드 1개에 대응. 테스트/런마다 새 인스턴스를 만들 수
  // 있게 팩토리로 둔다. 시그널은 간단한 on/emit 로 대체.
  //
  // opts(모두 선택): T4 가 실제 런 상태를 주입할 수 있게 매개변수화.
  //   enemyName, enemyHp, playerHp, playerMaxHp, maxAp, ammo, bandages,
  //   playerPos {x,y}, enemyPos {x,y}, covers, hazards
  function createCombat(opts) {
    opts = opts || {};

    var covers = opts.covers || DEFAULT_COVERS;
    var hazards = opts.hazards || DEFAULT_HAZARDS;

    var state = {
      gridSize: GRID_SIZE,
      player: {
        x: opts.playerPos ? opts.playerPos.x : 0,  // 시드 player_pos (0,2)
        y: opts.playerPos ? opts.playerPos.y : 2,
        hp: opts.playerHp != null ? opts.playerHp : 100,       // player_hp
        maxHp: opts.playerMaxHp != null ? opts.playerMaxHp : 100, // player_max_hp
      },
      enemy: {
        x: opts.enemyPos ? opts.enemyPos.x : 5,     // 시드 enemy_pos (5,3)
        y: opts.enemyPos ? opts.enemyPos.y : 3,
        name: opts.enemyName != null ? opts.enemyName : ENEMY_NAME,
        hp: opts.enemyHp != null ? opts.enemyHp : ENEMY_HP_READY, // 기본 70(= _ready)
        maxHp: opts.enemyHp != null ? opts.enemyHp : ENEMY_HP_READY,
      },
      ap: opts.maxAp != null ? opts.maxAp : MAX_AP,   // current_ap
      maxAp: opts.maxAp != null ? opts.maxAp : MAX_AP, // max_ap
      ammo: opts.ammo != null ? opts.ammo : 12,        // ammo_count
      bandages: opts.bandages != null ? opts.bandages : 2, // bandage_count
      isPlayerTurn: true,  // 시드: is_player_turn (플레이어 선공 고정)
      ended: false,        // 전투 종료 여부
      victory: false,      // 승리/패배
      fled: false,         // 도주로 종료됐는지(T4 보완 규칙)
      scrapReward: 0,      // 승리 시 고철 보상
    };

    // 근접 공격 수치 — opts 로 덮어쓸 수 있게(기본은 위 상수)
    var meleeAp = opts.meleeAp != null ? opts.meleeAp : MELEE_AP;
    var meleeMin = opts.meleeDmgMin != null ? opts.meleeDmgMin : MELEE_DMG_MIN;
    var meleeMax = opts.meleeDmgMax != null ? opts.meleeDmgMax : MELEE_DMG_MAX;

    var listeners = { ap: [], turn: [], ended: [], log: [], change: [] };
    function on(evt, cb) { if (listeners[evt]) listeners[evt].push(cb); }
    function emit(evt, a, b) {
      var cbs = listeners[evt] || [];
      for (var i = 0; i < cbs.length; i++) cbs[i](a, b);
    }
    function log(msg) { emit('log', msg); }
    function changed() { emit('change', state); }

    // 적 위치 기준 엄폐(내 사격 명중 차감) / 플레이어 위치 기준 엄폐(적 근접 감쇄)
    function enemyCover() { return coverDefenseAt(covers, state.enemy.x, state.enemy.y); }
    function playerCover() { return coverDefenseAt(covers, state.player.x, state.player.y); }

    // 시드: try_move_player (1 AP)
    function tryMovePlayer(tx, ty) {
      if (state.ended) return false;
      if (!state.isPlayerTurn || state.ap < 1) return false;

      var dist = manhattan(tx, ty, state.player.x, state.player.y);
      if (dist !== 1) return false; // 1칸씩만

      if (tx < 0 || tx >= GRID_SIZE || ty < 0 || ty >= GRID_SIZE) return false;

      // 엄폐물 타일 또는 적 타일 통과 불가
      if (covers[key(tx, ty)] !== undefined) return false;
      if (tx === state.enemy.x && ty === state.enemy.y) return false;

      state.player.x = tx;
      state.player.y = ty;
      state.ap -= 1;
      emit('ap', state.ap, state.maxAp);

      // 방사능 타일 피폭
      if (hazards[key(tx, ty)] === HazardType.RADIATION) {
        state.player.hp -= 5;
        log('☢️ 방사능 오염 구역 통과! 체력 -5');
      }
      changed();
      return true;
    }

    // 시드: action_quick_shot (2 AP, 탄약 1)
    function actionQuickShot() {
      if (state.ended) return false;
      if (!state.isPlayerTurn || state.ap < 2 || state.ammo < 1) return false;

      state.ap -= 2;
      state.ammo -= 1;
      emit('ap', state.ap, state.maxAp);

      var dist = manhattan(state.player.x, state.player.y, state.enemy.x, state.enemy.y);
      var coverDef = enemyCover();
      var hit = hitChance(dist, coverDef);

      if (Math.random() <= hit) {
        var dmg = randiRange(16, 26);
        state.enemy.hp = Math.max(0, state.enemy.hp - dmg);
        log('🎯 [속사 적중] ' + dmg + ' 피해! (적 남은 체력: ' + state.enemy.hp + ')');
      } else {
        log('💨 [속사 빗나감] 탄환이 빗나갔습니다!');
      }
      checkBattleEnd();
      changed();
      return true;
    }

    // 시드: action_aimed_shot (4 AP, 탄약 1) — 항상 적중
    function actionAimedShot() {
      if (state.ended) return false;
      if (!state.isPlayerTurn || state.ap < 4 || state.ammo < 1) return false;

      state.ap -= 4;
      state.ammo -= 1;
      emit('ap', state.ap, state.maxAp);

      var dmg = randiRange(38, 55);
      state.enemy.hp = Math.max(0, state.enemy.hp - dmg);
      log('💥 [정밀 조준 치명타] ' + dmg + '의 막대한 피해! (적 남은 체력: ' + state.enemy.hp + ')');

      checkBattleEnd();
      changed();
      return true;
    }

    // 시드: action_first_aid (3 AP, 붕대 1)
    function actionFirstAid() {
      if (state.ended) return false;
      if (!state.isPlayerTurn || state.ap < 3 || state.bandages < 1) return false;

      state.ap -= 3;
      state.bandages -= 1;
      state.player.hp = Math.min(state.player.maxHp, state.player.hp + 35);
      emit('ap', state.ap, state.maxAp);
      log('🩹 [응급처치] 상처 지혈 및 HP 35 회복');
      changed();
      return true;
    }

    // 탄약 0 대안: 근접 공격 (임의값 T4) — 인접(맨해튼 1)해야 하고 탄약 불필요.
    // 적 근접 전용이라 엄폐로 명중 차감하지 않음(항상 적중, 피해만 소량).
    function actionMelee() {
      if (state.ended) return false;
      if (!state.isPlayerTurn || state.ap < meleeAp) return false;
      var dist = manhattan(state.player.x, state.player.y, state.enemy.x, state.enemy.y);
      if (dist !== 1) return false; // 인접해야 근접 공격 가능

      state.ap -= meleeAp;
      emit('ap', state.ap, state.maxAp);

      var dmg = randiRange(meleeMin, meleeMax);
      state.enemy.hp = Math.max(0, state.enemy.hp - dmg);
      log('🔪 [근접 공격] ' + dmg + ' 피해! (적 남은 체력: ' + state.enemy.hp + ')');
      checkBattleEnd();
      changed();
      return true;
    }

    // 도주/이탈 (임의값 T4) — 시드에 없음. 조건: 내 턴·전투 진행 중.
    // 비용: 처치 보상(고철) 없음 + 출정 종료. 수집한 전리품·생존 스탯은 유지.
    // (귀환 정산 분기는 app.js 가 state.fled 로 처리)
    function flee() {
      if (state.ended) return false;
      if (!state.isPlayerTurn) return false;
      state.ended = true;
      state.victory = false;
      state.fled = true;
      log('🏃 도주 — 전투에서 이탈했다.');
      changed();
      return true;
    }

    // 시드: end_player_turn — AP 0, 적 턴 실행
    // delayMs: 시드 0.6s 연출 대응(헤드리스/테스트는 0). 0 이면 동기 실행.
    function endPlayerTurn(delayMs) {
      if (state.ended) return false;
      if (!state.isPlayerTurn) return false;
      state.isPlayerTurn = false;
      state.ap = 0;
      emit('turn', false);

      var ms = delayMs != null ? delayMs : 0;
      if (ms > 0 && typeof setTimeout !== 'undefined') {
        setTimeout(executeEnemyTurn, ms);
      } else {
        executeEnemyTurn();
      }
      return true;
    }

    // 시드: execute_enemy_turn — 접근 또는 근접
    function executeEnemyTurn() {
      if (state.ended) return;

      var dx = state.player.x - state.enemy.x;
      var dy = state.player.y - state.enemy.y;
      var dist = Math.abs(dx) + Math.abs(dy);

      if (dist > 1) {
        // 1칸 접근 — 시드: |dx|>|dy| 면 x축, 아니면 y축(동률 포함 y)
        if (Math.abs(dx) > Math.abs(dy)) {
          state.enemy.x += dx > 0 ? 1 : -1;
        } else {
          state.enemy.y += dy > 0 ? 1 : -1;
        }
        // 시드는 적을 엄폐/위험 타일에서 막지 않음 — 그대로 재현
        log('🧟 ' + state.enemy.name + '가 플레이어를 향해 접근합니다.');
      } else {
        // 근접 공격 — 플레이어 엄폐 감쇄
        var pCover = playerCover();
        var base = randiRange(14, 24);
        var actual = Math.trunc(base * (1.0 - pCover)); // 시드 int(): 0 방향 절단
        state.player.hp -= actual;
        log('🩸 [피격] ' + state.enemy.name + '의 근접 공격! ' + actual +
          ' 피해 (엄폐 감쇄: ' + Math.trunc(pCover * 100) + '%)');
      }

      if (state.player.hp <= 0) {
        state.ended = true;
        state.victory = false;
        emit('ended', false, 0);
        log('💀 패배 — 쉼터로 돌아가지 못했다.');
        changed();
        return;
      }

      // 새 턴 시작
      state.isPlayerTurn = true;
      state.ap = state.maxAp;
      emit('turn', true);
      emit('ap', state.ap, state.maxAp);
      changed();
    }

    // 시드: check_battle_end — enemy_hp<=0 이면 승리 + 고철 randi(4,8)
    function checkBattleEnd() {
      if (state.enemy.hp <= 0 && !state.ended) {
        var scrap = randiRange(4, 8);
        state.ended = true;
        state.victory = true;
        state.scrapReward = scrap;
        emit('ended', true, scrap);
        log('🏆 승리! 전리품 고철 ' + scrap + '개 획득');
        changed();
      }
    }

    // 합법 이동 타일 목록(UI 하이라이트용) — 규칙과 동일 기준으로 산출
    function legalMoves() {
      if (!state.isPlayerTurn || state.ap < 1 || state.ended) return [];
      var dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      var out = [];
      for (var i = 0; i < dirs.length; i++) {
        var tx = state.player.x + dirs[i][0];
        var ty = state.player.y + dirs[i][1];
        if (tx < 0 || tx >= GRID_SIZE || ty < 0 || ty >= GRID_SIZE) continue;
        if (covers[key(tx, ty)] !== undefined) continue;
        if (tx === state.enemy.x && ty === state.enemy.y) continue;
        out.push({ x: tx, y: ty });
      }
      return out;
    }

    return {
      state: state,
      covers: covers,
      hazards: hazards,
      on: on,
      tryMovePlayer: tryMovePlayer,
      actionQuickShot: actionQuickShot,
      actionAimedShot: actionAimedShot,
      actionFirstAid: actionFirstAid,
      actionMelee: actionMelee,
      flee: flee,
      endPlayerTurn: endPlayerTurn,
      executeEnemyTurn: executeEnemyTurn,
      checkBattleEnd: checkBattleEnd,
      enemyCover: enemyCover,
      playerCover: playerCover,
      legalMoves: legalMoves,
    };
  }

  var api = {
    GRID_SIZE: GRID_SIZE,
    MAX_AP: MAX_AP,
    ENEMY_NAME: ENEMY_NAME,
    ENEMY_HP_READY: ENEMY_HP_READY, // 70 (_ready 실제 구동값)
    ENEMY_HP_VAR: ENEMY_HP_VAR,     // 65 (var 기본값·덮어쓰기됨)
    MELEE_AP: MELEE_AP,             // 임의값(T4)
    MELEE_DMG_MIN: MELEE_DMG_MIN,   // 임의값(T4)
    MELEE_DMG_MAX: MELEE_DMG_MAX,   // 임의값(T4)
    CoverType: CoverType,
    HazardType: HazardType,
    DEFAULT_COVERS: DEFAULT_COVERS,
    DEFAULT_HAZARDS: DEFAULT_HAZARDS,
    key: key,
    randiRange: randiRange,
    clamp: clamp,
    manhattan: manhattan,
    hitChance: hitChance,
    coverDefenseAt: coverDefenseAt,
    createCombat: createCombat,
  };

  // buildless: 브라우저 전역 노출
  if (typeof window !== 'undefined') {
    window.Combat = api;
  }
  // Node 테스트: CommonJS 내보내기
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(this);
