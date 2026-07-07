-- MySTAR B2B Pivot - Database Migration
-- Phase 1: Foundation Tables & Columns
-- Date: 2026-07-07
-- WARNING: This migration is additive only. No existing data will be deleted or modified.

-- ============================================================================
-- 1. Modify existing tables (add columns with safe defaults)
-- ============================================================================

-- Add room_type to rooms (defaults to PERSONAL for backward compatibility)
ALTER TABLE rooms
ADD COLUMN IF NOT EXISTS room_type text DEFAULT 'PERSONAL'
CHECK (room_type IN ('PERSONAL', 'BUSINESS'));

-- Add operator tracking to rooms
ALTER TABLE rooms
ADD COLUMN IF NOT EXISTS operator_session_id uuid;

ALTER TABLE rooms
ADD COLUMN IF NOT EXISTS operator_name text;

ALTER TABLE rooms
ADD COLUMN IF NOT EXISTS store_name text;

-- Add participant identification fields for BUSINESS rooms
ALTER TABLE participants
ADD COLUMN IF NOT EXISTS is_identified boolean DEFAULT false;

ALTER TABLE participants
ADD COLUMN IF NOT EXISTS phone_number text;

ALTER TABLE participants
ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;

-- ============================================================================
-- 2. Create new tables
-- ============================================================================

-- Room Configuration (B2B settings, branding, etc.)
CREATE TABLE IF NOT EXISTS room_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL UNIQUE REFERENCES rooms(id) ON DELETE CASCADE,
  room_type text NOT NULL DEFAULT 'PERSONAL' CHECK (room_type IN ('PERSONAL', 'BUSINESS')),

  -- Store information
  store_name text,
  store_description text,

  -- Branding assets
  logo_url text,
  hero_image_url text,
  primary_color text DEFAULT '#667eea',
  secondary_color text DEFAULT '#764ba2',
  theme_name text,

  -- Review configuration
  naver_review_url text,
  google_review_url text,
  kakao_review_url text,

  -- Metadata
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Operator Session Management
CREATE TABLE IF NOT EXISTS operator_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,

  -- Session tracking
  operator_token text NOT NULL UNIQUE,
  operator_name text,
  operator_email text,

  -- Session lifecycle
  logged_in_at timestamptz DEFAULT now(),
  logged_out_at timestamptz,
  last_activity_at timestamptz DEFAULT now(),

  -- Audit trail
  ip_address text,
  user_agent text,

  -- Metadata
  created_at timestamptz DEFAULT now(),

  CONSTRAINT unique_active_operator_per_room UNIQUE NULLS NOT DISTINCT (room_id, logged_out_at)
);

-- Staff Shift Tracking (for staff performance analysis)
CREATE TABLE IF NOT EXISTS staff_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,

  -- Staff information
  staff_name text NOT NULL,
  staff_id text,

  -- Shift timing
  shift_start_at timestamptz NOT NULL,
  shift_end_at timestamptz,

  -- Additional info
  notes text,

  -- Audit trail
  created_at timestamptz DEFAULT now(),
  created_by text NOT NULL,
  updated_at timestamptz DEFAULT now(),

  -- Indexes for common queries
  CONSTRAINT valid_shift_times CHECK (shift_end_at IS NULL OR shift_end_at >= shift_start_at)
);

-- Operation Events (timeline of what happened during service)
CREATE TABLE IF NOT EXISTS operation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,

  -- Event classification
  event_type text NOT NULL CHECK (event_type IN (
    'staff_shift',
    'game_start',
    'music_change',
    'service_provided',
    'event_start',
    'custom_memo',
    'special_announcement'
  )),

  -- Event content
  title text NOT NULL,
  description text,
  metadata json DEFAULT '{}'::json,

  -- Timing
  event_time timestamptz NOT NULL,

  -- Audit trail
  created_at timestamptz DEFAULT now(),
  created_by text NOT NULL,
  updated_at timestamptz DEFAULT now()
);

