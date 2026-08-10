# ADR-0003: 문서 체계 재구성 — AGENTS.md/CLAUDE.md/decisions/PROGRESS.md/VARIABLES.md 도입

- **상태**: Accepted
- **날짜**: 2026-08-10
- **관련 문서**: `AGENTS.md`, `docs/b2b-pivot/PROGRESS.md`, `docs/b2b-pivot/VARIABLES.md`

## 맥락

문서 정합성 감사(2026-08-10) 결과, 이미 구현되어 커밋까지 끝난 기능(외부 QnA 채널, 좌석배치
에디터, 매장 소개 필드 등)이 `BUSINESS_RULES.md`/`ROADMAP_V2.md`에 반영되지 않은 채 쌓여있는
패턴이 반복 확인됐다. "코드가 문서보다 먼저 나가고 문서가 나중에 따라잡는" 흐름이 계속되면
정합성이 계속 깨질 것이므로, 결정/진행상황/튜닝값을 구조적으로 남기는 체계를 도입하기로 함.

## 결정

- `README.md`는 **사람이 처음 보는 용도로 그대로 유지**한다 — 내용 변경 없음, 이 재구성이
  대체하지 않는다
- `AGENTS.md`(신규, 원본)를 에이전트 작업 규칙의 단일 원천으로 둔다. `CLAUDE.md`(신규)는
  `AGENTS.md`를 가리키기만 한다 — 두 곳에서 내용이 따로 어긋나지 않도록
- 결정 기록은 **ADR(Architecture Decision Record) 포맷**으로 남긴다 — 단순 누적 로그(당초
  `DECISIONS.md` 단일 파일 구상)는 나중에 검색이 안 된다는 피드백을 받아, 결정 하나당
  `docs/b2b-pivot/decisions/NNNN-slug.md` 파일 하나로 번호를 매겨 쌓는 방식으로 변경
- `docs/b2b-pivot/PROGRESS.md` 신설 — 날짜별 섹션 안에서 ✅(완료)/🔲(진행중) 태그로 그날의
  작업과 TODO를 함께 표기한다(완전히 분리된 progress/todo 두 파일 대신 태그로 구분)
- `docs/b2b-pivot/VARIABLES.md` 신설 — 쿨타임/반경/기본크기 등 하드코딩 값의 단일 원천
- 정합성 점검 크론은 **2단계로 분리**한다:
  1. **일일 (기계적 체크)**: `PROGRESS.md` 3일 이상 미기록 감지 / `VARIABLES.md`에 없는
     이름의 신규 쿨타임·반경류 상수 코드 등장 감지 / 어느 문서에도 언급되지 않은 신규
     마이그레이션 파일 감지 — grep 수준의 저비용 체크만
  2. **주간 (의미적 감사)**: `BUSINESS_RULES.md`/`ROADMAP_V2.md`를 실제 코드와 직접 대조하는
     전체 감사 — 오늘 수행한 것과 동일한 방식(사람이 직접 읽고 판단해야 하는 항목)
  - 두 단계 모두 **발견만 하고 `PROGRESS.md`에 기록**한다. 권위 문서(`BUSINESS_RULES.md`/
    `ROADMAP_V2.md`)는 크론이 절대 자동 수정하지 않는다 — 반영은 항상 사용자 확인 후 수동

## 버린 대안

- **`DECISIONS.md` 단일 누적 파일** — 결정이 쌓일수록 "왜 이렇게 짰지?"를 검색으로 찾기
  어려워진다는 지적을 받아 ADR 개별 파일 방식으로 대체
- **`PROGRESS.md`/`TODO.md` 완전 분리** — 관리해야 할 파일이 늘어나는 부담 대비 이득이 적어,
  상태 태그 규칙으로 한 파일 안에서 구분하는 절충안 채택
- **정합성 크론을 완전 자동화** — BUSINESS_RULES.md vs 코드의 의미적 어긋남 판정은 기계적
  체크로 신뢰할 수 없어, 기계적 체크(일일)와 사람 판단이 필요한 감사(주간)를 분리

## 범위

`docs/b2b-pivot/README.md`는 이 재구성으로 `AGENTS.md`의 문서 지도와 내용이 겹치게 되어
삭제 대상이다(별도 조치, `PROGRESS.md` TODO 참고). 이 ADR 자체는 새 체계의 도입만 다룬다.
