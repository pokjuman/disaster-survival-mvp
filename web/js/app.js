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

    // 쉼터: HP / 탄약 / 붕대 (휴대 로드아웃 — 전투로 그대로 들어가고 되돌아온다)
    setText('shelter-hp', `${p.hp}/${p.maxHp}`);
    setText('shelter-ammo', String(p.ammo));
    setText('shelter-bandage', String(p.bandages));
    // 쉼터: 창고(정산으로 쌓이는 메타 자원)
    setText('shelter-scrap', String(gameState.inventory.scrap));
    setText('shelter-canned', String(gameState.inventory.cannedFood));
    // 전투 화면 라벨은 combat 매니저가 renderCombat 에서 직접 갱신한다(T3).

    // 탐사: 소음 게이지 + 방 번호
    setText('scavenge-room', String(s.currentRoom));
    setText('scavenge-noise-value', `${Math.round(s.noise)}/${s.maxNoise}`);
    const pct = Math.max(0, Math.min(100, (s.noise / s.maxNoise) * 100));
    const bar = document.getElementById('scavenge-noise-fill');
    if (bar) bar.style.width = pct + '%';
    // 임계선 넘으면 게이지 테두리 경고 (시드 AMBUSH_THRESHOLD=75)
    const gauge = bar ? bar.parentElement : null;
    if (gauge) gauge.classList.toggle('is-hot', s.noise >= window.Scavenge.AMBUSH_THRESHOLD);

    // 탐사: 소지품 읽기. 탄약·붕대는 전투에 쓰는 휴대 풀(player)을 그대로 보여
    // 준다 — 수색으로 주운 탄약/붕대가 곧 전투 자원이고, 전투 후 잔량이 귀환 정산에
    // 반영되도록(완료 판정 #4). 고철·통조림은 창고(inventory) 누적.
    const inv = gameState.inventory;
    setText('inv-scrap', String(inv.scrap));
    setText('inv-ammo', String(p.ammo));
    setText('inv-canned', String(inv.cannedFood));
    setText('inv-bandage', String(p.bandages));
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

    // 전투 화면 진입 시 새 교전 시작(T3 standalone — scavenge 상태 인계는 T4).
    if (next === Screen.COMBAT) startCombat();

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

  // loot(시드 키) 누적 매핑.
  // 설계 결정(T4): 수색으로 얻은 탄약/붕대는 전투에서 쓰는 휴대 풀(player.ammo /
  // player.bandages)로 바로 들어간다 → 탐사에서 번 자원이 그대로 전투 자원이 되고
  // 전투 후 잔량이 귀환 정산에 반영된다(완료 판정 #4). 고철·통조림·식수는 창고
  // (inventory)에 쌓이는 메타 자원.
  function applyLoot(loot) {
    const inv = gameState.inventory;
    const p = gameState.player;
    inv.scrap += loot.scrap;
    inv.cannedFood += loot.canned_food;
    inv.cleanWater += loot.clean_water; // 시드상 항상 0
    p.ammo += loot.ammo;
    p.bandages += loot.bandage;
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

  // 출정 시작 시점의 스냅샷 — 패배 시 이번 런에서 번 전리품을 되돌리기 위함(T4).
  // (시드에 "패배 시 획득물 손실" 규칙이 없어 최소안으로 둔다.)
  const runStart = { scrap: 0, cannedFood: 0, cleanWater: 0, ammo: 0, bandages: 0, hp: 0 };

  // 새 출정: 런 상태 초기화(소음/방/매복). 창고(고철·통조림)와 휴대 로드아웃
  // (HP·탄약·붕대)은 누적/유지 — 시드 reset_scavenge_run 도 인벤토리는 건드리지
  // 않는다. 쉼터에서 자동 회복/재보급은 하지 않는다(임의값 T4: 상태 보존이 핵심).
  function startSortie() {
    scav.reset();
    hideAmbush();
    const p = gameState.player;
    const inv = gameState.inventory;
    runStart.scrap = inv.scrap;
    runStart.cannedFood = inv.cannedFood;
    runStart.cleanWater = inv.cleanWater;
    runStart.ammo = p.ammo;
    runStart.bandages = p.bandages;
    runStart.hp = p.hp;
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

  // --- 전투(COMBAT) 배선 — T3 -------------------------------------------------
  // combat.js(시드 포팅)의 매니저를 전투 화면 UI 에 연결한다. 수치/공식/AI 는
  // 전부 combat.js 에 있고, 여기서는 그리드 렌더·탭 입력·버튼 게이팅·로그만 맡는다.
  // scavenge→combat 상태 인계와 귀환 정산은 T4 범위라 넣지 않는다.
  const CombatMod = window.Combat;
  let combat = null;             // 현재 교전 인스턴스(진입마다 새로)
  let enemyTurnBusy = false;     // 적 턴 연출 중 입력 잠금

  // 새 교전 시작 — T4: 탐사에서 들고 나온 실제 런 상태(HP·탄약·붕대)를 그대로
  // 주입한다(완료 판정 #4). 적 HP 는 전투 시드 _ready 값 70, 적 이름은 전투 시드의
  // "돌연변이 워커"로 통일(이름 불일치 reconciliation — 아래 주석 참조).
  function startCombat() {
    enemyTurnBusy = false;
    const p = gameState.player;
    combat = CombatMod.createCombat({
      enemyName: CombatMod.ENEMY_NAME, // 전투 시드값 "돌연변이 워커"로 통일
      playerHp: p.hp,
      playerMaxHp: p.maxHp,
      ammo: p.ammo,
      bandages: p.bandages,
      // enemyHp 미지정 → 기본 70(시드 _ready 구동값)
    });

    combat.on('log', (msg) => setText('combat-log', msg));
    // 종료 분기: 승리(checkBattleEnd) / 패배(execute_enemy_turn). 도주는 flee()가
    // state.fled 만 세우고 'ended' 를 쏘지 않으므로 아래 핸들러를 타지 않는다.
    combat.on('ended', (victory) => {
      if (victory) settleVictory();
      else settleDefeat();
    });

    hideResult();
    buildGrid();
    setText('combat-log', '플레이어 턴 — 행동을 선택하세요.');
    renderCombat();
  }

  // 6×6 셀 DOM 생성(최초 1회 구성 후 renderCombat 가 클래스/토큰만 갱신)
  function buildGrid() {
    const grid = document.getElementById('combat-grid');
    if (!grid) return;
    grid.innerHTML = '';
    for (let y = 0; y < CombatMod.GRID_SIZE; y++) {
      for (let x = 0; x < CombatMod.GRID_SIZE; x++) {
        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.setAttribute('role', 'gridcell');
        cell.dataset.x = String(x);
        cell.dataset.y = String(y);
        cell.addEventListener('click', () => onCellTap(x, y, cell));
        grid.appendChild(cell);
      }
    }
  }

  // 셀 탭 — 합법 이동이면 수행, 아니면 규칙이 거부 + UI 피드백(완료 판정 #3)
  function onCellTap(x, y, cell) {
    if (!combat || combat.state.ended || enemyTurnBusy) { rejectCell(cell); return; }
    const moved = combat.tryMovePlayer(x, y);
    if (moved) {
      setText('combat-log', `이동 → (${x},${y})  AP -1`);
      renderCombat();
    } else {
      // 비인접·막힌 타일·AP 부족 등: 규칙이 false 반환 → UI 거부 피드백
      rejectCell(cell);
      setText('combat-log', '이동 불가 — 인접한 빈 타일만, AP 1 필요.');
    }
  }

  function rejectCell(cell) {
    if (!cell) return;
    cell.classList.remove('cell--reject');
    void cell.offsetWidth; // 리플로우로 애니메이션 재시작
    cell.classList.add('cell--reject');
  }

  const cellKey = (x, y) => `[data-x="${x}"][data-y="${y}"]`;

  // 그리드/스탯/버튼 전체 렌더
  function renderCombat() {
    if (!combat) return;
    const s = combat.state;
    const grid = document.getElementById('combat-grid');
    if (!grid) return;

    const legal = {};
    combat.legalMoves().forEach((m) => { legal[CombatMod.key(m.x, m.y)] = true; });

    for (let y = 0; y < CombatMod.GRID_SIZE; y++) {
      for (let x = 0; x < CombatMod.GRID_SIZE; x++) {
        const cell = grid.querySelector(cellKey(x, y));
        if (!cell) continue;
        cell.className = 'cell';
        const k = CombatMod.key(x, y);

        // 엄폐/위험 타일
        const cov = combat.covers[k];
        if (cov === CombatMod.CoverType.FULL) cell.classList.add('cell--cover-full');
        else if (cov === CombatMod.CoverType.HALF) cell.classList.add('cell--cover-half');
        if (combat.hazards[k] === CombatMod.HazardType.RADIATION) cell.classList.add('cell--radiation');

        // 합법 이동 하이라이트
        if (legal[k]) cell.classList.add('cell--legal');

        // 토큰(플레이어/적)
        cell.innerHTML = '';
        if (x === s.player.x && y === s.player.y) cell.appendChild(makeToken('player', '나'));
        else if (x === s.enemy.x && y === s.enemy.y) cell.appendChild(makeToken('enemy', '敵'));
        else if (combat.hazards[k] === CombatMod.HazardType.RADIATION) cell.textContent = '☢';
        else if (cov === CombatMod.CoverType.FULL) cell.textContent = '▲';
        else if (cov === CombatMod.CoverType.HALF) cell.textContent = '△';
      }
    }

    // 적 카드 + HP 바
    setText('combat-enemy-name', s.enemy.name);
    setText('combat-enemy-hp', `${s.enemy.hp}/${s.enemy.maxHp}`);
    const ehpFill = document.getElementById('combat-enemy-hp-fill');
    if (ehpFill) ehpFill.style.width = pct(s.enemy.hp, s.enemy.maxHp) + '%';

    // 플레이어 스탯
    setText('combat-hp', `${s.player.hp}/${s.player.maxHp}`);
    setText('combat-ammo', String(s.ammo));
    setText('combat-bandage', String(s.bandages));
    setText('combat-ap', `${s.ap}/${s.maxAp}`);
    renderApDots(s.ap, s.maxAp);

    // 버튼 게이팅: AP/탄약/붕대·내 턴·종료 여부(완료 판정 #3 — 규칙과 UI가 함께 거부)
    const canAct = s.isPlayerTurn && !s.ended && !enemyTurnBusy;
    const adjacent =
      CombatMod.manhattan(s.player.x, s.player.y, s.enemy.x, s.enemy.y) === 1;
    gate('btn-quick-shot', canAct && s.ap >= 2 && s.ammo >= 1);
    gate('btn-aimed-shot', canAct && s.ap >= 4 && s.ammo >= 1);
    gate('btn-first-aid', canAct && s.ap >= 3 && s.bandages >= 1);
    // 근접: 인접 + AP 충분(임의값 T4). 탄약 0이어도 쓸 수 있는 기본 행동.
    gate('btn-melee', canAct && s.ap >= CombatMod.MELEE_AP && adjacent);
    gate('btn-flee', canAct);
    gate('btn-end-turn', canAct);
  }

  function makeToken(kind, label) {
    const t = document.createElement('div');
    t.className = 'token token--' + kind;
    t.textContent = label;
    return t;
  }

  function pct(cur, max) { return Math.max(0, Math.min(100, (cur / max) * 100)); }

  function renderApDots(ap, maxAp) {
    const box = document.getElementById('combat-ap-dots');
    if (!box) return;
    box.innerHTML = '';
    for (let i = 0; i < maxAp; i++) {
      const d = document.createElement('span');
      d.className = 'ap-dot' + (i < ap ? ' ap-dot--on' : '');
      box.appendChild(d);
    }
  }

  function gate(id, enabled) {
    const el = document.getElementById(id);
    if (el) el.disabled = !enabled;
  }

  // 행동 버튼 실행. 게이팅으로 못 누르게 하되, 혹시 호출돼도 combat 이 false 반환.
  function doAction(kind) {
    if (!combat || combat.state.ended || enemyTurnBusy) return;
    let done = false;
    if (kind === 'quick') done = combat.actionQuickShot();
    else if (kind === 'aimed') done = combat.actionAimedShot();
    else if (kind === 'aid') done = combat.actionFirstAid();
    else if (kind === 'melee') done = combat.actionMelee();
    else if (kind === 'flee') { doFlee(); return; }
    else if (kind === 'end') { endTurn(); return; }

    if (!done) {
      setText('combat-log', '행동 불가 — AP·탄약·붕대·사거리(근접은 인접)를 확인하세요.');
    }
    renderCombat();
  }

  // 도주 — 성공 시 귀환 정산(도주 분기). 처치 보상 없음, 생존 스탯·전리품 유지.
  function doFlee() {
    if (!combat || combat.state.ended || enemyTurnBusy) return;
    if (combat.flee()) {
      settleFlight();
    }
    renderCombat();
  }

  // 턴 종료 → 적 턴(짧은 연출 지연). 지연 동안 입력 잠금.
  function endTurn() {
    if (!combat || combat.state.ended) return;
    enemyTurnBusy = true;
    combat.endPlayerTurn(0); // 로직은 즉시(결정론), 연출만 분리
    renderCombat();          // is_player_turn=false 반영(버튼 잠금)
    // 전투가 종료(패배)되지 않았을 때만 "적 턴…" 안내로 덮는다(패배 로그 보존).
    if (!combat.state.ended) setText('combat-log', '적 턴…');
    // 짧은 연출 후 결과 반영(시드 0.6s 느낌). 이미 state 는 갱신됨.
    setTimeout(() => {
      enemyTurnBusy = false;
      renderCombat();
    }, ENEMY_TURN_DELAY_MS);
  }
  const ENEMY_TURN_DELAY_MS = 500; // 임의값(T3): 연출 지연. 로직엔 영향 없음.

  // --- 귀환 정산(T4) ---------------------------------------------------------
  // 세 결과(승리/도주/패배)마다 gameState 를 확정하고 결과 패널을 띄운다.
  // 쉼터로 돌아가면 renderStateLabels 가 갱신된 값을 그대로 보여준다.
  let lastReport = '';

  // 승리: 생존 스탯 인계 + 처치 보상 고철을 창고에 적립
  function settleVictory() {
    const s = combat.state;
    const p = gameState.player;
    p.hp = s.player.hp;
    p.ammo = s.ammo;
    p.bandages = s.bandages;
    gameState.inventory.scrap += s.scrapReward;

    lastReport = `승리 · 고철 +${s.scrapReward} · 생환 HP ${p.hp}/${p.maxHp}`;
    showResult('victory', '승리', [
      `${s.enemy.name} 격퇴!`,
      `전리품 고철 +${s.scrapReward}`,
      `생환 HP ${p.hp}/${p.maxHp} · 탄약 ${p.ammo} · 붕대 ${p.bandages}`,
      `창고 고철 누적 ${gameState.inventory.scrap}`,
    ]);
  }

  // 도주: 생존 스탯 인계. 처치 보상 없음, 수색 전리품은 유지.
  function settleFlight() {
    const s = combat.state;
    const p = gameState.player;
    p.hp = s.player.hp;
    p.ammo = s.ammo;
    p.bandages = s.bandages;

    lastReport = `도주 · 전리품 유지 · 생환 HP ${p.hp}/${p.maxHp}`;
    showResult('flight', '도주 성공', [
      '전투에서 이탈해 쉼터로 향한다.',
      '처치 보상(고철)은 없음 · 수색 전리품은 유지',
      `생환 HP ${p.hp}/${p.maxHp} · 탄약 ${p.ammo} · 붕대 ${p.bandages}`,
    ]);
  }

  // 패배(임의값 T4): 이번 출정에서 번 전리품을 전부 잃고(런 시작 스냅샷으로 복원),
  // HP 는 전부 회복한 채 쉼터로 돌아온다(루프가 계속 돌 수 있게 하는 최소안).
  function settleDefeat() {
    const p = gameState.player;
    const inv = gameState.inventory;
    inv.scrap = runStart.scrap;
    inv.cannedFood = runStart.cannedFood;
    inv.cleanWater = runStart.cleanWater;
    p.ammo = runStart.ammo;
    p.bandages = runStart.bandages;
    p.hp = p.maxHp; // 임의값(T4): 패배 후 쉼터 복귀 시 HP 전량 회복

    lastReport = '패배 · 이번 출정 전리품 소실 · HP 회복 후 복귀';
    showResult('defeat', '패배', [
      '쓰러졌지만 간신히 끌려 돌아왔다.',
      '이번 출정에서 모은 전리품은 모두 잃었다.',
      `탄약 ${p.ammo} · 붕대 ${p.bandages} · HP ${p.hp}/${p.maxHp} 로 복귀`,
    ]);
  }

  // 결과 패널 표시 — kind: 'victory' | 'flight' | 'defeat'
  function showResult(kind, title, detailLines) {
    const panel = document.getElementById('combat-result');
    if (panel) {
      panel.hidden = false;
      panel.setAttribute('aria-hidden', 'false');
      panel.classList.remove('is-defeat', 'is-flight');
      if (kind === 'defeat') panel.classList.add('is-defeat');
      else if (kind === 'flight') panel.classList.add('is-flight');
    }
    setText('combat-result-title', title);
    const detail = document.getElementById('combat-result-detail');
    if (detail) {
      detail.innerHTML = '';
      detailLines.forEach((line) => {
        const row = document.createElement('div');
        row.className = 'result__line';
        row.textContent = line;
        detail.appendChild(row);
      });
    }
    renderCombat();
    // 작은 화면에서 결과 패널이 접힌 영역 아래 생기지 않게 바로 보이도록 스크롤
    if (panel && panel.scrollIntoView) panel.scrollIntoView({ block: 'center' });
  }

  function hideResult() {
    const panel = document.getElementById('combat-result');
    if (panel) {
      panel.hidden = true;
      panel.setAttribute('aria-hidden', 'true');
      panel.classList.remove('is-defeat', 'is-flight');
    }
  }

  // 결과 패널 → 쉼터 복귀. 정산은 이미 끝났으므로 화면만 전환하고 라벨을 갱신.
  function returnToShelter() {
    const reportEl = document.getElementById('shelter-report');
    if (reportEl) reportEl.textContent = lastReport ? `직전 출정: ${lastReport}` : '';
    goToScreen(Screen.SHELTER);
  }

  function wireCombat() {
    document.querySelectorAll('[data-action]').forEach((btn) => {
      btn.addEventListener('click', () => doAction(btn.getAttribute('data-action')));
    });
  }

  // --- 초기화 ----------------------------------------------------------------
  function init() {
    wireNav();
    wireScavenge();
    wireCombat();
    // 귀환 정산 패널 → 쉼터 복귀(정산 반영)
    const returnBtn = document.getElementById('btn-return-shelter');
    if (returnBtn) returnBtn.addEventListener('click', returnToShelter);
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
  window.getCombat = () => combat; // T3 전투 매니저(디버그·테스트용)
})();
