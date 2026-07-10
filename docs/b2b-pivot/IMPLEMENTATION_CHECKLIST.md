# MySTAR B2B Pivot - Implementation Checklist

## Overview
This checklist tracks the implementation of the B2B pivot feature across 6 phases. Each phase builds on the previous one and should be completed before moving to the next.

> ⚠️ Phase 순서/스코프는 `ROADMAP_V2.md`가 최신 기준이다 (이 문서의 6-phase 구조와 다름). 아래 세부 항목은
> 실제 적용된 스키마(`supabase/migrations/*.sql`)와 어긋나는 부분이 있을 수 있다.

---

## Phase 1: Foundation (Core B2B Structure)

### Database Schema
- [ ] Deploy schema changes via `supabase/migrations/*.sql`
- [ ] Verify new tables created:
  - [ ] room_configs
  - [ ] operator_sessions
  - [ ] staff_shifts
  - [ ] operation_events
- [ ] Verify new columns in existing tables:
  - [ ] rooms.room_type
  - [ ] rooms.operator_session_id
  - [ ] rooms.operator_name
  - [ ] rooms.store_name
  - [ ] participants.is_identified
  - [ ] participants.phone_number
  - [ ] participants.reviewed_at
- [ ] Verify indexes created
- [ ] Verify RLS policies enabled

### Type Definitions
- [ ] Update `src/lib/supabase/types.ts` with new table types
  - [ ] RoomConfig type
  - [ ] OperatorSession type
  - [ ] StaffShift type
  - [ ] OperationEvent type

### Room Creation Flow
- [ ] Modify `src/app/create/page.tsx` to include room type selection
- [ ] Update `/api/rooms` endpoint to:
  - [ ] Accept `room_type` parameter
  - [ ] Default to PERSONAL if not specified
  - [ ] Create room_config entry for BUSINESS rooms

### Room Modification
- [ ] Update room type check throughout codebase
- [ ] Add room type to room detail retrieval

### Testing
- [ ] Create PERSONAL room (verify no B2B features)
- [ ] Create BUSINESS room (verify room_type stored correctly)
- [ ] Verify existing PERSONAL rooms are unaffected
- [ ] Unit tests for room type validation

---

## Phase 2: Room Configuration (Branding & Settings)

### UI Components
- [ ] Create `src/components/branding/BrandingEditor.tsx`
  - [ ] Logo upload
  - [ ] Hero image upload
  - [ ] Color picker (primary/secondary)
  - [ ] Store name/description input
  - [ ] Theme selection
- [ ] Create `src/components/branding/BrandHeader.tsx`
  - [ ] Display store branding on participant views
  - [ ] Conditional rendering (BUSINESS only)

### Operator Pages
- [ ] Create `src/app/operator/settings/[code]/page.tsx`
  - [ ] Access control (operator only)
  - [ ] Room config form
  - [ ] Logo/image uploads
  - [ ] Save & update functionality

### API Endpoints
- [ ] `POST /api/rooms/[code]/config` - Create/update config
- [ ] `GET /api/rooms/[code]/config` - Get config
- [ ] Image upload handling (Supabase Storage or external service)

### Review URL Configuration
- [ ] Add review URL fields to config editor
  - [ ] Naver review URL
  - [ ] Google review URL (future)
  - [ ] Kakao review URL (future)
- [ ] Update room_configs table with review URLs

### Operator Authentication (Temporary Solution)
- [ ] Implement basic operator token generation
  - [ ] Format: room_code + secret
  - [ ] Store in operator_sessions table
  - [ ] Validate on subsequent requests

### Testing
- [ ] Create/update room config
- [ ] Verify branding displays on participant views
- [ ] Test review URL configuration
- [ ] Verify PERSONAL rooms never show B2B features
- [ ] Image upload tests

---

## Phase 3: Operator Dashboard

### Operator Login/Dashboard
- [ ] Create `src/app/operator/login/page.tsx`
  - [ ] Simple room code + token entry
  - [ ] Session management

- [ ] Create `src/app/operator/dashboard/[code]/page.tsx`
  - [ ] Access control (operator only)
  - [ ] Real-time metrics display

### Dashboard Components
- [ ] `src/components/operator/DashboardCard.tsx` - Metric display
- [ ] `src/components/operator/MetricGraph.tsx` - Line charts
- [ ] `src/components/operator/FunnelVisualization.tsx` - Funnel chart
- [ ] `src/components/operator/StatsOverview.tsx` - Key metrics

### Real-time Data
- [ ] Create `src/hooks/useDashboardData.ts`
  - [ ] Fetch metrics every 3 seconds
  - [ ] Handle real-time updates
  - [ ] Cached data to avoid flicker

