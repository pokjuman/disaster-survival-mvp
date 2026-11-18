// ============================================================================
// 재난생존 MVP — 화면 상태 머신 + 터치 내비게이션 (T1)
// ----------------------------------------------------------------------------
// 세 화면(쉼터/탐사/전투)을 오간다. 한 번에 하나만 보인다.
// 게임 로직은 없다 — 화면 전환과 상태 라벨 렌더만 담당한다.
// ============================================================================

(function () {
  'use strict';

  const { Screen, gameState } = window;

  // 화면 상태값 → DOM 컨테이너 id
  const SCREEN_EL = {
    [Screen.SHELTER]: 'screen-shelter',
    [Screen.SCAVENGE]: 'screen-scavenge',
    [Screen.COMBAT]: 'screen-combat',
  };

  // 화면 상태값 → 사람이 읽는 한국어 이름(상단 바 표시용)
  const SCREEN_LABEL = {
    [Screen.SHELTER]: '쉼터',
    [Screen.SCAVENGE]: '탐사',
    [Screen.COMBAT]: '전투',
  };

  // --- 상태 라벨 렌더 ---------------------------------------------------------
  // 중앙 상태 객체가 화면에 실제로 연결돼 있음을 보이기 위한 읽기 전용 표시.
  function renderStateLabels() {
    const p = gameState.player;
    const s = gameState.scavenge;

    // 쉼터 & 전투: HP / 탄약 / 붕대
    setText('shelter-hp', `${p.hp}/${p.maxHp}`);
    setText('shelter-ammo', String(p.ammo));
    setText('shelter-bandage', String(p.bandages));

    setText('combat-hp', `${p.hp}/${p.maxHp}`);
    setText('combat-ap', `${p.ap}/${p.maxAp}`);
    setText('combat-ammo', String(p.ammo));
    setText('combat-bandage', String(p.bandages));
    setText('combat-enemy-name', gameState.enemy.name);
    setText('combat-enemy-hp', `${gameState.enemy.hp}/${gameState.enemy.maxHp}`);

    // 탐사: 소음 게이지 + 방 번호
    setText('scavenge-room', String(s.currentRoom));
    setText('scavenge-noise-value', `${Math.round(s.noise)}/${s.maxNoise}`);
    const pct = Math.max(0, Math.min(100, (s.noise / s.maxNoise) * 100));
    const bar = document.getElementById('scavenge-noise-fill');
    if (bar) bar.style.width = pct + '%';
    // 임계선 넘으면 게이지 테두리 경고 (시드 AMBUSH_THRESHOLD=75)
    const gauge = bar ? bar.parentElement : null;
    if (gauge) gauge.classList.toggle('is-hot', s.noise >= window.Scavenge.AMBUSH_THRESHOLD);

    // 탐사: 소지품 누적 읽기(loot 키 → inventory 키 매핑)
    const inv = gameState.inventory;
    setText('inv-scrap', String(inv.scrap));
    setText('inv-ammo', String(inv.ammo));
    setText('inv-canned', String(inv.cannedFood));
    setText('inv-bandage', String(inv.bandage));
  }

  function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  // --- 화면 전환 함수(상태 머신) ---------------------------------------------
  function goToScreen(next) {
    if (!SCREEN_EL[next]) {
      console.warn('알 수 없는 화면:', next);
      return;
    }

    gameState.meta.currentScreen = next;

    // 모든 화면 숨기고 대상만 보인다.
    Object.keys(SCREEN_EL).forEach((key) => {
      const el = document.getElementById(SCREEN_EL[key]);
      if (!el) return;
      const active = key === next;
      el.classList.toggle('is-active', active);
      el.setAttribute('aria-hidden', active ? 'false' : 'true');
    });

    // 상단 바 현재 화면 이름 갱신
    setText('current-screen-name', SCREEN_LABEL[next]);

    // 화면이 바뀔 때마다 상태 라벨을 다시 그려 항상 최신값을 보인다.
    renderStateLabels();

    // 스크롤 위치 초기화(작은 화면에서 새 화면이 맨 위부터 보이게)
    window.scrollTo(0, 0);
  }

  // --- 버튼 배선 -------------------------------------------------------------
  // data-goto="SHELTER|SCAVENGE|COMBAT" 를 가진 요소에 클릭 핸들러 연결.
  // 모바일에서 click 은 탭에도 발화한다(hover 미사용). 더블탭 줌은 viewport 메타로 차단.
  function wireNav() {
    document.querySelectorAll('[data-goto]').forEach((btn) => {
      btn.addEventListener('click', () => goToScreen(btn.getAttribute('data-goto')));
    });
  }

  // --- 탐사(SCAVENGE) 배선 — T2 -----------------------------------------------
  // scavenge.js 의 매니저를 중앙 gameState 에 연결한다. 수치/확률 로직은 전부
  // scavenge.js(시드 포팅)에 있고, 여기서는 상태 반영과 UI 갱신만 한다.
  const scav = window.Scavenge.createScavengeManager();

  const LAST_ENEMY = { name: null }; // 매복 적 이름 보관(T3/T4 전투가 읽도록)

  // 소음 변동 → gameState 반영 + 라벨 렌더
  scav.on('noise', (noise) => {
    gameState.scavenge.noise = noise;
    renderStateLabels();
  });

  // 방 변동 → gameState 반영 + 라벨 렌더
  scav.on('room', (room) => {
    gameState.scavenge.currentRoom = room;
    renderStateLabels();
  });

  // 매복 트리거 → 경보 노출 + 전투 진입 활성화(전투 로직은 T3/T4)
  scav.on('ambush', (enemyName) => {
    LAST_ENEMY.name = enemyName;
    gameState.enemy.name = enemyName; // 전투 화면이 읽는 적 이름 갱신
    showAmbush(enemyName);
  });

  // loot(시드 키) → gameState.inventory(카멜) 누적 매핑
  function applyLoot(loot) {
    const inv = gameState.inventory;
    inv.scrap += loot.scrap;
    inv.ammo += loot.ammo;
    inv.cannedFood += loot.canned_food;
    inv.cleanWater += loot.clean_water; // 시드상 항상 0
    inv.bandage += loot.bandage;
  }

  // 직전 수색 전리품을 사람이 읽는 한 줄로
  function describeLoot(loot) {
    const parts = [];
    if (loot.scrap) parts.push(`고철 +${loot.scrap}`);
    if (loot.ammo) parts.push(`탄약 +${loot.ammo}`);
    if (loot.canned_food) parts.push(`통조림 +${loot.canned_food}`);
    if (loot.clean_water) parts.push(`식수 +${loot.clean_water}`);
    if (loot.bandage) parts.push(`붕대 +${loot.bandage}`);
    return parts.length ? parts.join(' · ') : '아무것도 없음';
  }

  function showAmbush(enemyName) {
    const box = document.getElementById('scavenge-ambush');
    if (box) {
      box.hidden = false;
      box.setAttribute('aria-hidden', 'false');
    }
    setText('scavenge-ambush-name', enemyName);
    const combatBtn = document.getElementById('btn-enter-combat');
    if (combatBtn) combatBtn.disabled = false;
  }

  function hideAmbush() {
    const box = document.getElementById('scavenge-ambush');
    if (box) {
      box.hidden = true;
      box.setAttribute('aria-hidden', 'true');
    }
    const combatBtn = document.getElementById('btn-enter-combat');
    if (combatBtn) combatBtn.disabled = true;
  }

  // 새 출정: 런 상태 초기화(소음/방/매복). 소지품(inventory)은 누적 유지 — 시드
  // reset_scavenge_run 도 인벤토리는 건드리지 않는다.
  function startSortie() {
    scav.reset();
    hideAmbush();
    setText('scavenge-loot-line', '수색 방식을 선택하세요.');
  }

  // 수색 1회 수행(시드 perform_scavenge)
  function doSearch(mode) {
    const result = scav.performScavenge(mode); // { loot, noiseDelta }
    applyLoot(result.loot);
    setText(
      'scavenge-loot-line',
      `[${modeLabel(mode)}] 소음 +${Math.round(result.noiseDelta)} / ${describeLoot(result.loot)}`
    );
    renderStateLabels();
  }

  function modeLabel(mode) {
    const M = window.Scavenge.SearchMode;
    if (mode === M.SILENT) return '조용히';
    if (mode === M.FAST) return '빠르게';
    if (mode === M.BREACH) return '강행';
    return mode;
  }

  function wireScavenge() {
    // 수색 3방식 버튼
    document.querySelectorAll('[data-search]').forEach((btn) => {
      btn.addEventListener('click', () => doSearch(btn.getAttribute('data-search')));
    });

    // 다음 방 — 임의값(T2). 시드엔 방 자동 진행 없음.
    const nextBtn = document.getElementById('btn-next-room');
    if (nextBtn) nextBtn.addEventListener('click', () => scav.nextRoom());

    // 출정(쉼터→탐사) 시 런 초기화
    const sortieBtn = document.getElementById('btn-sortie');
    if (sortieBtn) sortieBtn.addEventListener('click', startSortie);
  }

  // --- 초기화 ----------------------------------------------------------------
  function init() {
    wireNav();
    wireScavenge();
    goToScreen(gameState.meta.currentScreen); // 시작 화면 표시 + 라벨 렌더
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // T2~T5 에서 쓸 수 있도록 노출
  window.goToScreen = goToScreen;
  window.renderStateLabels = renderStateLabels;
  window.scavManager = scav; // T2 탐사 매니저(디버그·테스트용)
})();
