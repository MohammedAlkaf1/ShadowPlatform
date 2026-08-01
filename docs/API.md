# Shadow Platform — Mobile API Reference

This documents the `/api/*` endpoints exposed by the Next.js backend for the
Flutter mobile app. All endpoints are versionless (single version today) and
return `application/json` unless noted otherwise. All request/response
bodies below are exact shapes — every field shown is really returned; no
field is omitted for brevity unless marked `// ...`.

## Authentication

Two authentication mechanisms exist in this codebase and **only one applies
to this document**:

- The web app (`/login`) uses a NextAuth session cookie. **Not relevant
  here.**
- The mobile app uses a standalone **Bearer JWT**, issued by
  `POST /api/auth/login` and refreshed by `POST /api/auth/refresh`. This is
  what every endpoint below expects.

Send the access token on every authenticated request:

```
Authorization: Bearer <accessToken>
```

Access tokens expire after **1 hour**. Refresh tokens expire after **30
days**. There is no rotation of the refresh token itself on refresh — the
same refresh token can be used repeatedly until it expires or the app calls
login again.

Tokens carry `userId`, `tenantId`, and `role` as claims, verified
server-side against the database on every request (to catch a
deactivated/deleted account immediately, even with an unexpired token).
`tenantId` is never accepted from the client anywhere in this API — it
always comes from the verified token.

### Roles

`student` | `faculty` | `specialist` | `admin`. Each endpoint below states
which role(s) it accepts. A request from a wrong role gets `403`. A request
with no/invalid/expired token gets `401`.

---

## `POST /api/auth/login`

Exchanges email + password for a token pair.

- **Auth required:** none.
- **Headers:** `Content-Type: application/json`.

**Request body**

```json
{
  "email": "student@demo.shadow.sa",
  "password": "Password123!"
}
```

| Field    | Type   | Required | Notes                        |
|----------|--------|----------|-------------------------------|
| email    | string | yes      | must be a valid email format  |
| password | string | yes      | non-empty                     |

