# AGENTS.md

이 파일은 이 저장소에서 작업하는 모든 AI 에이전트(Claude Code 포함)가 매 세션 참고해야 할
작업 규칙의 단일 원천이다. `CLAUDE.md`는 이 파일을 가리키기만 한다 — 내용은 항상 여기만 고친다.

사람이 처음 이 저장소를 볼 때 보는 소개는 `README.md`를 그대로 참고한다(이 문서가 대체하지 않음).

## 문서 지도

| 문서 | 역할 |
|------|------|
| `README.md` | 사람이 처음 봤을 때의 프로젝트 소개 (그대로 유지, 이 문서가 대체하지 않음) |
| `docs/b2b-pivot/BUSINESS_RULES.md` | **도메인 규칙 권위 문서.** 새 기능 전에 항상 여기부터 도메인 매핑 |
| `docs/b2b-pivot/ROADMAP_V2.md` | **Phase 순서 권위 문서.** 뭐가 끝났고 뭐가 다음인지의 단일 기준 |
| `docs/b2b-pivot/CHANGE_INTAKE_PROCESS.md` | 새 아이디어를 로드맵/규칙에 반영하는 4단계 절차 |
| `docs/b2b-pivot/decisions/NNNN-*.md` | **결정 기록 (ADR).** 결정 하나당 파일 하나, 번호 순으로 쌓임. "왜 이렇게 짰지?"는 여기서 검색 |
| `docs/b2b-pivot/PROGRESS.md` | 날짜별 작업 로그 + TODO 겸용 (✅ 완료 / 🔲 진행중 태그) |
| `docs/b2b-pivot/VARIABLES.md` | 쿨타임/반경/기본크기 등 하드코딩 값의 단일 원천 — 새 상수는 여기 먼저 기록 |
| `docs/b2b-pivot/MILESTONES.md` | 버전(마일스톤)별 스코프 — "v0.2.0엔 뭐가 들어가는지" 같은 릴리스 단위 기준. Phase(개발 순서)와는 다른 축 |
| `supabase/migrations/*.sql` | 실제 적용된 스키마의 유일한 원천 (설계 초안 SQL 아님) |

## 작업 순서 (CHANGE_INTAKE_PROCESS.md 요약)

1. 아이디어는 러프해도 된다 — 완성된 스펙 요구하지 않음
2. **도메인 매핑 먼저**: 기존 도메인 확장인지 새 도메인인지 판단 → `BUSINESS_RULES.md`부터 갱신
3. **로드맵 영향 분석**: 완료된 Phase는 절대 재작업하지 않음, 새 아이디어는 항상 "아직 시작 안 한 Phase"에 삽입 → `ROADMAP_V2.md` 갱신
4. **승인 후에만 코드 작업** — 설계 문서 갱신 → 사용자 확인 → 코드 구현 순서를 건너뛰지 않는다
5. 결정이 확정되면 `docs/b2b-pivot/decisions/`에 ADR 한 편 추가, 그날 작업은 `PROGRESS.md`에 기록

## 원칙

- `BUSINESS_RULES.md` Part 1(기존 B2C 핵심 로직: 하트/HOT/채팅/쌍방매칭/종료투표)은 **변경 금지**. 수정이 필요하면 반드시 사용자 승인을 먼저 받는다
- 완료되고 병합된 Phase는 재작업하지 않는다 — 실제 운영 방식과 설계가 어긋나 사용자가 직접 바로잡은 경우만 예외, 이땐 ADR과 `ROADMAP_V2.md`에 그 사실을 남기고 진행
- 새 쿨타임/반경/기본크기 등 튜닝 가능한 값은 매직 넘버로 흩어두지 않고 `VARIABLES.md`에 먼저 기록한 뒤 코드에 반영한다
- 문서와 코드가 어긋난 걸 발견하면(정합성 점검이든 우연히든) 임의로 아무 쪽이나 고치지 않는다 — 어느 쪽이 맞는지는 항상 사용자에게 확인 후 반영

## 정합성 점검 크론 (2단계)

