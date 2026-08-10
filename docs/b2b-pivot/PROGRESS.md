# PROGRESS

날짜별 작업 로그 + TODO 겸용. 각 항목에 상태 태그를 붙인다 — ✅ 완료 / 🔲 진행중(할 일).
완료된 항목은 지우지 않고 그대로 둔다(그날 뭘 했는지 나중에 찾을 수 있어야 함).

정합성 점검 크론(일일/주간, `AGENTS.md` 참고)이 발견한 문서-코드 어긋남도 여기 새 항목으로
추가된다 — 크론은 이 파일에 기록만 하고, `BUSINESS_RULES.md`/`ROADMAP_V2.md`는 직접 고치지
않는다.

---

## 2026-08-10

- ✅ 문서 정합성 감사 — `BUSINESS_RULES.md`/`ROADMAP_V2.md`/두 README를 실제 코드·마이그레이션과
  대조. 외부 QnA(`venue_qna`), 좌석배치 에디터(`venue_layout_items`), `venues.description`,
  방 화면 리디자인의 로드맵 스코프 누락, 좌석 선택 게이트 문구가 실제 코드와 어긋난 것 등
  5개 항목 발견
- ✅ ADR-0001: 좌석 선택 = 방 입장 전제조건으로 재확정 (`BUSINESS_RULES.md` §2.8 갱신)
- ✅ ADR-0002: 지도 매장 화면 미리보기(관찰자 뷰) 신설 (`BUSINESS_RULES.md` §2.7 갱신)
- ✅ External QnA 도메인(§2.15), 좌석배치 에디터 규칙(§2.8), 매장 소개(§2.2) 문서 백필
- ✅ `ROADMAP_V2.md`에 "Phase 9 상세 — 방 화면 리디자인" 섹션 신설(사후 기록)
- ✅ ADR-0003: 문서 체계(`AGENTS.md`/`CLAUDE.md`/`decisions/`/`PROGRESS.md`/`VARIABLES.md`) 도입,
  정합성 크론 2단계(일일 기계적 체크 / 주간 의미적 감사) 설계
- 🔲 ADR-0001 코드 반영 — 전용 좌석 선택 화면 신설 + 방 입장 게이팅 (지금 코드는 좌석 미선택
  상태로도 방 화면 4탭에 바로 진입하는 예전 버전)
- 🔲 ADR-0002 코드 반영 — 지도 매장 화면 미리보기(관찰자 뷰) 컴포넌트
- ✅ `docs/b2b-pivot/README.md` 삭제 (`AGENTS.md`의 문서 지도와 중복)
- ✅ 일일/주간 정합성 크론 등록 — 일일 매일 00:00 UTC(≈09:00 KST), 주간 매주 월요일 00:00 UTC. 둘 다 발견만 하고 PROGRESS.md에 기록, 권위 문서는 직접 수정하지 않음
- ✅ 브랜치 → 프리뷰 → 프로덕션 워크플로우 확정 (`AGENTS.md` "워크플로우" 섹션) — 문서만 고칠 땐
  브랜치 불필요, 코드는 매번 새 브랜치+Vercel 프리뷰+PR, `main` 머지는 항상 사용자가 직접
- ✅ `docs/b2b-pivot/MILESTONES.md` 신설 — 버전(v0.1.0~v0.5.0)별 스코프. Phase(개발 순서)와는
  별개 축으로, "main에 실제로 릴리스된 단위" 기준
- ✅ 체크포인트 PR #2 생성 (`claude/mystar-b2b-pivot-cynp6t` → `main`) — 지금까지 61커밋(Phase
  1.5~9 + 오늘 문서 작업) 전체. 머지는 사용자가 직접 검토 후 진행, Claude는 머지하지 않음
- ✅ PR #2 사용자가 검토 후 머지 완료 (`main` ea3e134)
- ✅ 브랜치 삭제 안 함으로 결정 (사용자) — 정합성 크론 2개가 `claude/mystar-b2b-pivot-cynp6t`를
  이름으로 참조하고 있어서, 지웠으면 다음 크론 실행이 실패했을 것. 브랜치는 유지, 대신 PR #2가
  머지되면 크론 프롬프트를 `main` 기준으로 갱신할 것 (아래 항목)