### Dashboard API Endpoints
- [ ] `GET /api/operator/dashboard/[code]` - Main metrics
  - [ ] Current participants
  - [ ] Participation rate
  - [ ] HOT trend
  - [ ] Satisfaction average
  - [ ] Chat activity
  - [ ] Heart/warning counts

### Visualization Library
- [ ] Add charting library (Recharts recommended)
- [ ] Create reusable chart components
- [ ] Test with sample data

### Testing
- [ ] Login to operator dashboard
- [ ] Verify real-time metrics update
- [ ] Test with participants in room
- [ ] Chart rendering tests

---

## Phase 4: Event Timeline & Analytics

### Tables & Data Model
- [ ] Verify staff_shifts table structure
- [ ] Verify operation_events table structure
- [ ] Create migration for sample data (if needed)

### Staff Shift Management
- [ ] Create `src/app/operator/staff/[code]/page.tsx`
- [ ] Create `src/components/operator/StaffShiftManager.tsx`
  - [ ] Add new shift
  - [ ] End current shift
  - [ ] View shift history
  - [ ] Staff name input

### API Endpoints
- [ ] `POST /api/operator/rooms/[code]/staff` - Create staff shift
- [ ] `GET /api/operator/rooms/[code]/staff` - Get staff shifts
- [ ] `PATCH /api/operator/rooms/[code]/staff/[id]` - Update shift

### Operation Events
- [ ] Create `src/app/operator/events/[code]/page.tsx`
- [ ] Create `src/components/operator/EventTimeline.tsx`
  - [ ] Event type selection
  - [ ] Event description input
  - [ ] Event time (auto-now)
  - [ ] Timeline display

### Event Types
- [ ] game_start
- [ ] music_change
- [ ] service_provided
- [ ] event_start
- [ ] custom_memo
- [ ] special_announcement

### API Endpoints
- [ ] `POST /api/operator/rooms/[code]/events` - Create event
- [ ] `GET /api/operator/rooms/[code]/events` - Get event timeline
- [ ] `DELETE /api/operator/rooms/[code]/events/[id]` - Delete event (if needed)

### Timeline Visualization
- [ ] Create `src/components/operator/EventTimeline.tsx`
  - [ ] Chronological event display
  - [ ] Event icons/colors
  - [ ] Time labels
  - [ ] Staff shift overlay

### Hourly Analytics
- [ ] Create `src/app/operator/analytics/[code]/page.tsx`
- [ ] Create `src/components/operator/HourlyBreakdown.tsx`
  - [ ] Hourly metrics grid
  - [ ] HOT by hour
  - [ ] Satisfaction by hour
  - [ ] Warnings/hearts by hour

### API Endpoints
- [ ] `GET /api/operator/rooms/[code]/analytics/hourly` - Hourly data

### Testing
- [ ] Create staff shifts
- [ ] Create operation events
- [ ] View timeline
- [ ] Test hourly analytics

---

## Phase 5: Review Solicitation & Tracking

### Review Solicitation (Participant Side)
- [ ] Create `src/app/participant/review/[code]/page.tsx`
  - [ ] Show after results screen exit (BUSINESS only)
  - [ ] Display review invitation message
  - [ ] Show review buttons (Naver, Google, Kakao)
  - [ ] Track button clicks

### Components
- [ ] Create `src/components/ReviewSolicitation.tsx`
  - [ ] Non-intrusive modal/overlay
  - [ ] Review button links
  - [ ] "Maybe later" button

### Participant Identification (Optional)
- [ ] Update `src/app/room/[code]/page.tsx`
  - [ ] For BUSINESS rooms, option to identify (phone number, email)
  - [ ] Optional (not required for participation)
  - [ ] Store in participants table

### API Endpoints
- [ ] `POST /api/participant/[code]/review-click` - Track review button click
- [ ] `POST /api/participant/[code]/reviewed` - Record review completed

### Tracking & Analytics
- [ ] Update `/api/operator/rooms/[code]/report` to include:
  - [ ] Review solicitation impression count
  - [ ] Review click-through rate
  - [ ] Review completion rate (optional)

### Testing
- [ ] Verify review modal shows on results exit
- [ ] Test review link navigation
- [ ] Verify tracking events recorded

---

## Phase 6: Polish & Integration

### Security & Permissions
- [ ] Implement operator authentication properly
  - [ ] Token validation middleware
  - [ ] Session timeout
  - [ ] Rate limiting
- [ ] Add RLS policies to restrict operator access
- [ ] Audit trail for operator actions

