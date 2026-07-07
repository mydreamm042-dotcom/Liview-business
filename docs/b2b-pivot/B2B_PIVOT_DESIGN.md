# MySTAR B2B Pivot - Design Document

## Executive Summary
Transform MySTAR from a B2C atmosphere analysis service to a B2B SaaS platform for business operators (bar, pub, cafe, event venue managers). Existing B2C functionality remains intact; new B2B features are activated only for BUSINESS-type rooms.

---

## 1. Architecture Overview

### 1.1 Core Concept
- **Room Types**: Add `PERSONAL` (existing B2C behavior) and `BUSINESS` (new B2B features)
- **User Roles**:
  - **Participant**: Scans QR, provides feedback (anonymous in PERSONAL, identified in BUSINESS)
  - **Operator**: Business owner who manages the room, views analytics, configures settings
  - **Admin**: Future consideration for multi-location management
- **Key Change**: Operator becomes the paying customer, not the participant

### 1.2 Feature Activation Matrix
```
Feature                 PERSONAL    BUSINESS
─────────────────────────────────────────
QR Entry                ✓           ✓
Anonymous Hearts        ✓           ✓
HOT Index              ✓           ✓
Satisfaction Ratings   ✓           ✓
Restraint Signals      ✓           ✓
Chat                   ✓           ✓
Results Screen         ✓           ✓ (Participant view)
─────────────────────────────────────────
Review Solicitation    ✗           ✓
Brand Customization    ✗           ✓
Operator Dashboard     ✗           ✓
Participation Funnel   ✗           ✓
Operation Report       ✗           ✓
Staff Shift Tracking   ✗           ✓
Event Timeline         ✗           ✓
Operator Results View  ✗           ✓
```

---

## 2. Database Schema Changes

### 2.1 New Tables

#### `room_configs` (B2B Room Configuration)
```sql
CREATE TABLE room_configs (
  id uuid PRIMARY KEY,
  room_id uuid NOT NULL UNIQUE REFERENCES rooms(id) ON DELETE CASCADE,
  room_type text NOT NULL DEFAULT 'PERSONAL' CHECK (room_type IN ('PERSONAL', 'BUSINESS')),
  store_name text,
  store_description text,
  logo_url text,
  hero_image_url text,
  primary_color text,
  secondary_color text,
  theme_name text,
  naver_review_url text,
  google_review_url text,
  kakao_review_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
```

#### `staff_shifts` (Employee Shift Tracking)
```sql
CREATE TABLE staff_shifts (
  id uuid PRIMARY KEY,
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  staff_name text NOT NULL,
  shift_start_at timestamptz NOT NULL,
  shift_end_at timestamptz,
  notes text,
  created_at timestamptz DEFAULT now(),
  created_by text NOT NULL
);
```

#### `operation_events` (Event Timeline)
```sql
CREATE TABLE operation_events (
  id uuid PRIMARY KEY,
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN (
    'staff_shift',
    'game_start',
    'music_change',
    'service_provided',
    'event_start',
    'custom_memo'
  )),
  title text NOT NULL,
  description text,
  metadata json,
  event_time timestamptz NOT NULL,
  created_at timestamptz DEFAULT now(),
  created_by text NOT NULL
);
```

#### `operator_sessions` (Operator Login Sessions)
```sql
CREATE TABLE operator_sessions (
  id uuid PRIMARY KEY,
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  operator_token text NOT NULL UNIQUE,
  operator_name text,
  logged_in_at timestamptz DEFAULT now(),
  logged_out_at timestamptz,
  ip_address text,
  user_agent text,
  created_at timestamptz DEFAULT now()
);
```

### 2.2 Schema Modifications

#### Add to `rooms` table:
```sql
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS room_type text DEFAULT 'PERSONAL' CHECK (room_type IN ('PERSONAL', 'BUSINESS'));
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS operator_session_id uuid REFERENCES operator_sessions(id) ON DELETE SET NULL;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS operator_name text;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS store_name text;
```

#### Add to `participants` table:
```sql
ALTER TABLE participants ADD COLUMN IF NOT EXISTS is_identified boolean DEFAULT false;
ALTER TABLE participants ADD COLUMN IF NOT EXISTS phone_number text;
ALTER TABLE participants ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;
```

---

## 3. API Endpoints Structure

### 3.1 Room Management
```
POST   /api/rooms                          Create room (existing, add room_type)
GET    /api/rooms/[code]                   Get room details (existing)
PATCH  /api/rooms/[code]                   Update room (existing)
POST   /api/rooms/[code]/config            Create/update room config (NEW)
GET    /api/rooms/[code]/config            Get room config (NEW)
```

### 3.2 Operator Management (NEW)
```
POST   /api/operator/login                 Login operator
GET    /api/operator/auth/verify           Verify operator token
POST   /api/operator/logout                Logout operator
POST   /api/operator/rooms/[code]/staff    Add staff shift (NEW)
GET    /api/operator/rooms/[code]/staff    Get staff shifts (NEW)
POST   /api/operator/rooms/[code]/events   Create operation event (NEW)
GET    /api/operator/rooms/[code]/events   Get event timeline (NEW)
```

