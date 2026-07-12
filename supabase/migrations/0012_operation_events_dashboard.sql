-- 운영 메모(operation_events)를 대시보드 응답에 포함시킨다 (Operator Analytics 도메인,
-- BUSINESS_RULES.md §2.10 "이벤트 노출 위치" — 마감 후엔 운영 리포트의 추이 그래프 위에
-- 그 시각 마커로 표시되어야 한다). 0009_operator_dashboard_rpc.sql의 함수를 additive하게
-- CREATE OR REPLACE — 각 일별(daily) 항목에 그날 남긴 메모 배열만 추가한다.
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
  per_session_events AS (
    SELECT room_id, json_agg(json_build_object('content', content, 'created_at', created_at) ORDER BY created_at) AS events
    FROM operation_events
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
      coalesce(a.alert_count, 0) AS alert_count,
      coalesce(ev.events, '[]'::json) AS events
    FROM sessions s
    LEFT JOIN per_session_guests g ON g.room_id = s.room_id
    LEFT JOIN per_session_stars st ON st.room_id = s.room_id
    LEFT JOIN per_session_hot h ON h.room_id = s.room_id
    LEFT JOIN per_session_hearts he ON he.room_id = s.room_id
    LEFT JOIN per_session_alerts a ON a.room_id = s.room_id
    LEFT JOIN per_session_events ev ON ev.room_id = s.room_id
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
        'heart_count', heart_count, 'alert_count', alert_count, 'events', events
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
