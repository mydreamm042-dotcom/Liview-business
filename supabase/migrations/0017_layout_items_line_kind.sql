-- ADR-0008 — 배치 장식 요소 종류 정리 + 회전 지원.
--
-- (1) `table` 폐지: 좌석을 둘러싸는 "테이블"은 구역(`box`)과 생김새·기능이 사실상 같아서
--     운영자가 둘 중 뭘 골라야 하는지 알 수 없었다. 매장의 물리적 테이블은 이제 box로 그린다.
--
-- (2) 기존 `table` 행 처리 = **`box`로 일괄 변환** (ADR-0008에서 "코드 작업 시 결정"으로
--     남겨뒀던 항목). 그대로 두고 렌더링만 무시하는 방안도 있었으나 기각했다 — 운영자가
--     공들여 배치해둔 테이블이 배포 순간 화면에서 소리 없이 사라지고, DB엔 CHECK 제약을
--     위반하는 행이 남아 이후 어떤 UPDATE도 실패하게 된다. box는 ADR이 지정한 대체 종류이고
--     좌표/크기/라벨이 그대로 보존되므로, 변환하면 운영자 눈에는 배치가 그대로 유지된다.
--
-- (3) `line` 신설 + `rotation` 컬럼 추가: 축에 나란한 선만 그릴 수 있으면 얇은 box와 다를 게
--     없어 폐지된 table의 전철을 밟는다. 회전값을 함께 저장해 대각선을 그릴 수 있게 한다.
--     (선 두께는 저장하지 않고 렌더링 상수로 고정 — 확대해도 선이 굵어지지 않아야 한다)

ALTER TABLE venue_layout_items
  ADD COLUMN IF NOT EXISTS rotation double precision NOT NULL DEFAULT 0;

-- CHECK 제약을 먼저 떼고 → 데이터를 옮기고 → 새 제약을 건다.
-- (제약이 걸린 채로 UPDATE하면 옛 제약이 'line'을, 새 제약이 'table'을 각각 막는다)
ALTER TABLE venue_layout_items DROP CONSTRAINT IF EXISTS venue_layout_items_kind_check;

UPDATE venue_layout_items SET kind = 'box' WHERE kind = 'table';

ALTER TABLE venue_layout_items
  ADD CONSTRAINT venue_layout_items_kind_check
  CHECK (kind IN ('box', 'door', 'text', 'line'));

COMMENT ON COLUMN venue_layout_items.rotation IS
  '회전 각도(도). line이 대각선을 그릴 수 있게 하기 위한 값 (ADR-0008).';