### 3.3 Analytics & Reporting (NEW)
```
GET    /api/operator/rooms/[code]/dashboard         Get dashboard data
GET    /api/operator/rooms/[code]/funnel            Get participation funnel
GET    /api/operator/rooms/[code]/report            Get operation report
GET    /api/operator/rooms/[code]/participants      Get participant list (with tracking)
GET    /api/operator/rooms/[code]/analytics/hourly  Get hourly breakdown
```

### 3.4 Review Solicitation (NEW)
```
POST   /api/participant/[code]/review-click        Track review button click
POST   /api/participant/[code]/reviewed            Record that user left review
```

---

## 4. Component Structure

### 4.1 New Pages
```
src/app/operator/
  ├── login/                  # Operator login
  ├── dashboard/[code]/       # Main operator dashboard
  ├── settings/[code]/        # Room config & branding
  ├── staff/[code]/           # Staff shift management
  ├── events/[code]/          # Event timeline
  ├── analytics/[code]/       # Detailed analytics
  └── report/[code]/          # Operation report

src/app/participant/
  └── review/[code]/          # Review solicitation screen
```

### 4.2 Modified Pages
```
src/app/room/[code]/page.tsx
  - Add room type check
  - Show branding for BUSINESS rooms
  
src/app/room/[code]/result/page.tsx
  - Add operator-only view
  - Show extended analytics
  - Participant-only view: keep existing
```

### 4.3 New Components
```
src/components/operator/
  ├── DashboardCard.tsx
  ├── MetricGraph.tsx
  ├── FunnelVisualization.tsx
  ├── EventTimeline.tsx
  ├── StaffShiftManager.tsx
  ├── BrandingEditor.tsx
  └── ReviewSolicitation.tsx

src/components/shared/
  ├── BrandHeader.tsx        # Show for BUSINESS rooms
  └── RoomTypeIndicator.tsx
```

### 4.4 Hooks
```
src/hooks/useOperator.ts      # Operator session & auth
src/hooks/useDashboardData.ts # Real-time dashboard data
src/hooks/useAnalytics.ts     # Analytics calculations
```

---

## 5. Data Flow Diagrams

### 5.1 B2B Participant Flow
```
QR Scan
  ↓
Login (Anonymous/Named)
  ↓
Atmosphere Feedback
  ├─ Hearts
  ├─ Hot Taps
  ├─ Satisfaction
  └─ Warnings
  ↓
Chat (Optional)
  ↓
Results Screen
  ↓
[BUSINESS ONLY] Review Solicitation
  └─ Click → Opens review link
```

### 5.2 Operator Flow
```
Operator Login
  ↓
Dashboard
  ├─ Real-time metrics
  ├─ Participation funnel
  ├─ Event timeline
  └─ Staff shifts
  ↓
Room Settings
  ├─ Branding (logo, colors, images)
  └─ Review URLs
  ↓
Analytics
  ├─ Hourly breakdown
  ├─ Staff performance
  └─ Event correlation
  ↓
Reports & Export
```

---

## 6. Key Features Specifications

### 6.1 Room Branding (BUSINESS only)
- Store name, logo, hero image
- Primary/secondary theme colors
- Custom favicon
- Persists across all participant screens
- Fully optional (defaults to MySTAR branding if not set)

### 6.2 Review Solicitation (BUSINESS only)
- Triggered on results screen exit
- Shows: "Enjoying your experience? Please leave a review"
- Configurable URLs (Naver, Google, Kakao)
- Non-intrusive, single appearance per session
- Analytics: Track click-through rate

### 6.3 Operator Dashboard
- **Real-time Metrics**:
  - Current participants
  - Participation rate (by stage)
  - HOT index trend
  - Satisfaction trend (star average)
  - Chat activity
  - Heart/warning generation rate
  
- **Visualizations**:
  - Line charts (HOT, satisfaction over time)
  - Funnel chart (participation stages)
  - Timestamp breakdown (hourly grid)
  - Event timeline (with staff shifts overlaid)

### 6.4 Participation Funnel
Stages (B2B specific):
1. QR scan (unique device/IP)
2. Room entry (join)
3. Atmosphere feedback (any reaction)
4. Heart participation (sent at least 1 heart)
5. Chat participation (sent at least 1 message)
6. Results viewed (viewed result screen)

Analytics:
- Count at each stage
- Drop-off rate
- Funnel timeline (when each threshold was crossed)
- Per-stage duration

### 6.5 Operation Events (Timeline)
Event types:
- `staff_shift`: Staff member start/end
- `game_start`: Game/activity began
- `music_change`: DJ/music changed
- `service_provided`: Snacks/food served
- `event_start`: Special event started
- `custom_memo`: Operator memo