**Response `200 OK`**

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiJ9...",
  "user": {
    "id": "6498dd65-9789-4dd3-a139-363a350c8373",
    "email": "student@demo.shadow.sa",
    "role": "student"
  }
}
```

**Errors**

| Status | Body                                                              | When                                             |
|--------|-------------------------------------------------------------------|---------------------------------------------------|
| 400    | `{ "error": "بيانات غير صالحة" }`                                   | body fails schema validation                      |
| 401    | `{ "error": "البريد الإلكتروني أو كلمة المرور غير صحيحة" }`         | no matching active user, or wrong password         |

Note: the same generic message is used for "no such user" and "wrong
password" — this is intentional, to avoid confirming whether an email is
registered.

---

## `POST /api/auth/refresh`

Exchanges a valid, non-expired refresh token for a new access token.

- **Auth required:** none (the refresh token itself is the credential).
- **Headers:** `Content-Type: application/json`.

**Request body**

```json
{ "refreshToken": "eyJhbGciOiJIUzI1NiJ9..." }
```

**Response `200 OK`**

```json
{ "accessToken": "eyJhbGciOiJIUzI1NiJ9..." }
```

**Errors**

| Status | Body                                              | When                                                              |
|--------|----------------------------------------------------|--------------------------------------------------------------------|
| 400    | `{ "error": "بيانات غير صالحة" }`                    | missing/malformed body                                              |
| 401    | `{ "error": "رمز التحديث غير صالح" }`                | token verifies but isn't a refresh-type token                       |
| 401    | `{ "error": "الحساب غير نشط" }`                      | user no longer exists / is deactivated / soft-deleted               |
| 401    | `{ "error": "رمز التحديث غير صالح أو منتهي" }`       | signature invalid or token expired                                  |

---

## `GET /api/student/profile`

Returns the calling student's own basic profile fields and their currently
enabled tools.

- **Auth required:** Bearer token, role = `student`.

**IMPORTANT — by design, this endpoint never returns `category`,
`condition`, or `supportLevel`.** Students are never shown their own
classification or support level anywhere in this platform (web or mobile) —
the level is meant to be reduced over time based on need, not carried around
as a label. If the app genuinely needs richer state to render UI, that
should be a deliberate, separately-approved product decision, not something
this endpoint quietly starts returning.

**Response `200 OK`**

```json
{
  "studentNumber": "441012345",
  "major": "علوم الحاسب",
  "academicStage": "السنة الثالثة",
  "phone": "+966500000001",
  "requestStatus": "approved",
  "verified": true,
  "enabledTools": ["REMINDER_MODE", "FOCUS_MODE", "EXTRA_TIME_TRACKER"]
}
```

| Field         | Type                                                             | Notes                                             |
|---------------|-------------------------------------------------------------------|----------------------------------------------------|
| studentNumber | string                                                             |                                                      |
| major         | string                                                             |                                                      |
| academicStage | string                                                             |                                                      |
| phone         | string                                                             |                                                      |
| requestStatus | `"pending" \| "under_review" \| "approved" \| "rejected"`         |                                                      |
| verified      | boolean                                                            | domain-verified enrollment (see README)             |
| enabledTools  | `string[]`                                                        | tool codes from the fixed `ToolCode` enum, only from an **approved** plan; empty array if none |

**Errors**

| Status | Body                                          | When                                    |
|--------|------------------------------------------------|-------------------------------------------|
| 401    | `{ "error": "غير مصرح" }`                       | missing/invalid/expired token             |
| 403    | `{ "error": "لا تملك صلاحية الوصول" }`          | token is valid but role != student        |
| 404    | `{ "error": "الملف الشخصي غير موجود" }`         | no StudentProfile for this user           |

---

## `GET /api/student/support-plan`

Returns the calling student's current approved support plan status and
enabled tools (with any tool-specific config).

- **Auth required:** Bearer token, role = `student`.

Same withholding rule as `/api/student/profile` — no category, condition,
support level, or specialist notes, ever.

**Response `200 OK` — student has an approved plan**

```json
{
  "hasApprovedPlan": true,
  "approvedAt": "2026-08-01T17:57:45.289Z",
  "expiresAt": "2027-01-28T17:57:45.289Z",
  "enabledTools": [
    { "toolCode": "REMINDER_MODE", "config": null },
    { "toolCode": "FOCUS_MODE", "config": null },
    { "toolCode": "EXTRA_TIME_TRACKER", "config": null }
  ]
}
```

**Response `200 OK` — no approved plan yet**

```json
{ "hasApprovedPlan": false, "enabledTools": [] }
```

| Field           | Type                        | Notes                                                        |
|-----------------|------------------------------|----------------------------------------------------------------|
| hasApprovedPlan | boolean                      |                                                                  |
| approvedAt      | ISO 8601 string \| null      | only present when `hasApprovedPlan: true`                       |
| expiresAt       | ISO 8601 string \| null      | only present when `hasApprovedPlan: true`                       |
| enabledTools    | array of `{toolCode, config}`| `config` is an arbitrary JSON object set by the specialist, or `null`; only tools with `enabled: true` are included |

**Errors**

| Status | Body                                      | When                                |
|--------|----------------------------------------------|----------------------------------------|
| 401    | `{ "error": "غير مصرح" }`                   | missing/invalid/expired token           |
| 403    | `{ "error": "لا تملك صلاحية الوصول" }`      | role != student                         |
| 404    | `{ "error": "الملف الشخصي غير موجود" }`     | no StudentProfile for this user         |

---

## `POST /api/events`

Batch-ingests usage events from the app for the calling student. Feeds the
specialist's usage-summary dashboard and (future) automated mentor alerts.

- **Auth required:** Bearer token, role = `student`.
- **Headers:** `Content-Type: application/json`.

**Request body**

```json
{
  "events": [
    {
      "eventType": "focus_mode_session_completed",
      "payload": { "durationSeconds": 1500 },
      "occurredAt": "2026-08-01T10:15:00.000Z"
    },
    {
      "eventType": "app_open",
      "occurredAt": "2026-08-01T10:14:30.000Z"
    }
  ]
}
```

| Field              | Type                | Required | Notes                                      |
|---------------------|---------------------|----------|----------------------------------------------|
| events              | array, 1–200 items  | yes      | batch limit is 200 events per call            |
| events[].eventType  | string, non-empty   | yes      | free-form, app-defined event name             |
| events[].payload    | any JSON value       | no       | arbitrary structured detail for the event      |
| events[].occurredAt | ISO 8601 datetime    | yes      | must be a valid ISO datetime string            |

**Response `200 OK`**

```json
{ "ok": true, "received": 2 }
```

**Errors**

| Status | Body                                      | When                                |
|--------|----------------------------------------------|----------------------------------------|
| 400    | `{ "error": "بيانات غير صالحة" }`           | body fails schema validation            |
| 401    | `{ "error": "غير مصرح" }`                   | missing/invalid/expired token           |
| 403    | `{ "error": "لا تملك صلاحية الوصول" }`      | role != student                         |
| 404    | `{ "error": "الملف الشخصي غير موجود" }`     | no StudentProfile for this user         |

---

## `POST /api/documents/upload`

Uploads a medical PDF document. The file is validated, encrypted server-side
(AES-256-GCM) before it ever touches storage, written to MinIO/S3, and only
metadata (never the binary) is stored in the database. No client-side
presigned URLs exist — every byte goes through this endpoint so nothing
bypasses the audit trail.

- **Auth required:** Bearer token, role = `student`.
- **Headers:** `Content-Type: multipart/form-data` (set automatically by
  your HTTP client when sending a `FormData` body — do not set it manually
  with a hardcoded boundary).

**Request body** — `multipart/form-data` with a single field:

| Field | Type          | Required | Constraints                                             |
|-------|---------------|----------|-----------------------------------------------------------|
| file  | binary (PDF)  | yes      | MIME type must be exactly `application/pdf`; max size is `MAX_UPLOAD_SIZE_BYTES` (default 15 MB, see `.env.example`) |

Example (curl):

```bash
curl -X POST https://<host>/api/documents/upload \
  -H "Authorization: Bearer <accessToken>" \
  -F "file=@report.pdf;type=application/pdf"
