# Certificate Generation Improvements - Implementation Plan

**Created:** 2026-01-17
**Updated:** 2026-01-17
**Scope:** Complete overhaul of certificate generation flow

## Phase 1 Status: COMPLETED

### Completed Backend Changes:
1. **Database Migration** (`database/migrations/002_template_usage_and_expiry.sql`)
   - Created `template_usage_history` table for tracking recent template usage
   - Created `v_template_usage_recent` view for efficient querying
   - Added `record_template_generation_usage()` trigger function
   - Created `verify_certificate_enhanced()` RPC function with full details

2. **Template Usage API** (`src/api/v1/templates.ts`)
   - `GET /api/v1/templates/recent-usage` - Get recently used templates
   - `POST /api/v1/templates/:templateId/save-progress` - Save in-progress design

3. **Certificate Generation** (`src/domains/certificates/service.ts`)
   - Added expiry type options: day, week, month, year, 5_years, never, custom
   - Added custom issue date support
   - Returns individual certificate details with download/preview URLs
   - ZIP download only provided for >10 certificates

4. **Verification API** (`src/domains/verification/service.ts`)
   - Enhanced response with full certificate and organization details
   - Generates signed URLs for logo and preview
   - Backwards compatible with legacy fields

---

## Table of Contents
1. [Database Changes](#1-database-changes)
2. [Backend API Changes](#2-backend-api-changes)
3. [Frontend Changes](#3-frontend-changes)
4. [Verification Page](#4-verification-page)

---

## 1. Database Changes

### 1.1 New Table: `template_usage_history`

Tracks templates used for generation and in-progress designs.

```sql
CREATE TABLE template_usage_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES certificate_templates(id) ON DELETE CASCADE,
  template_version_id UUID REFERENCES certificate_template_versions(id) ON DELETE SET NULL,

  -- Usage type
  usage_type TEXT NOT NULL CHECK (usage_type IN ('generated', 'in_progress')),

  -- For 'generated' type: link to generation job
  generation_job_id UUID REFERENCES certificate_generation_jobs(id) ON DELETE SET NULL,

  -- For 'in_progress' type: snapshot of current field state
  field_snapshot JSONB,

  -- Metadata
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  certificates_count INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_template_usage_org_user ON template_usage_history(organization_id, user_id, last_used_at DESC);
CREATE INDEX idx_template_usage_template ON template_usage_history(template_id);
CREATE UNIQUE INDEX ux_template_usage_in_progress ON template_usage_history(organization_id, user_id, template_id)
  WHERE usage_type = 'in_progress';
```

### 1.2 Update `certificate_template_fields` Table

Add custom label support for custom fields.

```sql
-- Already has 'label' column, but ensure custom fields can have user-defined labels
-- No schema change needed - just use existing 'label' column
```

### 1.3 Expiry Configuration (Already Supported)

The `certificates.expires_at` column already exists. We need to:
- Update generation logic to accept expiry options
- Add default calculation (1 year from generation)

---

## 2. Backend API Changes

### 2.1 New Endpoint: Get Recent Template Usage

**Endpoint:** `GET /api/v1/templates/recent-usage`

**Response:**
```json
{
  "recent_generated": [
    {
      "template_id": "uuid",
      "template_title": "string",
      "template_preview_url": "string",
      "last_generated_at": "timestamp",
      "certificates_count": 10,
      "category_name": "string",
      "subcategory_name": "string",
      "fields": [...] // Fields used during generation
    }
  ],
  "in_progress": [
    {
      "template_id": "uuid",
      "template_title": "string",
      "template_preview_url": "string",
      "last_modified_at": "timestamp",
      "fields": [...] // Current field state
    }
  ]
}
```

### 2.2 New Endpoint: Save In-Progress Design

**Endpoint:** `POST /api/v1/templates/:templateId/save-progress`

**Request:**
```json
{
  "field_snapshot": [...] // Current fields state
}
```

### 2.3 Update Certificate Generation Endpoint

**Endpoint:** `POST /api/v1/certificates/generate`

**Updated Request:**
```json
{
  "template_id": "uuid",
  "data": [...],
  "field_mappings": [...],
  "options": {
    "expiry_type": "day" | "week" | "month" | "year" | "5_years" | "never" | "custom",
    "custom_expiry_date": "2027-01-17", // Only if expiry_type = "custom"
    "issue_date": "2026-01-17" // Optional, defaults to NOW()
  }
}
```

**Updated Response:**
```json
{
  "job_id": "uuid",
  "status": "completed",
  "certificates": [
    {
      "id": "uuid",
      "certificate_number": "CERT-2026-001",
      "recipient_name": "John Doe",
      "recipient_email": "john@example.com",
      "issued_at": "timestamp",
      "expires_at": "timestamp",
      "download_url": "signed_url",
      "preview_url": "signed_url"
    }
  ],
  "zip_download_url": "signed_url", // Only if count > 10
  "total_count": 15
}
```

### 2.4 Update Verification Endpoint

**Endpoint:** `POST /api/v1/verification/verify`

**Enhanced Response:**
```json
{
  "valid": true,
  "result": "valid" | "expired" | "revoked" | "not_found",
  "message": "string",
  "certificate": {
    "id": "uuid",
    "certificate_number": "CERT-2026-001",
    "recipient_name": "John Doe",
    "category_name": "Technology",
    "subcategory_name": "Web Development",
    "issued_at": "timestamp",
    "expires_at": "timestamp",
    "status": "issued"
  },
  "organization": {
    "name": "Acme Corp",
    "logo_url": "signed_url",
    "website_url": "https://acme.com"
  },
  "preview_url": "signed_url"
}
```

### 2.5 New Endpoint: Get Individual Certificate Download

**Endpoint:** `GET /api/v1/certificates/:certificateId/download`

Returns signed URL for individual certificate download.

---

## 3. Frontend Changes

### 3.1 Step 1: Template Selection

#### 3.1.1 Component Structure
```
TemplateSelector/
├── SavedTemplates.tsx        # Existing uploaded templates (no field auto-load)
├── RecentUsedTemplates.tsx   # NEW: Recently used + in-progress
├── UploadNewTemplate.tsx     # Existing upload section
└── index.tsx                 # Main component with sections order
```

#### 3.1.2 Recent Used Templates Section
- Show carousel of recently generated templates
- Show "Continue Designing" badge for in-progress
- Display field count and last used date
- On select: Load template WITH fields

#### 3.1.3 Saved Templates Section
- Keep existing carousel
- On select: Load template WITHOUT previous fields (fresh start)

### 3.2 Step 2: Design Fields

#### 3.2.1 Figma-like Canvas Implementation
```
Canvas Changes:
- Remove fixed width/height constraints
- Implement infinite canvas with pan/zoom
- Remove grey border
- Support:
  - Mouse wheel zoom
  - Trackpad pinch zoom
  - Space+drag pan
  - Two-finger trackpad pan
  - Click+drag on empty space to pan
```

**Technical Approach:**
- Use CSS `transform: translate(x, y) scale(zoom)` for canvas positioning
- Track canvas offset (panX, panY) and zoom level
- Template positioned at (0, 0) within infinite canvas
- Viewport shows portion of canvas based on offset/zoom

#### 3.2.2 Multi-page PDF Support
```
Changes needed:
1. PDF parsing: Extract all pages, not just first
2. Canvas: Show page navigation (prev/next or thumbnails)
3. Fields: Associate fields with page_number
4. Backend: Store page_number in certificate_template_fields (already exists!)
5. Generation: Render fields on correct pages
```

**UI Changes:**
- Page navigation controls below canvas
- Page indicator: "Page 1 of 3"
- Thumbnail sidebar (optional)
- Fields panel shows fields grouped by page

#### 3.2.3 Custom Field Naming
```
Current: "Custom Text" field with generic label
New:
1. On add custom field, prompt for name
2. Show rename option in field properties
3. Use custom name in sample file headers
```

#### 3.2.4 QR Code Enhancements
```
QR Code Field Properties:
- Design style: Classic, Rounded, Dots, Squares
- Logo: Option to include org logo
- Size: Adjustable
- Error correction level: L, M, Q, H

Auto-generated fields shown when QR added:
- Certificate Number (auto)
- Issue Date (default: generation date, editable)
- Expiry Date (configurable in step 4)
```

### 3.3 Step 3: Import Data

#### 3.3.1 Data Preview Before Generate
```
Flow change:
1. Upload file → Parse data
2. Show DataPreview component (full table view)
3. Show column mapping below preview
4. "Continue to Generate" button (not auto-navigate)
```

#### 3.3.2 Manual Data Entry Option
```
ManualDataEntry component:
- Dynamic form based on template fields
- Add row button
- Delete row button
- Required fields: Name, Email (from sample file logic)
- Shows same fields as sample file
```

#### 3.3.3 Enhanced Sample File
```
Sample file columns:
1. Recipient Name (always)
2. Email (always)
3. Phone/WhatsApp (always)
4. [Template fields with custom names]
5. [Custom fields with user-defined names]

Example:
| Recipient Name | Email | Phone | Course Name | Start Date | Address |
| John Doe | john@email.com | +1234567890 | Web Dev | 2026-01-01 | 123 Main St |
```

### 3.4 Step 4: Generate & Export

#### 3.4.1 Remove Unnecessary Inputs
- ~~File name input~~ → Auto: `{category}_{subcategory}_{date}`
- ~~Include QR toggle~~ → Auto-detect from design

#### 3.4.2 Expiry Date Options
```
ExpiryDateSelector component:
- Radio options: 1 Day, 1 Week, 1 Month, 1 Year (default), 5 Years, Never, Custom
- Custom date picker (if Custom selected)
- Info message: "Default expiry: 1 year from issue date"
```

#### 3.4.3 Issue Date Option
```
IssueDateSelector component:
- Default: "Today (generation date)"
- Option: "Custom date" with date picker
```

#### 3.4.4 Certificate Table View
```
CertificateTable component:
- Columns: #, Recipient, Email, Certificate #, Issue Date, Expiry, Actions
- Actions: Download, Preview
- Pagination for large datasets
- Below table: "Download All (ZIP)" button
```

---

## 4. Verification Page

### 4.1 Page Structure (`/verify/[token]`)

```
VerificationPage/
├── Header (org logo, "Certificate Verification")
├── StatusBadge (Verified/Expired/Revoked)
├── CertificatePreview (image/PDF preview)
├── CertificateDetails
│   ├── Recipient Name
│   ├── Category / Subcategory
│   ├── Certificate Number
│   ├── Issue Date
│   ├── Expiry Date
│   └── Status
├── IssuerSection
│   ├── Organization Logo
│   ├── Organization Name
│   └── Website Link
└── Footer (powered by Authentix)
```

### 4.2 Status Handling
```
Status Display:
- valid: Green badge "Verified"
- expired: Yellow badge "Expired" + expiry date
- revoked: Red badge "Revoked" + reason if available
- not_found: Grey "Certificate Not Found"
```

---

## Implementation Order

### Phase 1: Backend Foundation
1. Create `template_usage_history` table migration
2. Add recent usage API endpoints
3. Update certificate generation with expiry options
4. Enhance verification API response

### Phase 2: Frontend - Step 1 & 2
1. Recent Used Templates section
2. Figma-like canvas (major)
3. Multi-page PDF support
4. Custom field naming
5. QR code preview

### Phase 3: Frontend - Step 3 & 4
1. Data preview before generate
2. Manual data entry
3. Enhanced sample file
4. Expiry date selector
5. Certificate table view

### Phase 4: Verification Page
1. Enhanced verification page UI

---

## Files to Modify

### Backend
- `src/domains/certificates/service.ts` - Expiry logic, response format
- `src/domains/certificates/types.ts` - New DTOs
- `src/domains/templates/service.ts` - Recent usage tracking
- `src/domains/templates/repository.ts` - Usage history queries
- `src/domains/verification/service.ts` - Enhanced response
- `src/api/v1/templates.ts` - New endpoints
- `src/api/v1/certificates.ts` - Updated endpoint

### Frontend
- `app/dashboard/org/[orgId]/generate-certificate/page.tsx`
- `app/dashboard/org/[orgId]/generate-certificate/components/TemplateSelector.tsx`
- `app/dashboard/org/[orgId]/generate-certificate/components/RecentUsedTemplates.tsx` (NEW)
- `app/dashboard/org/[orgId]/generate-certificate/components/CertificateCanvas.tsx` (Major rewrite)
- `app/dashboard/org/[orgId]/generate-certificate/components/DataSelector.tsx`
- `app/dashboard/org/[orgId]/generate-certificate/components/ManualDataEntry.tsx` (NEW)
- `app/dashboard/org/[orgId]/generate-certificate/components/ExportSection.tsx`
- `app/dashboard/org/[orgId]/generate-certificate/components/CertificateTable.tsx` (NEW)
- `app/dashboard/org/[orgId]/generate-certificate/components/ExpiryDateSelector.tsx` (NEW)
- `app/verify/[token]/page.tsx` (Major update)

---

## Questions for Clarification

1. **QR Code Designs**: Do you have specific QR code design styles in mind, or should we use a library like `qrcode.react` with customization options?

2. **Manual Entry Limit**: Is there a maximum number of rows for manual entry (e.g., 50 recipients)?

3. **In-Progress Auto-save**: How long should we keep in-progress designs before auto-cleanup?

4. **Verification Page**: Should this be a separate frontend app/route or part of the dashboard?