- **일일 (기계적 체크만)**: `PROGRESS.md`에 최근 3일 이상 기록이 없는지, `VARIABLES.md`에 없는 이름의 신규 쿨타임/반경류 상수가 코드에 추가됐는지, `supabase/migrations/`에 어느 문서에도 언급되지 않은 새 마이그레이션이 있는지 — grep 수준의 기계적 체크만 수행
- **주간 (의미적 감사)**: `BUSINESS_RULES.md`/`ROADMAP_V2.md`를 실제 코드와 직접 대조하는 전체 감사 — 오늘(2026-08-10) 수행한 것과 동일한 방식
- 두 단계 모두 **발견만 하고 `PROGRESS.md`에 기록**한다. `BUSINESS_RULES.md`/`ROADMAP_V2.md` 등 권위 문서는 크론이 절대 자동 수정하지 않는다 — 반영은 항상 사용자와의 대화를 거쳐 수동으로

## 워크플로우 (2026-08-10 확정) — 브랜치 → 프리뷰 → 프로덕션

- **`main` = 프로덕션.** Vercel이 `main`을 프로덕션으로 배포한다. `main`엔 항상 PR을 통해서만 들어간다 — 직접 push 금지
- **문서만 고칠 땐 새 브랜치가 필요 없다.** `.md` 파일만 바뀌는 커밋(BUSINESS_RULES.md/ROADMAP_V2.md/PROGRESS.md/decisions/ 등)은 Vercel 빌드에 영향이 없으므로, 지금 작업 중인 브랜치에 바로 커밋·푸시한다
- **코드가 바뀌는 작업은 매번 새 브랜치.** 작업 단위마다 `main`에서 새 브랜치를 따서(`git checkout -b <name> origin/main`) 그 위에서 작업한다
- **브랜치 이름 규칙**: `feature/<설명>`(새 기능) · `fix/<설명>`(버그 수정) · `chore/<설명>`(설정/버전/도구 등 기능 아닌 변경) · `docs/<설명>`(문서 전용인데 예외적으로 브랜치가 필요한 경우) — 케밥 케이스, 영문
- **브랜치 → 프리뷰**: 브랜치를 푸시하면 Vercel이 자동으로 프리뷰 배포를 만든다(GitHub 연동 기준). tsc/vitest/build가 로컬에서 먼저 통과해야 푸시한다
- **CI**: `.github/workflows/ci.yml`이 `main`으로의 PR/push마다 tsc·vitest·build를 자동 실행한다. GitHub 저장소 설정(Settings → Branches → Branch protection rule)에서 이 체크를 `main`의 required status check로 걸어두면 실패 시 머지 버튼 자체가 막힌다 — 이 설정은 Claude가 API로 걸 수 없어 **사용자가 직접 GitHub에서 켜야 한다**
- **프리뷰 → PR**: 프리뷰가 정상 동작하면 `main`으로 PR을 연다. PR 설명에 프리뷰 링크와 확인한 내용을 남긴다
- **PR 머지는 항상 사용자가 직접 한다.** Claude는 브랜치를 만들고 PR을 여는 것까지만 하고, `main`으로의 머지는 절대 스스로 하지 않는다 — 사용자가 GitHub에서 검토 후 머지
- **머지 후**: 브랜치는 지우지 않고 그대로 둔다(사용자 결정, 2026-08-10) — 다음 작업은 갱신된 `main`에서 다시 새 브랜치를 딴다. 단, `claude/mystar-b2b-pivot-cynp6t`를 이름으로 참조하는 것(정합성 크론 등)이 있으면 PR #2 머지 후 `main` 기준으로 갱신해야 한다
- **버전/마일스톤**: `main`에 의미 있는 단위로 머지될 때마다 `docs/b2b-pivot/MILESTONES.md`와 `package.json`의 `version`을 함께 올린다(시맨틱 버저닝: `MAJOR.MINOR.PATCH`)

### 지금 당장의 예외 — 체크포인트 병합

지금까지 이 워크플로우 확정 전에 `claude/mystar-b2b-pivot-cynp6t` 브랜치 하나에 Phase 1.5~9(홈지도+방화면 리디자인)와 오늘 문서 작업까지 61커밋이 쌓여있다. 이건 하나의 체크포인트 PR로 `main`에 병합하고, **그 이후부터** 위 워크플로우를 엄격히 적용한다.