### Operator Results View
- [ ] Create `src/app/operator/results/[code]/page.tsx`
  - [ ] Operator-specific view (more data than participant)
  - [ ] Include participation funnel
  - [ ] Include operation events
  - [ ] Include staff shifts

### Operation Report
- [ ] Create `src/app/operator/report/[code]/page.tsx`
- [ ] API: `GET /api/operator/rooms/[code]/report`
  - [ ] Average satisfaction
  - [ ] Peak HOT time
  - [ ] Participation rate
  - [ ] Total messages
  - [ ] Total hearts
  - [ ] Total warnings
  - [ ] Duration
  - [ ] Summary statistics

### Data Export
- [ ] Export report as PDF
- [ ] Export metrics as CSV
- [ ] Export event timeline

### Participation Funnel
- [ ] Create `src/app/operator/funnel/[code]/page.tsx`
- [ ] Create `src/components/operator/FunnelVisualization.tsx`
- [ ] API: `GET /api/operator/rooms/[code]/funnel`
  - [ ] QR scans → Room entries
  - [ ] Room entries → Feedback
  - [ ] Feedback → Hearts
  - [ ] Hearts → Chat
  - [ ] Chat → Results viewed
  - [ ] Drop-off rates

### Performance Optimization
- [ ] Optimize dashboard queries
- [ ] Add result caching
- [ ] Minimize re-renders
- [ ] Test with 100+ participants

### Mobile Optimization
- [ ] Test operator dashboard on mobile
- [ ] Responsive charts
- [ ] Touch-friendly controls
- [ ] Optimized layouts

### Documentation
- [ ] API documentation
- [ ] Component documentation
- [ ] Operator user guide

### Testing
- [ ] End-to-end tests for operator workflows
- [ ] Performance tests
- [ ] Mobile responsiveness tests
- [ ] Security tests

### Final Verification
- [ ] Verify PERSONAL rooms completely unaffected
- [ ] Verify all existing APIs still work
- [ ] Verify no breaking changes
- [ ] Load testing with concurrent rooms

---

## General Testing Checklist

### Backward Compatibility
- [ ] Create PERSONAL room (should work exactly as before)
- [ ] Existing participants can still join
- [ ] Existing reactions work normally
- [ ] Existing chat works normally
- [ ] Results screen shows for PERSONAL rooms

### B2C (PERSONAL) Room Test Cases
- [ ] QR entry works
- [ ] Room creation works
- [ ] Anonymous hearts work
- [ ] HOT taps work
- [ ] Satisfaction ratings work
- [ ] Restraint signals work
- [ ] Chat works
- [ ] Results screen displays
- [ ] No B2B features visible

### B2B (BUSINESS) Room Test Cases
- [ ] Room type can be set to BUSINESS
- [ ] Branding displays correctly
- [ ] Operator can login
- [ ] Dashboard shows metrics
- [ ] Staff shifts can be created
- [ ] Events can be recorded
- [ ] Timeline displays correctly
- [ ] Analytics show correct data
- [ ] Review solicitation appears
- [ ] Reports generate correctly

### Edge Cases
- [ ] Room with no participants
- [ ] Room with 100+ participants
- [ ] Very long event timeline
- [ ] Staff shifts with gaps
- [ ] Missing branding assets
- [ ] Invalid review URLs

### Security Tests
- [ ] Operator cannot access other rooms
- [ ] Participant cannot access operator dashboard
- [ ] Session tokens expire properly
- [ ] Rate limiting prevents abuse

---

## Bug/Issue Tracking

Track any issues found during development:

| Issue | Description | Status | Resolution |
|-------|-------------|--------|-----------|
| | | | |

---

## Performance Benchmarks

Target metrics for Phase 6:

| Metric | Target | Status |
|--------|--------|--------|
| Dashboard load time | < 1s | |
| Metrics refresh | < 3s | |
| Chart render time | < 500ms | |
| API response time | < 200ms | |
| Page load (operator) | < 2s | |

---

## Deployment Checklist

Before deploying to production:

- [ ] All phases completed
- [ ] All tests passing
- [ ] Code review completed
- [ ] Database migration applied
- [ ] Environment variables set
- [ ] Monitoring configured
- [ ] Rollback plan ready
- [ ] Documentation complete

---

## Sign-off

- [ ] Design approved
- [ ] Implementation complete
- [ ] All tests passing
- [ ] Production deployment ready
- [ ] Monitoring confirmed

**Status**: In Progress
**Last Updated**: 2026-07-07
**Next Phase**: Phase 1 - Foundation
