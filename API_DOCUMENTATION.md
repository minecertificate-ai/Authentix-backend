# Authentix Backend API Documentation

**Base URL**: `https://api.authentix.io/api/v1`  
**Version**: 1.0.0  
**Authentication**: JWT Bearer Token (except public endpoints)

---

## Authentication

Most endpoints require authentication via JWT token:

```
Authorization: Bearer <supabase_jwt_token>
```

The backend extracts `company_id` from the JWT token. **Never send `company_id` in requests** - it's automatically derived from your authentication.

---

## Templates API

### List Templates
```http
GET /api/v1/templates
```

**Query Parameters:**
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 20, max: 100)
- `status` (optional): Filter by status (`draft`, `active`, `archived`)
- `sort_by` (optional): Field to sort by
- `sort_order` (optional): `asc` or `desc` (default: `desc`)

**Response:**
```json
{
  "success": true,
  "data": {
    "items": [...],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 50,
      "total_pages": 3
    }
  }
}
```

### Get Template
```http
GET /api/v1/templates/:id
```

### Create Template
```http
POST /api/v1/templates
Content-Type: multipart/form-data
```

**Form Data:**
- `file`: Template file (PDF, PNG, JPEG)
- `metadata`: JSON string with:
  ```json
  {
    "name": "Template Name",
    "description": "Optional description",
    "file_type": "pdf",
    "certificate_category": "Education",
    "certificate_subcategory": "Course Completion",
    "width": 800,
    "height": 600,
    "fields": []
  }
  ```

### Update Template
```http
PUT /api/v1/templates/:id
```

**Body:**
```json
{
  "name": "Updated Name",
  "status": "active",
  "fields": [...]
}
```

### Delete Template
```http
DELETE /api/v1/templates/:id
```

### Get Preview URL
```http
GET /api/v1/templates/:id/preview
```

Returns signed URL (expires in 1 hour).

---

## Certificates API

### Generate Certificates
```http
POST /api/v1/certificates/generate
```

**Body:**
```json
{
  "template_id": "uuid",
  "data": [
    { "recipient_name": "John Doe", "course_name": "React Basics", ... },
    { "recipient_name": "Jane Smith", "course_name": "React Basics", ... }
  ],
  "field_mappings": [
    { "fieldId": "field-1", "columnName": "recipient_name" },
    { "fieldId": "field-2", "columnName": "course_name" }
  ],
  "options": {
    "includeQR": true,
    "fileName": "certificates"
  }
}
```

**Response (Synchronous, ≤50 certs):**
```json
{
  "success": true,
  "data": {
    "status": "completed",
    "download_url": "https://...",
    "total_certificates": 25,
    "certificates": [...]
  }
}
```

**Response (Asynchronous, >50 certs):**
```json
{
  "success": true,
  "data": {
    "job_id": "uuid",
    "status": "pending",
    "estimated_completion": "2026-01-10T12:05:00Z"
  }
}
```

---

## Imports API

### List Import Jobs
```http
GET /api/v1/import-jobs
```

**Query Parameters:** Same as templates list

### Get Import Job
```http
GET /api/v1/import-jobs/:id
```

### Create Import Job
```http
POST /api/v1/import-jobs
Content-Type: multipart/form-data
```

**Form Data:**
- `file`: CSV or Excel file
- `metadata`: JSON string with:
  ```json
  {
    "file_name": "recipients.xlsx",
    "certificate_category": "Education",
    "certificate_subcategory": "Course Completion",
    "template_id": "uuid",
    "reusable": true
  }
  ```

### Get Import Data Rows
```http
GET /api/v1/import-jobs/:id/data
```

**Query Parameters:**
- `page` (optional)
- `limit` (optional, default: 100)

### Download Import File
```http
GET /api/v1/import-jobs/:id/download
```

Returns signed URL for file download.

---

## Billing API

### List Invoices
```http
GET /api/v1/billing/invoices
```

**Query Parameters:** Same as templates list

### Get Invoice
```http
GET /api/v1/billing/invoices/:id
```

Returns invoice with line items.

### Get Billing Overview
```http
GET /api/v1/billing/overview
```

**Response:**
```json
{
  "success": true,
  "data": {
    "current_period": {
      "certificate_count": 150,
      "estimated_amount": 1850.00
    },
    "recent_invoices": [...],
    "total_outstanding": 2500.00
  }
}
```

---

## Verification API (Public)

### Verify Certificate
```http
POST /api/v1/verification/verify
```

**Body:**
```json
{
  "token": "verification-token-from-qr-code"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "valid": true,
    "certificate_id": "uuid",
    "recipient_name": "John Doe",
    "course_name": "React Basics",
    "issued_at": "2026-01-01T00:00:00Z",
    "company_name": "Acme Corp",
    "result": "valid",
    "message": "This certificate is valid and authentic"
  }
}
```

---

## Webhooks API

### Razorpay Webhook
```http
POST /api/v1/webhooks/razorpay
X-Razorpay-Signature: <hmac-signature>
```

**Note:** This endpoint is called by Razorpay, not by your frontend.

**Response:**
```json
{
  "success": true,
  "data": {
    "received": true,
    "stored": true,
    "processed": true,
    "event_db_id": "uuid",
    "event_type": "invoice.paid"
  }
}
```

---

## Error Responses

All errors follow this format:

```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "Resource not found",
    "details": {}
  },
  "meta": {
    "request_id": "uuid",
    "timestamp": "2026-01-10T12:00:00Z"
  }
}
```

### Error Codes

- `UNAUTHORIZED` (401): Missing/invalid JWT
- `FORBIDDEN` (403): Insufficient permissions
- `NOT_FOUND` (404): Resource not found
- `VALIDATION_ERROR` (400): Invalid request data
- `CONFLICT` (409): Resource conflict
- `INTERNAL_ERROR` (500): Server error

---

**Last Updated**: 2026-01-10