- ✅ 일일/주간 정합성 크론 프롬프트를 `claude/mystar-b2b-pivot-cynp6t` 대신 `main` 기준으로 갱신
- ⚠️ **되돌림**: `package.json` version을 0.3.0으로, `MILESTONES.md`의 버전 경계·포함 범위를
  Claude가 사용자 확인 없이 임의로 정해서 채웠던 걸 사용자가 지적 — 사용자 지시 없는 결정이었음
- ✅ 위 되돌림 반영 — `package.json` version → `0.0.1`(사용자 지정), `MILESTONES.md`는 버전
  경계/포함 범위를 비우고 "Claude가 임의로 정하지 않는다" 원칙을 명시한 빈 틀만 남김. 실제
  마일스톤 내용은 앞으로 사용자와 논의해서 채운다
- ✅ `MILESTONES.md`에 v0.1.0(지도 없이 QR→방화면)/v0.2.0(지도 포함 최소 기능 전체) 스코프와
  지도 화면 처리 방식(막아두기 권장, 삭제 비권장) 기록 — 사용자 확정 내용
- ⚠️ **로드맵 우선순위가 근본적으로 잘못됐었다는 지적** — Staff/Guest Care/좌석배치 에디터/
  운영자 대시보드 등 "손님이 이미 앱을 쓰고 있다"를 전제로 한 부가 기능을 먼저 만들었는데,
  정작 "손님이 매장에서 이 앱을 실제로 켜서 쓸 것인가"라는 핵심 가설이 검증 전이었다. 기능을
  순서대로 다 만드는 로드맵이 아니라 가설 검증/MVP 중심으로 다시 짜야 한다는 지적
- ✅ ADR-0004: 로드맵을 가설 검증/MVP 중심으로 재구성 — `ROADMAP_V2.md`에 "핵심 가설과 MVP
  로드맵" 섹션 신설(핵심 가설: 손님이 매장에서 앱을 실제로 켜서 쓴다 / v0.1.0=지도 없이
  QR→방화면 최소 루프 / Staff·Guest Care 보류 / 기존 Phase 1~10 상세는 "Phase 히스토리"로
  격하하되 삭제하지 않음)
- 🔲 파일럿 매장 찾기 (비개발 트랙, 사용자 담당) — v0.1.0 스코프를 더 좁히려면 선행 필요
- 🔲 v0.1.0을 위한 지도 게이팅 구현 착수 여부 확인 (아직 코드 미착수)
- ✅ GitHub Actions CI 추가 (`.github/workflows/ci.yml`) — `main`으로의 PR/push마다 tsc·vitest·
  build 자동 실행. required status check로 걸어 실패 시 머지를 막으려면 GitHub 저장소 설정에서
  Branch protection rule을 켜야 하는데, 이건 Claude가 API로 할 수 없어 **사용자가 직접 설정해야
  함** (`AGENTS.md` "CI" 항목에 안내 남김)
- ✅ `AGENTS.md`에 브랜치 이름 규칙 명시 — `feature/`(기능) · `fix/`(버그) · `chore/`(설정/도구) ·
  `docs/`(문서 전용인데 예외적으로 브랜치 필요한 경우)
- ✅ GitHub 저장소 설정에서 `main` 브랜치 Ruleset(`main-protection`) 생성 완료 (사용자 직접 진행)
  — PR 필수(직접 push 금지) + CI(`check`) required status check + force push 차단. Target
  branches를 "Include default branch"로 지정해 `main`에 적용
- ✅ 커밋 메시지 규칙 확정 — `type: 한국어 설명` (`feat`/`fix`/`docs`/`chore`/`refactor`/`test`)
- ✅ 브랜치 이름 설명 부분도 한국어로 통일 (`type/한국어-설명`, 예: `fix/로그인-버튼-안눌림`)
- ✅ "사용자는 실무 워크플로우를 배우는 입장" 원칙을 `AGENTS.md`에 명시 — Claude가 더 표준적인
  실무 관행이 있으면 지시받기 전에 먼저 제안. 계기: `chore/v0.3.0-release-bookkeeping` 브랜치
  이름에 확정 안 된 버전 번호를 박아넣었던 실수를 교훈으로 기록
