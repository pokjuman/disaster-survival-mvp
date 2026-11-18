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

    // 탐사: 소음 게이지(자리표시) + 방 번호
    setText('scavenge-room', String(s.currentRoom));
    setText('scavenge-noise-value', `${Math.round(s.noise)}/${s.maxNoise}`);
    const pct = Math.max(0, Math.min(100, (s.noise / s.maxNoise) * 100));
    const bar = document.getElementById('scavenge-noise-fill');
    if (bar) bar.style.width = pct + '%';
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

  // --- 초기화 ----------------------------------------------------------------
  function init() {
    wireNav();
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
})();
