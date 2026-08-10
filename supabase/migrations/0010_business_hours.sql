-- 요일별 영업시간 (Venue 도메인 확장, BUSINESS_RULES.md §2.2 "요일별 영업시간") + 마감시간
-- 기반 자동 마감 (§2.1 "마감 시간 기반 자동 마감", Phase 5.5). weekday는 Postgres
-- extract(dow)와 동일하게 0=일요일 ... 6=토요일.
CREATE TABLE IF NOT EXISTS venue_business_hours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  weekday int NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  is_closed boolean NOT NULL DEFAULT false,
  is_24h boolean NOT NULL DEFAULT false,
  open_time time NOT NULL DEFAULT '00:00:00',
  close_time time NOT NULL DEFAULT '00:00:00',
  last_order_time time,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (venue_id, weekday)
);

CREATE INDEX IF NOT EXISTS idx_venue_business_hours_venue ON venue_business_hours(venue_id);

ALTER TABLE venue_business_hours ENABLE ROW LEVEL SECURITY;
CREATE POLICY "venue_business_hours_select" ON venue_business_hours FOR SELECT USING (true);
CREATE POLICY "venue_business_hours_insert" ON venue_business_hours FOR INSERT WITH CHECK (true);
CREATE POLICY "venue_business_hours_update" ON venue_business_hours FOR UPDATE USING (true);
CREATE POLICY "venue_business_hours_delete" ON venue_business_hours FOR DELETE USING (true);

-- 마감 주체 구분 (§2.1 "closed_reason") — 'operator'는 운영자가 직접 "영업 종료"를 누른
-- 경우, 'auto_schedule'은 설정된 마감시간+1시간이 지나 시스템이 자동으로 마감한 경우다.
-- 기존에 이미 마감된 방들은 그 시절엔 자동 마감이 없었으므로 전부 'operator'로 채운다.
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS closed_reason text CHECK (closed_reason IN ('operator', 'auto_schedule'));
UPDATE rooms SET closed_reason = 'operator' WHERE status = 'closed' AND closed_reason IS NULL;

-- 진행 중(active)인 BUSINESS 방 중, 그 영업일(방 생성 요일) 기준 설정된 마감시간+1시간이
-- 지난 것을 자동 마감한다. 판단 근거는 오직 운영자가 선언한 영업시간뿐이다 — 참여자
-- 활동량으로 "조용하니 끝난 것 같다"를 추론하지 않는다(운영자·직원이 참여자로 위장
-- 입장해 활동을 만들면 그 추론이 무력화되기 때문, BUSINESS_RULES.md §2.1 참고).
-- 영업시간이 설정 안 된 매장(이 컬럼 도입 이전 매장 등)은 건드리지 않는다 — 수동
-- "영업 종료"에만 의존한다.
CREATE OR REPLACE FUNCTION close_scheduled_business_sessions()
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  r RECORD;
  v_hours RECORD;
  v_session_date date;
  v_effective_close timestamptz;
  v_auto_close_at timestamptz;
BEGIN
  FOR r IN
    SELECT id, venue_id, created_at
    FROM rooms
    WHERE room_type = 'BUSINESS' AND status = 'active' AND venue_id IS NOT NULL
  LOOP
    v_session_date := r.created_at::date;

    SELECT * INTO v_hours
    FROM venue_business_hours
    WHERE venue_id = r.venue_id AND weekday = extract(dow FROM r.created_at)::int;

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    IF v_hours.is_24h THEN
      -- 24시간 영업은 시작일 다음날 00시를 마감 시점으로 본다 (00:00~24:00 전체 하루).
      v_effective_close := (v_session_date + 1)::timestamptz;
    ELSIF v_hours.is_closed THEN
      -- 정기휴무일에 방이 열려있는 건 이례적인 상황이라 즉시 마감 대상으로 취급한다.
      v_effective_close := r.created_at;
    ELSE
      v_effective_close := (v_session_date + v_hours.close_time)::timestamptz;
      IF v_hours.close_time <= v_hours.open_time THEN
        -- 자정을 넘어가는 영업(예: 14:00~04:00) — 마감 시각이 다음날짜다.
        v_effective_close := v_effective_close + interval '1 day';
      END IF;
    END IF;

    v_auto_close_at := v_effective_close + interval '1 hour';

    IF now() >= v_auto_close_at THEN
      UPDATE rooms
      SET status = 'closed', ended_at = now(), closed_reason = 'auto_schedule'
      WHERE id = r.id;
    END IF;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION close_scheduled_business_sessions() TO anon, authenticated, service_role;
