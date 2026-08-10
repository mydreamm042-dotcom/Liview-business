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
- 🔲 PR #2 사용자 검토·머지 대기 — 머지되면 `package.json` version과 `MILESTONES.md` 상태를
  v0.2.0/v0.3.0 "릴리스됨"으로 갱신하고 이 브랜치는 정리
