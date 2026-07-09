-- B2B Pivot: Discovery 응답에 매장별 geofence_radius_m을 포함시킨다.
-- 홈 지도의 마커 상세(바텀시트)가 "입장하기 반경 밖" UX 힌트를 보여주는 데 필요하다
-- (BUSINESS_RULES.md §2.7 "지도 마커 상세", ROADMAP_V2.md Phase 3 스코프 6).
-- 실제 반경 판정은 여전히 join 시점 서버 체크(POST /api/venues/[id]/join)가 최종 근거이며,
-- 이 값은 UI 힌트일 뿐이다. 0002_discovery.sql의 함수를 additive하게 CREATE OR REPLACE.

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
      venues.geofence_radius_m,
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
