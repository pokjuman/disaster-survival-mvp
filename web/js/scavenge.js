// ============================================================================
// 재난생존 MVP — 탐사/소음 매니저 (T2)
// ----------------------------------------------------------------------------
// godot-seed/scavenge_noise_manager.gd 를 1:1 포팅한다.
// 수치·확률은 시드와 "정확히" 일치해야 한다. UI/상태 배선은 app.js 가 맡고,
// 여기서는 순수(pure)에 가까운 수색/소음/매복 로직만 담아 T4 가 재사용/테스트
// 하기 쉽게 한다.
//
// 시드 대응:
//   MAX_NOISE=100, AMBUSH_THRESHOLD=75
//   perform_scavenge(mode) -> loot, add_noise(delta)
//   add_noise: current = min(100, current+amount); 그 뒤 매복 판정
//   매복: current>=100  또는 (current>=75 && randf()<0.45) 이면 trigger
//   trigger_ambush: is_ambush_triggered 로 1회만, 적 이름 "방사능 돌연변이 워커"
//   reset: noise 0, room 1, ambush flag false
//
// Godot 난수 주의:
//   randi_range(a,b) 는 양끝 포함 정수  -> Math.floor(Math.random()*(b-a+1))+a
//   randf_range(a,b) 는 [a,b) 실수(부동소수) -> Math.random()*(b-a)+a
// ============================================================================

(function (root) {
  'use strict';

  var MAX_NOISE = 100;          // 시드: MAX_NOISE
  var AMBUSH_THRESHOLD = 75;    // 시드: AMBUSH_THRESHOLD
  var AMBUSH_CHANCE = 0.45;     // 시드: randf() < 0.45
  var AMBUSH_ENEMY_NAME = '방사능 돌연변이 워커'; // 시드: emit_signal("ambush_triggered", ...)

  // 시드엔 방 자동 진행이 없다(reset 이 room=1 로 되돌릴 뿐). 스펙의 "방 2~3개(제안)"
  // 을 따라 최소 진행만 넣는다. 아래 방 수/진행만 임의값이고, 수색/소음/매복 수치는
  // 전부 시드 그대로다.
  var MAX_ROOMS = 3; // 임의값(T2)

  var SearchMode = Object.freeze({ SILENT: 'SILENT', FAST: 'FAST', BREACH: 'BREACH' });

  // --- Godot 난수 대응 -------------------------------------------------------
  function randiRange(a, b) {
    // Godot randi_range(a,b): 양끝 포함
    return Math.floor(Math.random() * (b - a + 1)) + a;
  }
  function randfRange(a, b) {
    // Godot randf_range(a,b): 실수
    return Math.random() * (b - a) + a;
  }

  // --- 순수 함수: 수색 1회의 전리품 + 소음 증가량 산출 ------------------------
  // 시드 perform_scavenge 의 match 블록과 동일. loot 키 순서/이름도 시드와 정렬.
  function rollScavenge(mode) {
    var loot = {
      scrap: 0,
      ammo: 0,
      canned_food: 0,
      clean_water: 0, // 시드도 채우지 않음 — 항상 0 유지
      bandage: 0,
    };
    var noiseDelta = 0;

    switch (mode) {
      case SearchMode.SILENT:
        noiseDelta = randfRange(6.0, 10.0);
        loot.scrap = randiRange(1, 3);
        loot.ammo = randiRange(1, 2);
        break;
      case SearchMode.FAST:
        noiseDelta = randfRange(25.0, 35.0);
        loot.scrap = randiRange(3, 6);
        loot.ammo = randiRange(2, 5);
        if (Math.random() < 0.4) loot.canned_food = 1;
        break;
      case SearchMode.BREACH:
        noiseDelta = randfRange(40.0, 50.0);
        loot.scrap = randiRange(5, 8);
        loot.ammo = randiRange(4, 8);
        loot.bandage = 1;
        break;
      default:
        throw new Error('알 수 없는 수색 방식: ' + mode);
    }

    return { loot: loot, noiseDelta: noiseDelta };
  }

  // --- 매니저(상태 보유) ------------------------------------------------------
  // 시드 ScavengeNoiseManager 노드 1개에 대응. 테스트가 매 런마다 새 인스턴스를
  // 만들 수 있게 팩토리로 둔다. 시그널은 간단한 on/emit 로 대체.
  function createScavengeManager() {
    var state = {
      currentNoise: 0,       // 시드: current_noise
      currentRoom: 1,        // 시드: current_room
      isAmbushTriggered: false, // 시드: is_ambush_triggered
    };

    var listeners = { noise: [], ambush: [], room: [] };

    function on(evt, cb) {
      if (listeners[evt]) listeners[evt].push(cb);
    }
    function emit(evt, a, b) {
      var cbs = listeners[evt] || [];
      for (var i = 0; i < cbs.length; i++) cbs[i](a, b);
    }

    // 시드: reset_scavenge_run
    function reset() {
      state.currentNoise = 0;
      state.currentRoom = 1;
      state.isAmbushTriggered = false;
      emit('noise', state.currentNoise, MAX_NOISE);
    }

    // 시드: add_noise
    function addNoise(amount) {
      state.currentNoise = Math.min(MAX_NOISE, state.currentNoise + amount);
      emit('noise', state.currentNoise, MAX_NOISE);

      // 시드와 동일 순서/논리: >=100 확정, 또는 (>=75 && randf()<0.45)
      if (
        state.currentNoise >= MAX_NOISE ||
        (state.currentNoise >= AMBUSH_THRESHOLD && Math.random() < AMBUSH_CHANCE)
      ) {
        triggerAmbush();
      }
    }

    // 시드: trigger_ambush — 플래그로 1회만
    function triggerAmbush() {
      if (state.isAmbushTriggered) return;
      state.isAmbushTriggered = true;
      emit('ambush', AMBUSH_ENEMY_NAME);
    }

    // 시드: perform_scavenge — loot 산출 후 add_noise, room_cleared 방출
    function performScavenge(mode) {
      var rolled = rollScavenge(mode);
      addNoise(rolled.noiseDelta);
      emit('room', state.currentRoom, rolled.loot);
      return rolled; // { loot, noiseDelta }
    }

    // 임의값(T2): 방 진행 — 시드엔 없음. MAX_ROOMS 까지만 전진.
    function nextRoom() {
      if (state.currentRoom < MAX_ROOMS) {
        state.currentRoom += 1;
        emit('room', state.currentRoom, null);
        return true;
      }
      return false;
    }

    return {
      state: state,
      on: on,
      reset: reset,
      addNoise: addNoise,
      triggerAmbush: triggerAmbush,
      performScavenge: performScavenge,
      nextRoom: nextRoom,
    };
  }

  var api = {
    MAX_NOISE: MAX_NOISE,
    AMBUSH_THRESHOLD: AMBUSH_THRESHOLD,
    AMBUSH_CHANCE: AMBUSH_CHANCE,
    AMBUSH_ENEMY_NAME: AMBUSH_ENEMY_NAME,
    MAX_ROOMS: MAX_ROOMS, // 임의값(T2)
    SearchMode: SearchMode,
    randiRange: randiRange,
    randfRange: randfRange,
    rollScavenge: rollScavenge,
    createScavengeManager: createScavengeManager,
  };

  // buildless: 브라우저 전역 노출
  if (typeof window !== 'undefined') {
    window.Scavenge = api;
  }
  // Node 테스트: CommonJS 내보내기
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(this);