Metadata structure:
```json
{
  "staff_shift": {
    "staff_name": "string",
    "previous_staff": "string|null"
  },
  "game_start": {
    "game_name": "string"
  },
  "custom_memo": {
    "note": "string"
  }
}
```

### 6.6 Operation Report
**Calculated only from existing data**, never inferred:
- Average satisfaction (mean of all star ratings)
- Peak HOT time (timestamp with highest HOT count)
- Participation rate (participants / QR scans × 100)
- Total chat messages
- Total hearts given
- Total warnings (restraint signals)
- Duration: room creation → room end
- Peak concurrent participants (optional, if tracked)

---

## 7. Implementation Roadmap

### Phase 1: Foundation (Core B2B Structure)
- [ ] Add `room_type` to rooms table
- [ ] Create `room_configs` table
- [ ] Add operator session management
- [ ] Implement operator login/logout endpoints
- [ ] Add room type check in room creation flow

### Phase 2: Room Configuration
- [ ] Room settings page (operator-only)
- [ ] Branding editor UI
- [ ] Store branding display on participant views
- [ ] Review URL configuration

### Phase 3: Operator Dashboard
- [ ] Dashboard page structure
- [ ] Real-time data aggregation
- [ ] Metric cards (participant count, satisfaction, HOT)
- [ ] Real-time chart updates
- [ ] Participation funnel visualization

### Phase 4: Event Timeline & Analytics
- [ ] `staff_shifts` table
- [ ] `operation_events` table
- [ ] Event recording endpoints
- [ ] Event timeline UI
- [ ] Hourly breakdown analytics

### Phase 5: Participant Tracking
- [ ] Review solicitation modal
- [ ] Review URL integration
- [ ] Review engagement tracking
- [ ] Enhanced operation report

### Phase 6: Polish & Integration
- [ ] Permission & security model
- [ ] Operator-only views protection
- [ ] Data export/reporting
- [ ] Performance optimization
- [ ] Mobile optimization for operator views

---

## 8. Security & Permissions

### 8.1 Operator Authentication
- Token-based auth (similar to current session_token)
- Room-specific operator tokens
- Prevent unauthorized operator access
- Audit trail for operator actions

### 8.2 Data Access Control
- Participants see only their own data + aggregated results
- Operators see room-specific analytics only
- BUSINESS rooms: Operator data hidden from participants
- PERSONAL rooms: No operator features visible

### 8.3 RLS (Row Level Security) Updates
```sql
-- room_configs: Accessible to all
-- operator_sessions: Accessible to owner operator
-- operation_events: Readable by operator, writable by creator
-- staff_shifts: Same as operation_events
```

---

## 9. Database Migration Strategy

### 9.1 Backward Compatibility
- All existing PERSONAL rooms default to `room_type = 'PERSONAL'`
- No deletion or modification of existing tables
- New tables are purely additive
- No breaking changes to existing APIs

### 9.2 Migration Path
1. Add new columns to `rooms` table (with defaults)
2. Create new tables without affecting old data
3. Add feature flags for B2B features
4. Enable gradually per room

---

## 10. Future Extensibility

### 10.1 Planned (Not in MVP)
- [ ] Multi-location operator management
- [ ] Staff performance analytics
- [ ] POS system integration
- [ ] Reservation system integration
- [ ] Coupon/reward system
- [ ] AI-powered operation insights
- [ ] Aggregate reporting across locations

### 10.2 Potential Enhancements
- [ ] Real-time notifications for operators
- [ ] Mobile app for operators
- [ ] Advanced guest segmentation
- [ ] Predictive analytics
- [ ] Integration with review platforms
- [ ] Automated report generation

---

## 11. Success Metrics

### For Operators
- Dashboard adoption rate
- Average session duration
- Feature usage frequency
- Review solicitation click-through rate

### For Participants (BUSINESS)
- Participation rate improvements
- Review submission rate
- Return visit frequency

### Platform
- Zero regressions in PERSONAL room functionality
- API response time < 200ms for dashboard
- Real-time metrics lag < 3 seconds

---

## 12. Assumptions & Constraints

1. **Current B2C features unchanged**: All existing business logic preserved
2. **No user authentication initially**: Operator access via room code + token
3. **Data integrity**: No AI inference for missing data
4. **Scalability**: Real-time updates via polling (3s interval), not webhooks
5. **Analytics based on events**: No session reconstruction or heuristics
6. **Operator per room**: Single operator per room initially (multi-operator future)

---

## 13. Technical Stack Consistency
- **Framework**: Next.js 16 (existing)
- **Database**: Supabase PostgreSQL (existing)
- **UI**: Tailwind CSS + React components (existing)
- **Authentication**: Session tokens (extend pattern)
- **Real-time**: Polling with useEffect (existing pattern)

---

## Next Steps
1. Review and approve this design
2. Set up feature branch `feature/b2b-pivot`
3. Begin Phase 1 implementation (database schema)
4. Create sample room type pages
5. Build operator dashboard
