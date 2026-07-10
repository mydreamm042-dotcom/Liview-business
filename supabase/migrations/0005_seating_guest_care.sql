-- B2B Pivot Phase 4: Seating + Guest Care (경고 메시지)
-- 기존 0001~0004 적용 이후 실행. 모두 additive이며 PERSONAL 방에는 영향 없음.
-- 설계 근거: BUSINESS_RULES.md §2.8(Seating), §2.9(Guest Care), ROADMAP_V2.md Phase 4
-- 쿠폰 지급(venue_coupons/coupon_grants)은 이번 Phase 범위 밖이라 포함하지 않는다.

-- 매장 좌석 목록. 좌석 배정 자체(누가 어느 좌석인지)는 participants.seat_id가 담당하고,
-- 이 테이블은 "그 매장에 어떤 좌석들이 있는지"라는 영구 마스터 데이터만 갖는다 — 오늘의
-- 영업 세션이 바뀌어도(영업 시작/종료를 반복해도) 좌석 목록 자체는 유지된다.
CREATE TABLE IF NOT EXISTS venue_seats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  label text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_venue_seats_venue_id ON venue_seats(venue_id);

ALTER TABLE venue_seats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "venue_seats_select" ON venue_seats FOR SELECT USING (true);
CREATE POLICY "venue_seats_insert" ON venue_seats FOR INSERT WITH CHECK (true);
CREATE POLICY "venue_seats_update" ON venue_seats FOR UPDATE USING (true);
CREATE POLICY "venue_seats_delete" ON venue_seats FOR DELETE USING (true);

-- 참여자의 좌석 배정. BUSINESS 방은 좌석 선택이 필수다(BUSINESS_RULES.md §2.8) — 좌석을
-- 고르기 전에는 seat_id가 null이고, 방 화면 진입 전 단계로 취급된다.
-- seat_assigned_at: 착석 경과시간 타이머(파생값)의 기준 시각. 좌석이 바뀔 때마다(참여자
-- 본인 선택이든 운영자 이동이든) 다시 채워져 "이 좌석에 앉은 지 얼마나 됐는지"를 나타낸다.
ALTER TABLE participants ADD COLUMN IF NOT EXISTS seat_id uuid REFERENCES venue_seats(id) ON DELETE SET NULL;
ALTER TABLE participants ADD COLUMN IF NOT EXISTS seat_assigned_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_participants_seat_id ON participants(seat_id);

-- 운영자가 특정 손님에게 보내는 경고 메시지 (Guest Care 도메인). reactions.warning(참여자
-- 간 익명 자제 시그널)과는 별개 개념이라 별도 테이블로 둔다. 삭제되지 않는 감사 이력이며,
-- acknowledged_at은 참여자가 확인 모달을 닫은 시각이다 (참여자 화면엔 확인 전까지 유지).
CREATE TABLE IF NOT EXISTS operator_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  participant_id uuid NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_operator_alerts_participant ON operator_alerts(participant_id);

ALTER TABLE operator_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "operator_alerts_select" ON operator_alerts FOR SELECT USING (true);
CREATE POLICY "operator_alerts_insert" ON operator_alerts FOR INSERT WITH CHECK (true);
CREATE POLICY "operator_alerts_update" ON operator_alerts FOR UPDATE USING (true);
-- DELETE 정책 없음 — 감사 이력이라 삭제하지 않는다 (BUSINESS_RULES.md §2.9 무결성 원칙)