```

**Response `201 Created`**

```json
{ "ok": true, "documentId": "3b09ed31-55cb-4891-9a20-bf685067c112" }
```

Side effects: if this is the student's first document, `requestStatus`
transitions from `pending` to `under_review`. An `upload_document` row is
written to `AuditLog`.

**Errors**

| Status | Body                                                | When                                    |
|--------|--------------------------------------------------------|--------------------------------------------|
| 400    | `{ "error": "الرجاء إرفاق ملف" }`                       | no `file` field / not a file                |
| 400    | `{ "error": "يُسمح فقط برفع ملفات PDF" }`               | MIME type isn't `application/pdf`           |
| 400    | `{ "error": "حجم الملف يتجاوز الحد المسموح" }`          | file exceeds `MAX_UPLOAD_SIZE_BYTES`         |
| 401    | `{ "error": "غير مصرح" }`                               | missing/invalid/expired token                |
| 403    | `{ "error": "لا تملك صلاحية الوصول" }`                  | role != student                              |
| 404    | `{ "error": "الملف الشخصي غير موجود" }`                 | no StudentProfile for this user              |

---

## `GET /api/documents/:id`

Downloads and decrypts a specific document. **Specialist-only** (or admin).
Streams the decrypted bytes directly in the response body — the decrypted
copy is never written to disk or cached anywhere server-side.

- **Auth required:** Bearer token, role = `specialist` or `admin`.
- **Path parameter:** `id` — the `Document.id` (UUID).

**Access rule:** the document's owning student must be in the same tenant
as the caller, AND (unless the caller is `admin`) an admin must have
manually created a `SpecialistAssignment` linking this specialist to that
student. There is no automatic assignment.

**Response `200 OK`**

Binary PDF body.

| Header             | Value                                                  |
|---------------------|----------------------------------------------------------|
| Content-Type        | the document's stored MIME type (`application/pdf`)      |
| Content-Disposition | `inline; filename="<original filename, URL-encoded>"`    |
| Cache-Control       | `no-store`                                                |

Side effects: writes a `view_document` row to `AuditLog` (always, on
success). If the document's status was `pending`, it flips to `reviewed`.

**Errors**

| Status | Body                                                     | When                                                                 |
|--------|---------------------------------------------------------------|-------------------------------------------------------------------------|
| 401    | `{ "error": "غير مصرح" }`                                    | missing/invalid/expired token — **not** audit-logged (no known actor)    |
| 403    | `{ "error": "لا تملك صلاحية الوصول" }`                       | authenticated but role isn't specialist/admin — audit-logged as `view_document_denied` |
| 403    | `{ "error": "لا تملك صلاحية الوصول لهذا المستند" }`          | authenticated specialist, but NOT assigned to this document's student — audit-logged as `view_document_denied` |
| 404    | `{ "error": "المستند غير موجود" }`                           | no such document id (or it was soft-deleted) — audit-logged as `view_document_denied` |

**Every access attempt to this endpoint is audit-logged**, successful or
denied, with one exception: a request with no valid token at all has no
known actor to attribute a log row to, so it isn't logged (`AuditLog.actorUserId`
is a required field in the schema).

---

## Error shape

Every error response from every endpoint above follows the same shape:

```json
{ "error": "<human-readable Arabic message>" }
```

There is currently no machine-readable error `code` field — the Flutter app
should key off the HTTP status code, not the message text, for control
flow. Message text may change; status codes won't.

## Not yet implemented as mobile endpoints

The following exist as **web-only** features today (NextAuth session, not
Bearer JWT) and have no mobile API equivalent yet: alert
acknowledge/resolve, plan revision, admin CSV export, audit log viewing.
Ask before assuming any of these will be added to the mobile surface — none
were in the Phase 1/2 scope for the app.
