-- ROLLBACK for 0001_b2b_foundation.sql
--
-- 이 파일은 자동 적용되지 않는다. 0001_b2b_foundation.sql이 만든 변경을 정확히
-- 역순으로 되돌리기 위한 수동 실행용 스크립트다. SQL Editor에 전체를 붙여넣고
-- 실행하면 이 마이그레이션 이전 상태(순수 B2C 스키마)로 되돌아간다.
--
-- 주의: BUSINESS 방/venues 데이터가 이미 생성된 뒤 실행하면 그 데이터는
-- 함께 삭제된다(venues DROP TABLE CASCADE, rooms.venue_id/room_type 컬럼 제거).
-- 베타 시작 전 "테스트 데이터만 정리"할 목적이면 이 스크립트 대신 해당 테스트
-- 행만 DELETE하는 것으로 충분하다 — 이 스크립트는 B2B 스키마 자체를 완전히
-- 걷어낼 때만 사용한다.

-- 1. delete_old_rooms()를 원래(B2C 전용) 버전으로 복원
CREATE OR REPLACE FUNCTION delete_old_rooms()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM rooms
  WHERE status = 'ended'
    AND created_at < now() - INTERVAL '24 hours';

  DELETE FROM rooms
  WHERE status = 'active'
    AND created_at < now() - INTERVAL '2 days';
END;
$$;

-- 2. status 제약을 원래(active/ended만)로 복원
ALTER TABLE rooms DROP CONSTRAINT IF EXISTS rooms_status_check;
ALTER TABLE rooms ADD CONSTRAINT rooms_status_check
  CHECK (status IN ('active', 'ended'));

-- 3. rooms에 추가했던 컬럼 제거 (venue_id 먼저 — venues 참조가 있으므로)
DROP INDEX IF EXISTS idx_rooms_venue_id;
DROP INDEX IF EXISTS idx_rooms_room_type;
ALTER TABLE rooms DROP COLUMN IF EXISTS venue_id;
ALTER TABLE rooms DROP CONSTRAINT IF EXISTS rooms_room_type_check;
ALTER TABLE rooms DROP COLUMN IF EXISTS room_type;

-- 4. venues 테이블 제거 (정책/인덱스는 테이블과 함께 자동 삭제됨)
DROP TABLE IF EXISTS venues;

-- 이 시점에서 스키마는 0001_b2b_foundation.sql 적용 이전과 동일하다.
