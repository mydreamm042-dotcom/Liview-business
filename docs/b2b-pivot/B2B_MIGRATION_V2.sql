-- MySTAR B2B Pivot - Database Migration v2 (Addendum)
-- 주변 술집 추천 / 실시간 검증 리뷰 / 공개 채팅 / 직원 친절도 평가
-- 이 파일은 B2B_MIGRATION.sql(v1) 이후에 적용한다. 모두 추가적(additive) 변경이며
-- 기존 PERSONAL 방 동작에는 영향을 주지 않는다.

-- ============================================================================
-- 1. venues 테이블 신설 (매장 마스터 엔티티)
-- ============================================================================

CREATE TABLE IF NOT EXISTS venues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_owner_token text NOT NULL,

  name text NOT NULL,
  category text CHECK (category IN ('bar','pub','pocha','wine_bar','cafe','event_hall','etc')),
  address text,
  latitude double precision,
  longitude double precision,

  logo_url text,
  hero_image_url text,
  primary_color text DEFAULT '#667eea',
  secondary_color text DEFAULT '#764ba2',

  naver_review_url text,
  google_review_url text,
  kakao_review_url text,

  public_chat_enabled boolean NOT NULL DEFAULT false,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_venues_owner_token ON venues(operator_owner_token);
CREATE INDEX IF NOT EXISTS idx_venues_location ON venues(latitude, longitude);

