# Disaster Survival MVP — 재난생존 오픈월드 파밍 게임 (프로토타입)

스마트폰 웹(HTML/JS)에서 바로 돌려보는 플레이테스트용 프로토타입 저장소입니다.
목표는 스토어 출시가 아니라 코어 루프(출정 → 폐건물 탐사 → 소음·매복 → 6×6 턴제 전투 → 귀환 정산) 검증입니다.

## 구조

```
docs/
  mvp-spec-tasks-ko.md              MVP 스펙·구현 태스크(T1~T5)·완료 판정 5개 — 작업 기준 문서
  game-concept-prompt-claude-opus.md 기획 마스터 프롬프트(전체 비전·데이터 스키마 참고)
godot-seed/
  tactical_grid_combat.gd           전투 규칙·수치의 기준(6×6, 턴당 6 AP, 엄폐, 방사능, 적 AI)
  scavenge_noise_manager.gd         탐사 규칙·수치의 기준(수색 3방식, 소음, 매복 트리거)
assets/mockups/
  disaster_survival_concept_art.png 컨셉 아트
  game_screen_scavenge.png          탐사 화면 시안(2.5D 측단면·소음 게이지·은신/패닉)
  game_screen_combat.png            전투 화면 시안(6×6 그리드·엄폐·AP UI)
  game_screen_shelter.png           쉼터 화면 시안(시설·생존자 관리, MVP 보류 범위)
  game_sprite_assets.png            캐릭터·적·아이템 스프라이트 시트 초안
```

## 규칙 기준

- **규칙과 수치는 `godot-seed/`의 두 스크립트가 기준**입니다. 화면 시안의 표시 숫자는 확정 스펙이 아니며 배치 참고용입니다.
- 확정 조건: 목적 = 모바일/웹 플레이테스트 프로토타입, 플랫폼 = 스마트폰 웹 HTML/JS 우선, 수치 = Godot 시드 코드.
- 시드에 없는 항목(탄약 0일 때 행동, 도주 조건·비용, 패배 시 손실, 매복 적 배치, 수색 소요 시간)은 `docs/mvp-spec-tasks-ko.md`의 "시드에 없는 것" 절에 확인 필요 항목으로 정리되어 있습니다. 기존 수치를 임의로 바꾸지 말고 별도 규칙으로 채웁니다.

## 구현 순서 (Claude)

1. T1 · 화면·상태 골격 — 쉼터·탐사·전투 3개 화면 상태와 전환
2. T2 · 탐사(`scavenge_noise_manager.gd` 포팅) / T3 · 전투(`tactical_grid_combat.gd` 포팅) — T1 이후 병행 가능
3. T4 · 출정·귀환 루프 연결(상태 보존)
4. T5 · UI·아트 배치, 스마트폰 실기기 확인

완료 판정 5개는 `docs/mvp-spec-tasks-ko.md` 말미에 있습니다.

## 에셋

프로토타입은 임시 아트로 진행합니다. Kharon Free Starter 등 상업 에셋 팩 3종의 원본은 아직 미확보이며, 사용 허가는 판매 페이지에서 별도 확인이 필요합니다.

## 문서 이력

- 2026-11-19: 슬랙 `#게임만들기` 스레드의 자료(mvp-spec-tasks-ko, 시드 스크립트 2종, 시안 5종, 기획 프롬프트)를 그대로 옮겨 초기 구성.