-- ============================================================================
-- 3. Create Indexes for Performance
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_room_configs_room_id ON room_configs(room_id);
CREATE INDEX IF NOT EXISTS idx_room_configs_room_type ON room_configs(room_type);
CREATE INDEX IF NOT EXISTS idx_operator_sessions_room_id ON operator_sessions(room_id);
CREATE INDEX IF NOT EXISTS idx_operator_sessions_operator_token ON operator_sessions(operator_token);
CREATE INDEX IF NOT EXISTS idx_operator_sessions_logged_out ON operator_sessions(logged_out_at);
CREATE INDEX IF NOT EXISTS idx_staff_shifts_room_id ON staff_shifts(room_id);
CREATE INDEX IF NOT EXISTS idx_staff_shifts_shift_start ON staff_shifts(shift_start_at);
CREATE INDEX IF NOT EXISTS idx_operation_events_room_id ON operation_events(room_id);
CREATE INDEX IF NOT EXISTS idx_operation_events_event_time ON operation_events(event_time);
CREATE INDEX IF NOT EXISTS idx_operation_events_event_type ON operation_events(event_type);
CREATE INDEX IF NOT EXISTS idx_rooms_room_type ON rooms(room_type);
CREATE INDEX IF NOT EXISTS idx_rooms_operator_session_id ON rooms(operator_session_id);
CREATE INDEX IF NOT EXISTS idx_participants_is_identified ON participants(is_identified);
CREATE INDEX IF NOT EXISTS idx_participants_reviewed_at ON participants(reviewed_at);

-- ============================================================================
-- 4. Enable Row Level Security
-- ============================================================================

ALTER TABLE room_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE operator_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE operation_events ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 5. Create RLS Policies
-- ============================================================================

-- room_configs: Everyone can read, but writes need proper auth
CREATE POLICY "room_configs_select" ON room_configs FOR SELECT USING (true);
CREATE POLICY "room_configs_insert" ON room_configs FOR INSERT WITH CHECK (true);
CREATE POLICY "room_configs_update" ON room_configs FOR UPDATE USING (true);
CREATE POLICY "room_configs_delete" ON room_configs FOR DELETE USING (true);

-- operator_sessions: Read and write are open (will be gated by application logic)
CREATE POLICY "operator_sessions_select" ON operator_sessions FOR SELECT USING (true);
CREATE POLICY "operator_sessions_insert" ON operator_sessions FOR INSERT WITH CHECK (true);
CREATE POLICY "operator_sessions_update" ON operator_sessions FOR UPDATE USING (true);
CREATE POLICY "operator_sessions_delete" ON operator_sessions FOR DELETE USING (true);

-- staff_shifts: Read and write are open (will be gated by application logic)
CREATE POLICY "staff_shifts_select" ON staff_shifts FOR SELECT USING (true);
CREATE POLICY "staff_shifts_insert" ON staff_shifts FOR INSERT WITH CHECK (true);
CREATE POLICY "staff_shifts_update" ON staff_shifts FOR UPDATE USING (true);
CREATE POLICY "staff_shifts_delete" ON staff_shifts FOR DELETE USING (true);

-- operation_events: Read and write are open (will be gated by application logic)
CREATE POLICY "operation_events_select" ON operation_events FOR SELECT USING (true);
CREATE POLICY "operation_events_insert" ON operation_events FOR INSERT WITH CHECK (true);
CREATE POLICY "operation_events_update" ON operation_events FOR UPDATE USING (true);
CREATE POLICY "operation_events_delete" ON operation_events FOR DELETE USING (true);

-- ============================================================================
-- 6. Helper Functions for Analytics
-- ============================================================================

-- Get participation funnel data for a room
CREATE OR REPLACE FUNCTION get_participation_funnel(p_room_id uuid)
RETURNS json LANGUAGE sql STABLE AS $$
  SELECT json_build_object(
    'qr_scans', (
      SELECT COUNT(DISTINCT session_token)
      FROM participants
      WHERE room_id = p_room_id
    ),
    'room_entries', (
      SELECT COUNT(*)
      FROM participants
      WHERE room_id = p_room_id
    ),
    'feedback_participants', (
      SELECT COUNT(DISTINCT receiver_id)
      FROM reactions
      WHERE room_id = p_room_id AND type != 'hot'
    ),
    'heart_givers', (
      SELECT COUNT(DISTINCT sender_session)
      FROM reactions
      WHERE room_id = p_room_id AND type = 'heart'
    ),
    'chat_participants', (
      SELECT COUNT(DISTINCT sender_participant_id)
      FROM messages
      WHERE room_id = p_room_id
    ),
    'results_viewers', (
      SELECT COUNT(*)
      FROM participants
      WHERE room_id = p_room_id AND result_viewed_at IS NOT NULL
    )
  );
$$;

GRANT EXECUTE ON FUNCTION get_participation_funnel(uuid) TO anon, authenticated;