-- rooms가 venue에 소속되도록 연결 (venue 삭제 시에도 방 이력은 보존 -> SET NULL)
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS venue_id uuid REFERENCES venues(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_rooms_venue_id ON rooms(venue_id);

ALTER TABLE venues ENABLE ROW LEVEL SECURITY;
CREATE POLICY "venues_select" ON venues FOR SELECT USING (true);
CREATE POLICY "venues_insert" ON venues FOR INSERT WITH CHECK (true);
CREATE POLICY "venues_update" ON venues FOR UPDATE USING (true);

-- ============================================================================
-- 2. 방 상태에 'closed' 추가 + BUSINESS 방 삭제 방지
-- ============================================================================

ALTER TABLE rooms DROP CONSTRAINT IF EXISTS rooms_status_check;
ALTER TABLE rooms ADD CONSTRAINT rooms_status_check
  CHECK (status IN ('active', 'ended', 'closed'));

-- 기존 delete_old_rooms()를 대체: PERSONAL 방만 정리 대상으로 한정한다.
-- BUSINESS 방은 status가 무엇이든(active/closed) 절대 자동 삭제되지 않는다.
CREATE OR REPLACE FUNCTION delete_old_rooms()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM rooms
  WHERE status = 'ended'
    AND room_type = 'PERSONAL'
    AND created_at < now() - INTERVAL '24 hours';

  DELETE FROM rooms
  WHERE status = 'active'
    AND room_type = 'PERSONAL'
    AND created_at < now() - INTERVAL '2 days';
END;
$$;

-- ============================================================================
-- 3. 직원 엔티티 + 친절도 평가
-- ============================================================================

CREATE TABLE IF NOT EXISTS staff_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_staff_members_venue_id ON staff_members(venue_id);

-- 기존 staff_shifts(v1)에 구조화된 참조 추가. staff_name은 과거 호환용으로 유지.
ALTER TABLE staff_shifts ADD COLUMN IF NOT EXISTS staff_member_id uuid REFERENCES staff_members(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_staff_shifts_staff_member_id ON staff_shifts(staff_member_id);

CREATE TABLE IF NOT EXISTS staff_evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  participant_id uuid REFERENCES participants(id) ON DELETE SET NULL,
  staff_member_id uuid NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(room_id, participant_id)
);

CREATE INDEX IF NOT EXISTS idx_staff_evaluations_staff_member_id ON staff_evaluations(staff_member_id);
CREATE INDEX IF NOT EXISTS idx_staff_evaluations_room_id ON staff_evaluations(room_id);

ALTER TABLE staff_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_evaluations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_members_select" ON staff_members FOR SELECT USING (true);
CREATE POLICY "staff_members_insert" ON staff_members FOR INSERT WITH CHECK (true);
CREATE POLICY "staff_members_update" ON staff_members FOR UPDATE USING (true);

CREATE POLICY "staff_evaluations_select" ON staff_evaluations FOR SELECT USING (true);
CREATE POLICY "staff_evaluations_insert" ON staff_evaluations FOR INSERT WITH CHECK (true);

-- 직원별 친절도 랭킹 조회 함수
CREATE OR REPLACE FUNCTION get_staff_kindness_ranking(p_venue_id uuid)
RETURNS json LANGUAGE sql STABLE AS $$
  SELECT COALESCE(json_agg(row_to_json(r) ORDER BY r.vote_count DESC), '[]'::json)
  FROM (
    SELECT
      sm.id AS staff_member_id,
      sm.name,
      COUNT(se.id) AS vote_count
    FROM staff_members sm
    LEFT JOIN staff_evaluations se ON se.staff_member_id = sm.id
    WHERE sm.venue_id = p_venue_id
    GROUP BY sm.id, sm.name
  ) r;
$$;

GRANT EXECUTE ON FUNCTION get_staff_kindness_ranking(uuid) TO anon, authenticated;

-- ============================================================================
-- 4. 실시간 검증 리뷰 (venue_reviews)
-- ============================================================================

CREATE TABLE IF NOT EXISTS venue_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  participant_id uuid REFERENCES participants(id) ON DELETE SET NULL,

  satisfaction_snapshot numeric,
  venue_hot_snapshot int,
  visited_at timestamptz NOT NULL,

  is_hidden boolean NOT NULL DEFAULT false,
  hidden_at timestamptz,

  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_venue_reviews_venue_id ON venue_reviews(venue_id, visited_at DESC);

ALTER TABLE venue_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "venue_reviews_select" ON venue_reviews FOR SELECT USING (true);
CREATE POLICY "venue_reviews_insert" ON venue_reviews FOR INSERT WITH CHECK (true);
-- update는 is_hidden 토글만 허용하는 용도 (애플리케이션 레벨에서 컬럼 제한)
CREATE POLICY "venue_reviews_update" ON venue_reviews FOR UPDATE USING (true);

-- ============================================================================
-- 5. 주변 술집 추천 + 실시간 HOT 랭킹
-- ============================================================================

CREATE OR REPLACE FUNCTION get_live_hot_venues(
  p_lat double precision,
  p_lng double precision,
  p_radius_km double precision DEFAULT 5,
  p_window_minutes int DEFAULT 15
)
RETURNS json LANGUAGE sql STABLE AS $$
  SELECT COALESCE(json_agg(v ORDER BY v.hot_score DESC), '[]'::json)
  FROM (
    SELECT
      venues.id, venues.name, venues.category, venues.logo_url,
      venues.latitude, venues.longitude,
      rooms.id AS room_id,
      COALESCE(hot_recent.cnt, 0)::float / GREATEST(active_participants.cnt, 1) AS hot_score,
      (
        6371 * acos(
          LEAST(1.0, GREATEST(-1.0,
            cos(radians(p_lat)) * cos(radians(venues.latitude)) *
            cos(radians(venues.longitude) - radians(p_lng)) +
            sin(radians(p_lat)) * sin(radians(venues.latitude))
          ))
        )
      ) AS distance_km
    FROM venues
    JOIN rooms ON rooms.venue_id = venues.id AND rooms.status = 'active'
    LEFT JOIN LATERAL (
      SELECT COUNT(*) AS cnt FROM reactions
      WHERE reactions.room_id = rooms.id AND reactions.type = 'hot'
        AND reactions.created_at >= now() - (p_window_minutes || ' minutes')::interval
    ) hot_recent ON true
    LEFT JOIN LATERAL (
      SELECT COUNT(*) AS cnt FROM participants
      WHERE participants.room_id = rooms.id AND participants.left_at IS NULL
    ) active_participants ON true
    WHERE venues.latitude IS NOT NULL AND venues.longitude IS NOT NULL
  ) v
  WHERE v.distance_km <= p_radius_km
$$;

GRANT EXECUTE ON FUNCTION get_live_hot_venues(double precision, double precision, double precision, int) TO anon, authenticated;

-- ============================================================================
-- 6. 검증 완료 쿼리 (배포 후 확인용)
-- ============================================================================

-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public'
--   AND table_name IN ('venues', 'staff_members', 'staff_evaluations', 'venue_reviews');

-- SELECT column_name FROM information_schema.columns
-- WHERE table_name = 'rooms' AND column_name = 'venue_id';

-- ============================================================================
-- Migration v2 Complete
-- ============================================================================
