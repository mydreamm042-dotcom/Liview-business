-- 운영자 대시보드 (Operator Analytics 도메인, BUSINESS_RULES.md §2.10 "Phase 5"). 매장의
-- 지난 영업일(마감된 BUSINESS 방)을 한 번의 DB 호출로 집계한다 — get_reaction_summary /
-- get_live_hot_venues와 같은 RPC 패턴("dashboard 쿼리는 왕복을 늘리지 않는다").
--
-- HOT 밀도는 방 화면의 실시간 HOT %(초 단위 감쇠 시뮬레이션)와 다른 값이다 — 그 영업일의
-- HOT 탭 총 개수를 손님 수로 나눈 대시보드 전용 파생값이다(§2.10 확정 사항). 재방문 손님은
-- 같은 매장의 서로 다른 영업일에 같은 참여자 session_token이 다시 나타난 경우로 정의하고,
-- 운영자가 "사장님" 닉네임으로 자기 방에 들어온 행은 손님 지표에서 제외한다.
CREATE OR REPLACE FUNCTION get_operator_dashboard(p_venue_id uuid, p_days int DEFAULT 90)
RETURNS json LANGUAGE sql STABLE AS $$
  WITH sessions AS (
    SELECT
      r.id AS room_id,
      r.name,
      r.created_at::date AS session_date,
      EXTRACT(EPOCH FROM (r.ended_at - r.created_at))::bigint AS duration_seconds
    FROM rooms r
    WHERE r.venue_id = p_venue_id
      AND r.room_type = 'BUSINESS'
      AND r.status = 'closed'
  ),
  guests AS (
    SELECT p.room_id, p.session_token
    FROM participants p
    WHERE p.room_id IN (SELECT room_id FROM sessions)
      AND p.nickname != '사장님'
  ),
  per_session_guests AS (
    SELECT room_id, count(*) AS guest_count
    FROM guests GROUP BY room_id
  ),
  per_session_stars AS (
    SELECT room_id, avg(value) AS avg_star
    FROM reactions
    WHERE room_id IN (SELECT room_id FROM sessions) AND type = 'star' AND value IS NOT NULL
    GROUP BY room_id
  ),
  per_session_hot AS (
    SELECT room_id, count(*) AS hot_taps
    FROM reactions
    WHERE room_id IN (SELECT room_id FROM sessions) AND type = 'hot'
    GROUP BY room_id
  ),
  per_session_hearts AS (
    SELECT room_id, count(*) AS heart_count
    FROM reactions
    WHERE room_id IN (SELECT room_id FROM sessions) AND type = 'heart'
    GROUP BY room_id
  ),
  per_session_alerts AS (
    SELECT room_id, count(*) AS alert_count
    FROM operator_alerts
    WHERE room_id IN (SELECT room_id FROM sessions)
    GROUP BY room_id
  ),
  daily_all AS (
    SELECT
      s.room_id,
      s.name,
      s.session_date,
      s.duration_seconds,
      coalesce(g.guest_count, 0) AS guest_count,
      round(coalesce(st.avg_star, 0)::numeric, 2) AS avg_star,
      coalesce(h.hot_taps, 0) AS hot_taps,
      CASE WHEN coalesce(g.guest_count, 0) > 0
        THEN round((coalesce(h.hot_taps, 0)::numeric / g.guest_count), 2)
        ELSE 0 END AS hot_density,
      coalesce(he.heart_count, 0) AS heart_count,
      coalesce(a.alert_count, 0) AS alert_count
    FROM sessions s
    LEFT JOIN per_session_guests g ON g.room_id = s.room_id
    LEFT JOIN per_session_stars st ON st.room_id = s.room_id
    LEFT JOIN per_session_hot h ON h.room_id = s.room_id
    LEFT JOIN per_session_hearts he ON he.room_id = s.room_id
    LEFT JOIN per_session_alerts a ON a.room_id = s.room_id
  ),
  daily_recent AS (
    SELECT * FROM daily_all WHERE session_date >= current_date - p_days
  ),
  returning_guests AS (
    SELECT session_token
    FROM guests
    GROUP BY session_token
    HAVING count(DISTINCT room_id) >= 2
  ),
  visits AS (
    SELECT count(*) AS total_visits, count(DISTINCT session_token) AS unique_guests
    FROM guests
  )
  SELECT json_build_object(
    'total_sessions', (SELECT count(*) FROM sessions),
    'total_guest_visits', (SELECT total_visits FROM visits),
    'unique_guests', (SELECT unique_guests FROM visits),
    'returning_guest_count', (SELECT count(*) FROM returning_guests),
    'avg_guests_per_session', (SELECT round(avg(guest_count), 1) FROM daily_all),
    'avg_star', (SELECT round(avg(avg_star), 2) FROM daily_all WHERE avg_star > 0),
    'avg_hot_density', (SELECT round(avg(hot_density), 2) FROM daily_all),
    'daily', (
      SELECT coalesce(json_agg(json_build_object(
        'room_id', room_id, 'name', name, 'date', session_date,
        'duration_seconds', duration_seconds, 'guest_count', guest_count,
        'avg_star', avg_star, 'hot_taps', hot_taps, 'hot_density', hot_density,
        'heart_count', heart_count, 'alert_count', alert_count
      ) ORDER BY session_date), '[]'::json)
      FROM daily_recent
    ),
    'best_by_hot_density', (
      SELECT coalesce(json_agg(json_build_object('room_id', room_id, 'name', name, 'date', session_date, 'hot_density', hot_density)), '[]'::json)
      FROM (SELECT * FROM daily_all WHERE hot_density > 0 ORDER BY hot_density DESC, session_date DESC LIMIT 3) t
    ),
    'best_by_star', (
      SELECT coalesce(json_agg(json_build_object('room_id', room_id, 'name', name, 'date', session_date, 'avg_star', avg_star)), '[]'::json)
      FROM (SELECT * FROM daily_all WHERE avg_star > 0 ORDER BY avg_star DESC, session_date DESC LIMIT 3) t
    ),
    'best_by_guests', (
      SELECT coalesce(json_agg(json_build_object('room_id', room_id, 'name', name, 'date', session_date, 'guest_count', guest_count)), '[]'::json)
      FROM (SELECT * FROM daily_all WHERE guest_count > 0 ORDER BY guest_count DESC, session_date DESC LIMIT 3) t
    ),
    'weekday_pattern', (
      SELECT coalesce(json_agg(json_build_object('weekday', dow, 'avg_guests', avg_guests) ORDER BY dow), '[]'::json)
      FROM (
        SELECT extract(dow FROM session_date)::int AS dow, round(avg(guest_count), 1) AS avg_guests
        FROM daily_all
        GROUP BY dow
      ) w
    )
  );
$$;

GRANT EXECUTE ON FUNCTION get_operator_dashboard(uuid, int) TO anon, authenticated;