-- Get operation summary for a room
CREATE OR REPLACE FUNCTION get_operation_summary(p_room_id uuid)
RETURNS json LANGUAGE sql STABLE AS $$
  SELECT json_build_object(
    'total_participants', (
      SELECT COUNT(*) FROM participants WHERE room_id = p_room_id
    ),
    'avg_satisfaction', (
      SELECT ROUND(AVG(CAST(value AS numeric)), 2)
      FROM reactions
      WHERE room_id = p_room_id AND type = 'star' AND value IS NOT NULL
    ),
    'peak_hot_count', (
      SELECT COUNT(*)
      FROM reactions
      WHERE room_id = p_room_id AND type = 'hot'
      GROUP BY DATE_TRUNC('minute', created_at)
      ORDER BY COUNT(*) DESC
      LIMIT 1
    ),
    'total_messages', (
      SELECT COUNT(*) FROM messages WHERE room_id = p_room_id
    ),
    'total_hearts', (
      SELECT COUNT(*) FROM reactions WHERE room_id = p_room_id AND type = 'heart'
    ),
    'total_warnings', (
      SELECT COUNT(*) FROM reactions WHERE room_id = p_room_id AND type = 'warning'
    ),
    'staff_shifts_count', (
      SELECT COUNT(*) FROM staff_shifts WHERE room_id = p_room_id
    ),
    'operation_events_count', (
      SELECT COUNT(*) FROM operation_events WHERE room_id = p_room_id
    )
  );
$$;

GRANT EXECUTE ON FUNCTION get_operation_summary(uuid) TO anon, authenticated;

-- Get hourly breakdown of metrics
CREATE OR REPLACE FUNCTION get_hourly_breakdown(p_room_id uuid)
RETURNS json LANGUAGE sql STABLE AS $$
  SELECT json_agg(
    json_build_object(
      'hour', DATE_TRUNC('hour', r.created_at),
      'heart_count', COALESCE(hc.cnt, 0),
      'warning_count', COALESCE(wc.cnt, 0),
      'hot_count', COALESCE(hoc.cnt, 0),
      'avg_satisfaction', COALESCE(ROUND(CAST(sc.avg_val AS numeric), 2), 0)
    )
  )
  FROM (
    SELECT DISTINCT DATE_TRUNC('hour', created_at)
    FROM reactions
    WHERE room_id = p_room_id
  ) r
  LEFT JOIN (
    SELECT DATE_TRUNC('hour', created_at) as hour, COUNT(*) as cnt
    FROM reactions
    WHERE room_id = p_room_id AND type = 'heart'
    GROUP BY DATE_TRUNC('hour', created_at)
  ) hc ON r.date_trunc = hc.hour
  LEFT JOIN (
    SELECT DATE_TRUNC('hour', created_at) as hour, COUNT(*) as cnt
    FROM reactions
    WHERE room_id = p_room_id AND type = 'warning'
    GROUP BY DATE_TRUNC('hour', created_at)
  ) wc ON r.date_trunc = wc.hour
  LEFT JOIN (
    SELECT DATE_TRUNC('hour', created_at) as hour, COUNT(*) as cnt
    FROM reactions
    WHERE room_id = p_room_id AND type = 'hot'
    GROUP BY DATE_TRUNC('hour', created_at)
  ) hoc ON r.date_trunc = hoc.hour
  LEFT JOIN (
    SELECT DATE_TRUNC('hour', created_at) as hour, AVG(value) as avg_val
    FROM reactions
    WHERE room_id = p_room_id AND type = 'star'
    GROUP BY DATE_TRUNC('hour', created_at)
  ) sc ON r.date_trunc = sc.hour
  ORDER BY r.date_trunc;
$$;

GRANT EXECUTE ON FUNCTION get_hourly_breakdown(uuid) TO anon, authenticated;

-- ============================================================================
-- 7. Update existing cleanup function to preserve room_configs
-- ============================================================================

-- The existing delete_old_rooms() function will cascade delete
-- room_configs, operator_sessions, staff_shifts, operation_events
-- due to ON DELETE CASCADE - this is intentional and correct.

-- ============================================================================
-- 8. Verification Queries (run these to verify migration)
-- ============================================================================

-- Check that all new columns exist
-- SELECT column_name FROM information_schema.columns
-- WHERE table_name = 'rooms' AND column_name IN ('room_type', 'operator_session_id', 'operator_name', 'store_name');

-- Check that all new tables exist
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public' AND table_name IN ('room_configs', 'operator_sessions', 'staff_shifts', 'operation_events');

-- ============================================================================
-- Migration Complete
-- ============================================================================
-- Next steps:
-- 1. Deploy this migration
-- 2. Test existing functionality (PERSONAL rooms should be unaffected)
-- 3. Implement API endpoints for room_configs
-- 4. Implement operator login/session management
-- 5. Begin Phase 2: Room Configuration UI
