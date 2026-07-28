-- Phase 9 (좌석 배치 에디터) — 좌석 외 배치 요소.
-- 지금까지 자리배치도에는 "좌석(venue_seats)"만 있었는데, 실제 매장 구조를 알아보게
-- 그리려면 좌석을 둘러싸는 테이블·주방 같은 구역·출입문·안내 텍스트가 필요하다.
-- 이 요소들은 전부 "그림"일 뿐이라 참여자가 앉거나 리액션을 남기지 않는다 — 그래서
-- 기능 데이터인 venue_seats와 같은 테이블에 섞지 않고 별도 테이블로 둔다.
--
-- 좌표계는 venue_seats와 동일하게 캔버스 대비 0~100 퍼센트다 (§2.8 "좌석 배치 자유 구성").
-- position_x/position_y는 요소의 중심, width/height는 캔버스 대비 크기(%).
CREATE TABLE IF NOT EXISTS venue_layout_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  -- table: 좌석을 둘러싸는 테이블, box: 주방/창고 같은 구역,
  -- door: 출입문, text: 안내 문구(배경 없이 글자만)
  kind text NOT NULL CHECK (kind IN ('table', 'box', 'door', 'text')),
  label text,
  position_x double precision NOT NULL DEFAULT 50,
  position_y double precision NOT NULL DEFAULT 50,
  width double precision NOT NULL DEFAULT 24,
  height double precision NOT NULL DEFAULT 14,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_venue_layout_items_venue ON venue_layout_items(venue_id, sort_order);

ALTER TABLE venue_layout_items ENABLE ROW LEVEL SECURITY;
-- 배치도는 손님 방 화면에도 그대로 보여야 하므로 조회는 공개다. 쓰기 권한은 API
-- 라우트에서 Supabase Auth + venues.owner_id로 판정한다(venue_seats와 동일한 방식).
CREATE POLICY "venue_layout_items_select" ON venue_layout_items FOR SELECT USING (true);
CREATE POLICY "venue_layout_items_insert" ON venue_layout_items FOR INSERT WITH CHECK (true);
CREATE POLICY "venue_layout_items_update" ON venue_layout_items FOR UPDATE USING (true);
CREATE POLICY "venue_layout_items_delete" ON venue_layout_items FOR DELETE USING (true);
