-- B2B Pivot Phase 1: Foundation
-- 기존 schema.sql 적용 이후에 실행하는 추가 마이그레이션. 모든 변경은 additive이며
-- PERSONAL(기존 B2C) 방의 동작에는 영향을 주지 않는다.
-- 설계 근거: docs/b2b-pivot/B2B_PIVOT_DESIGN.md, B2B_PIVOT_ADDENDUM.md, BUSINESS_RULES.md

-- ============================================================================
-- 1. venues — 매장 마스터 엔티티
-- 방(세션)이 여러 번 열려도 유지되는 브랜딩/위치/설정의 소유자.
-- operator_owner_token은 MVP 운영자 인증값(참여자 session_token과 같은 방식의
-- 클라이언트 발급 UUID). 정식 계정 시스템 도입 시 대체 예정.
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
  primary_color text,
  secondary_color text,

  naver_review_url text,
  google_review_url text,
  kakao_review_url text,

  -- 실시간 공개 채팅. 기본 비활성화, 운영자 opt-in 시에만 외부 노출 (BUSINESS_RULES 2.5)
  public_chat_enabled boolean NOT NULL DEFAULT false,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_venues_owner_token ON venues(operator_owner_token);
CREATE INDEX IF NOT EXISTS idx_venues_location ON venues(latitude, longitude);

ALTER TABLE venues ENABLE ROW LEVEL SECURITY;
CREATE POLICY "venues_select" ON venues FOR SELECT USING (true);
CREATE POLICY "venues_insert" ON venues FOR INSERT WITH CHECK (true);
CREATE POLICY "venues_update" ON venues FOR UPDATE USING (true);

-- ============================================================================
-- 2. rooms 확장 — room_type / venue_id / 'closed' 상태
-- ============================================================================

-- 기본값 PERSONAL: 기존 방과 기존 API 호출은 전부 PERSONAL로 남는다 (하위 호환)
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS room_type text NOT NULL DEFAULT 'PERSONAL';
ALTER TABLE rooms DROP CONSTRAINT IF EXISTS rooms_room_type_check;
ALTER TABLE rooms ADD CONSTRAINT rooms_room_type_check
  CHECK (room_type IN ('PERSONAL', 'BUSINESS'));

ALTER TABLE rooms ADD COLUMN IF NOT EXISTS venue_id uuid REFERENCES venues(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_rooms_venue_id ON rooms(venue_id);
CREATE INDEX IF NOT EXISTS idx_rooms_room_type ON rooms(room_type);

-- BUSINESS 방은 "종료(ended)"가 아니라 "마감(closed)"으로 전이한다.
-- closed 방은 삭제되지 않고 매장 이력으로 영구 보존된다 (BUSINESS_RULES 2.1).
ALTER TABLE rooms DROP CONSTRAINT IF EXISTS rooms_status_check;
ALTER TABLE rooms ADD CONSTRAINT rooms_status_check
  CHECK (status IN ('active', 'ended', 'closed'));

-- ============================================================================
-- 3. cleanup 함수 수정 — PERSONAL 방만 정리 대상으로 한정
-- BUSINESS 방은 상태와 무관하게 자동 삭제되지 않는다.
-- ============================================================================

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
