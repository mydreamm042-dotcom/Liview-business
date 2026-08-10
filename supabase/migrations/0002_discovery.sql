-- B2B Pivot Phase 3: Discovery (지도 홈 + 실시간 핫플레이스 탐색)
-- 기존 0001_b2b_foundation.sql 적용 이후 실행. venues.latitude/longitude/category/
-- public_chat_enabled는 이미 0001에서 추가됐으므로 여기서는 조회 함수만 추가한다.
-- 설계 근거: docs/b2b-pivot/BUSINESS_RULES.md §2.6 (Discovery), ROADMAP_V2.md Phase 3

-- 위치 기반 실시간 HOT 매장 랭킹.
-- 정규화 원칙: 단순 HOT 총량이 아니라 "활성 참여자 수 대비 최근 N분 HOT 밀도"로 점수를 매겨
-- 대형 매장이 항상 유리해지는 편향을 방지한다 (BUSINESS_RULES.md §2.6).
-- 응답에는 방 코드/QR을 절대 포함하지 않는다 — Discovery 도메인의 핵심 무결성 규칙.
CREATE OR REPLACE FUNCTION get_live_hot_venues(
  p_lat double precision,
  p_lng double precision,
  p_radius_km double precision DEFAULT 10,
  p_window_minutes int DEFAULT 15,
  p_category text DEFAULT NULL
)
RETURNS json LANGUAGE sql STABLE AS $$
  SELECT COALESCE(json_agg(v ORDER BY v.hot_score DESC), '[]'::json)
  FROM (
    SELECT
      venues.id,
      venues.name,
      venues.category,
      venues.logo_url,
      venues.hero_image_url,
      venues.latitude,
      venues.longitude,
      venues.public_chat_enabled,
      COALESCE(hot_recent.cnt, 0)::float / GREATEST(active_participants.cnt, 1) AS hot_score,
      COALESCE(mood.avg_mood, 0) AS satisfaction,
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
    LEFT JOIN LATERAL (
      SELECT AVG(value) AS avg_mood FROM reactions
      WHERE reactions.room_id = rooms.id AND reactions.type = 'star' AND reactions.value IS NOT NULL
    ) mood ON true
    WHERE venues.latitude IS NOT NULL AND venues.longitude IS NOT NULL
      AND (p_category IS NULL OR venues.category = p_category)
  ) v
  WHERE v.distance_km <= p_radius_km
$$;

GRANT EXECUTE ON FUNCTION get_live_hot_venues(double precision, double precision, double precision, int, text) TO anon, authenticated;
