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

### ToolCode reference

Fixed enum, both in the Prisma schema (`ToolCode`) and `src/lib/tool-codes.ts`
— NOT admin-editable free text. `enabledTools` in `GET /api/student/profile`
and `GET /api/student/support-plan` only ever contains these exact strings.
Two tiers, deliberately separate:

**Granular tools** (gate an individual feature inside whichever mode is
already open):
`REMINDER_MODE`, `FOCUS_MODE`, `EXTRA_TIME_TRACKER`, `SIMPLIFIED_UI`,
`TEXT_TO_SPEECH`, `SPEECH_TO_TEXT`, `VISUAL_SCHEDULE`, `CALM_MODE`.

**Mode-level tools** (Phase 3 addition — gate whether one of the app's 4
top-level mode cards/screens appears at all, on the home/mode-selection
screen):
`DEAF_MODE`, `VISUAL_MODE`, `LEARNING_MODE`, `PHYSICAL_MODE`.

A mode's card should be hidden entirely if its code is absent from
`enabledTools`, mirroring how the 8 granular codes already gate individual
in-mode features.

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

Returns the calling student's own basic profile fields, their currently
enabled tools, and a set of ready-made **adaptation directives** for the app
to apply.

- **Auth required:** Bearer token, role = `student`.

**IMPORTANT — by design, this endpoint never returns `category`,
`condition`, or `supportLevel`.** Students are never shown their own
classification or support level anywhere in this platform (web or mobile) —
the level is meant to be reduced over time based on need, not carried around
as a label. `adaptationDirectives` (added in Phase 3) exists specifically so
the app never needs the raw classification to drive its UI/behavior: the
platform computes it server-side (see `src/lib/adaptation.ts`) from the
student's current approved plan's Assessment, and sends only the *already
decided* opaque values — font sizes, text styles, alert thresholds — never
the category/condition/level that produced them.

**Response `200 OK`**

```json
{
  "studentNumber": "441012345",
  "major": "علوم الحاسب",
  "academicStage": "السنة الثالثة",
  "phone": "+966500000001",
  "requestStatus": "approved",
  "verified": true,
  "enabledTools": [
    "REMINDER_MODE",
    "FOCUS_MODE",
    "EXTRA_TIME_TRACKER",
    "DEAF_MODE",
    "VISUAL_MODE",
    "LEARNING_MODE",
    "PHYSICAL_MODE"
  ],
  "adaptationDirectives": {
    "mode": {
      "deafMode": {
        "displayedTextStyle": "auto_summary_every_5min",
        "defaultFontSize": 18,
        "hardTermHandling": "mark_only",
        "postLectureOutput": "text_and_bullet_summary",
        "mentorAlert": "weekly_report"
      },
      "visualMode": {
        "imageDescriptionStyle": "structured_broken_into_elements",
        "readAloudSpeed": "minus_20_percent",
        "followUpQuestion": "want_more_detail",
        "mentorAlert": "weekly_report"
      },
      "learningMode": {
        "summarizeButtonOutput": "bulleted_one_point_per_idea",
        "simplifyButtonOutput": "full_easier_language_rephrase",
        "reviewQuestionsButtonOutput": "five_graduated",
        "defaultFontSize": 18,
        "mentorAlert": "weekly_report"
      },
      "physicalMode": {
        "voiceCommandHandling": "repeat_then_execute",
        "quickContactButtonSize": "large",
        "listeningDurationSeconds": 5,
        "tolerantOfStutter": false,
        "mentorAlert": "weekly_report"
      }
    },
    "categoryLayer": {
      "reducesNotifications": false,
      "hidesNonEssentialVisualElements": false,
      "maxOneInteractiveElementPerScreen": false,
      "calmColorPalette": false,
      "autoSummarizesEverywhere": true,
      "repeatsIdeasTwoWays": true,
      "ttsSupportEverywhere": true,
      "oneStepAtATime": false,
      "confirmAfterEveryStep": false,
      "dailyLifeExamplesInsteadOfDefinitions": false,
      "simplerUiLanguage": false,
      "autoRephrasing": false,
      "readyMadePhrasesForFacultyMessaging": [],
      "reassuringTone": false,
      "hidesFailureWording": false,
      "gentleAlternativePhrasing": false,
      "suppressesRepeatedAnnoyingAlerts": false
    }
  }
}
```

(The example above is for a student classified — server-side only — as
Learning Difficulties, medium support level; that's why `autoSummarizesEverywhere`
etc. are on and every `mode.*` block shows the medium-tier values. A student
with no approved plan yet gets the safe light-tier defaults for every mode
and an all-`false`/empty `categoryLayer`.)

| Field                 | Type                                                       | Notes                                             |
|-----------------------|-------------------------------------------------------------|----------------------------------------------------|
| studentNumber         | string                                                       |                                                      |
| major                 | string                                                       |                                                      |
| academicStage         | string                                                       |                                                      |
| phone                 | string                                                       |                                                      |
| requestStatus         | `"pending" \| "under_review" \| "approved" \| "rejected"`   |                                                      |
| verified              | boolean                                                      | domain-verified enrollment (see README)             |
| enabledTools          | `string[]`                                                   | tool codes from the fixed `ToolCode` enum, only from an **approved** plan; empty array if none. As of Phase 3 this includes 4 new **mode-level** codes (`DEAF_MODE`, `VISUAL_MODE`, `LEARNING_MODE`, `PHYSICAL_MODE`) alongside the original 8 granular tool codes — see "ToolCode reference" below. |
| adaptationDirectives  | `AdaptationDirectives` object (see below)                   | always present; light-tier defaults if no approved plan |

### `AdaptationDirectives` shape

```ts
interface AdaptationDirectives {
  mode: {
    deafMode: {
      displayedTextStyle: "continuous_punctuated" | "auto_summary_every_5min" | "short_sentences_summary_every_2min_highlight_hard_terms";
      defaultFontSize: 16 | 18 | 22;
      hardTermHandling: "none" | "mark_only" | "mark_and_simplified_explanation_on_tap";
      postLectureOutput: "full_text" | "text_and_bullet_summary" | "text_and_summary_and_auto_review_questions";
      mentorAlert: "none" | "weekly_report" | "immediate_if_3_consecutive_lectures_unopened";
    };
    visualMode: {
      imageDescriptionStyle: "one_concise_paragraph" | "structured_broken_into_elements" | "short_sequential_sentences_most_important_first";
      readAloudSpeed: "normal" | "minus_20_percent" | "minus_40_percent_auto_repeat_on_finish";
      followUpQuestion: "none" | "want_more_detail" | "clear_after_every_2_sentences";
      mentorAlert: "none" | "weekly_report" | "immediate_if_same_image_requested_more_than_3_times";
    };
    learningMode: {
      summarizeButtonOutput: "brief_paragraph" | "bulleted_one_point_per_idea" | "very_short_sentences_one_idea_per_line_with_icons";
      simplifyButtonOutput: "light_rephrase" | "full_easier_language_rephrase" | "max_simplification_daily_life_examples_idea_repeated_two_ways";
      reviewQuestionsButtonOutput: "three_analytical" | "five_graduated" | "five_easy_with_model_simplified_answers";
      defaultFontSize: 14 | 18 | 22;
      mentorAlert: "none" | "weekly_report" | "immediate_if_simplify_used_more_than_5_times_on_same_file";
    };
    physicalMode: {
      voiceCommandHandling: "execute_directly" | "repeat_then_execute" | "repeat_and_confirm_then_execute";
      quickContactButtonSize: "normal" | "large" | "extra_large_with_direct_home_screen_access";
      listeningDurationSeconds: 3 | 5 | 8;
      tolerantOfStutter: boolean; // true only at the intensive tier
      mentorAlert: "none" | "weekly_report" | "immediate_if_quick_contact_used_more_than_2_times_per_day";
    };
  };
  categoryLayer: {
    // Neurodevelopmental (autism/ADHD)
    reducesNotifications: boolean;
    hidesNonEssentialVisualElements: boolean;
    maxOneInteractiveElementPerScreen: boolean;
    calmColorPalette: boolean;
    // Learning difficulties
    autoSummarizesEverywhere: boolean;
    repeatsIdeasTwoWays: boolean;
    ttsSupportEverywhere: boolean;
    // Mild cognitive disabilities
    oneStepAtATime: boolean;
    confirmAfterEveryStep: boolean;
    dailyLifeExamplesInsteadOfDefinitions: boolean;
    // Communication & language disorders
    simplerUiLanguage: boolean;
    autoRephrasing: boolean;
    readyMadePhrasesForFacultyMessaging: string[]; // non-empty only for this category
    // Behavioral & emotional disorders
    reassuringTone: boolean;
    hidesFailureWording: boolean;
    gentleAlternativePhrasing: boolean;
    suppressesRepeatedAnnoyingAlerts: boolean;
  };
}
```

`mode.*` varies along the support-level axis only (light/medium/intensive —
one full set of values per mode, independent of category).
`categoryLayer` is additive and independent of level: exactly one category's
flags are `true` (the rest `false`/empty), applied on top of whichever
`mode.*` block the app is currently using. A student always has exactly one
category and one level server-side, but the app never learns which — it just
reads whichever flags are `true`.

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

## `GET /api/student/faculty-resources`

Returns the calling student's OWN faculty-uploaded custom files
(`FacultyResource`) — simplified slides, color/font-adjusted copies, extra
exercises, etc. that a faculty member has chosen to share with this
specific student in one of their courses. There is no way, via this or any
other endpoint, to learn whether ANY OTHER student has resources, or how
many — only your own list.

- **Auth required:** Bearer token, role = `student`.

**Response `200 OK`**

```json
{
  "resources": [
    {
      "id": "6d9f6c1a-2e4b-4a1f-9c3e-6a2b1f0d9e8a",
      "title": "شرائح مبسطة - المحاضرة 5",
      "category": "simplified_content",
      "note": "ركّزي على الجزء الثاني قبل الاختبار",
      "courseCode": "CS301",
      "uploadedAt": "2026-08-09T12:00:00.000Z",
      "faculty": { "email": "faculty@demo.shadow.sa" },
      "downloadUrl": "/api/student/faculty-resources/6d9f6c1a-2e4b-4a1f-9c3e-6a2b1f0d9e8a/download"
    }
  ]
}
```

| Field                | Type                                                                             | Notes |
|------------------------|-------------------------------------------------------------------------------|-------|
| resources               | array                                                                        | empty array if none — never an error |
| resources[].id           | string (uuid)                                                              | |
| resources[].title         | string                                                                    | |
| resources[].category       | `"simplified_content" \| "visual_adjustment" \| "extra_exercises" \| "other" \| null` | optional, set by the faculty member |
| resources[].note            | string \| null                                                          | optional |
| resources[].courseCode       | string                                                                 | |
| resources[].uploadedAt        | ISO 8601 string                                                      | |
| resources[].faculty             | `{ email: string }`                                                | the uploading faculty member's display info — never anything disability-related |
| resources[].downloadUrl          | string                                                            | relative path; `GET` it with the same Bearer token to receive the file bytes |

**Errors**

| Status | Body                                      | When                                |
|--------|----------------------------------------------|----------------------------------------|
| 401    | `{ "error": "غير مصرح" }`                   | missing/invalid/expired token           |
| 403    | `{ "error": "لا تملك صلاحية الوصول" }`      | role != student                         |
| 404    | `{ "error": "الملف الشخصي غير موجود" }`     | no StudentProfile for this user         |

## `GET /api/student/faculty-resources/:id/download`

Downloads one of the calling student's own faculty resources. Unencrypted
(this file class is stored as plaintext — see `docs/API.md`'s note on
`FacultyResource` not following Document's encryption pattern, a deliberate
product decision).

- **Auth required:** Bearer token, role = `student` — **or** the web
  NextAuth session cookie (this route is also used directly by the
  `/student/status` page's download link, which has no way to attach an
  `Authorization` header to a plain browser navigation). Either way the
  resource must belong to the caller's own `StudentProfile`.

**Response `200 OK`**: binary file body, `Content-Type` set to the
resource's stored MIME type, `Content-Disposition: inline`.

**Errors**

| Status | Body                                      | When                                                    |
|--------|----------------------------------------------|------------------------------------------------------------|
| 401    | `{ "error": "غير مصرح" }`                   | no valid Bearer token AND no valid web session              |
| 404    | `{ "error": "الملف الشخصي غير موجود" }`     | no StudentProfile for this user                              |
| 404    | `{ "error": "لم يتم العثور على الملف" }`    | no such resource id, it's deleted, **or it belongs to a different student** — deliberately the same response as "doesn't exist" in that last case, never confirming another student's resource id is real |

---

## `POST /api/events`

Batch-ingests usage events from the app for the calling student. Feeds the
specialist's usage-summary dashboard and (future) automated mentor alerts.
Accepts an **array** of events in one request — the app is expected to
buffer events client-side and flush them as a batch (every 60 seconds or
when a mode screen closes, whichever comes first), not call this once per
event.

Recommended event vocabulary from the mobile app (any string works — this
isn't schema-enforced — but the specialist dashboard and future alerting
logic key off these):

| `eventType`      | `payload` shape                          | When the app sends it                          |
|-------------------|--------------------------------------------|---------------------------------------------------|
| `mode_opened`     | `{ "mode": "deaf" \| "visual" \| "learning" \| "physical" }` | a top-level mode screen is opened   |
| `tool_used`       | `{ "mode": "...", "tool": "..." }`         | a feature/tool inside a mode is used              |
| `provider_error`  | `{ "provider": "deepgram" \| "gemini", "errorType": "..." }` | a Deepgram/Gemini call fails — type + timestamp only, **never** request/response content, transcripts, or any PII |

- **Auth required:** Bearer token, role = `student`.
- **Headers:** `Content-Type: application/json`.
- **Rate limit:** **20 requests per 60-second window, per authenticated
  user** (in-memory fixed window — see `src/lib/rate-limit.ts`; fine for
  this single-process deployment stage, would need a shared store like Redis
  behind multiple instances). Comfortably above the expected ~1 request/60s
  buffered-flush pattern, while still stopping a malfunctioning or
  loop-stuck client from flooding the server. Exceeding it returns `429`
  with a `Retry-After` header (seconds) and `X-RateLimit-Limit` /
  `X-RateLimit-Remaining` headers.

**Request body**

```json
{
  "events": [
    {
      "eventType": "mode_opened",
      "payload": { "mode": "deaf" },
      "occurredAt": "2026-08-01T10:14:30.000Z"
    },
    {
      "eventType": "tool_used",
      "payload": { "mode": "deaf", "tool": "TEXT_TO_SPEECH" },
      "occurredAt": "2026-08-01T10:15:00.000Z"
    },
    {
      "eventType": "provider_error",
      "payload": { "provider": "deepgram", "errorType": "connection_timeout" },
      "occurredAt": "2026-08-01T10:15:05.000Z"
    }
  ]
}
```

| Field              | Type                | Required | Notes                                      |
|---------------------|---------------------|----------|----------------------------------------------|
| events              | array, 1–200 items  | yes      | batch limit is 200 events per call            |
| events[].eventType  | string, non-empty   | yes      | free-form, app-defined event name (see table above) |
| events[].payload    | any JSON value       | no       | arbitrary structured detail for the event — never audio/image/PDF content |
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
| 429    | `{ "error": "عدد الطلبات كبير جداً، الرجاء المحاولة لاحقاً" }` | rate limit exceeded (20 req/60s per user) — check `Retry-After` |

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

## Voice-driven exam-taking (Phase 1, MCQ only)

**EXPLICIT, USER-CONFIRMED EXCEPTION** to this project's "no AI inside the
platform" rule — scoped only to AI-generated exam question drafting
(faculty-side, web-only, not documented here) and the TTS proxy below. See
`src/lib/ai.ts`'s top-of-file comment for the full explanation. Essay/
free-response questions are out of scope this round; every exam in this
API is MCQ-only.

An `Exam` is visible to a student only once it is **published**:
`availableAt` is set (not `null`) AND is `<= now`. A `null` `availableAt`
means the exam is still a draft; a future `availableAt` means it's
scheduled but not yet open. Both draft and scheduled/not-yet-open exams
behave identically to "doesn't exist" from the student-facing API below —
never distinguishable from a genuinely invalid id.

## `GET /api/exams/:id/questions`

Returns a published exam's questions and options for a student actually
enrolled in that exam's course. **`isCorrect` is never present anywhere in
this response** — verified by explicit field-by-field response shaping in
the route handler itself, not just a Prisma `select` clause.

- **Auth required:** Bearer token, role = `student`.
- **Path parameter:** `id` — the `Exam.id` (UUID).

**Access rule:** the calling student must have a real `FacultyCourseLink`
row for the exam's `facultyUserId` + `courseCode` — the same enrollment
proof used elsewhere in this API, not just "any student in the tenant."

**Response `200 OK`**

```json
{
  "exam": {
    "id": "b1f2c3d4-5e6f-7890-abcd-ef1234567890",
    "title": "اختبار الفصل الثالث",
    "courseCode": "CS301",
    "questions": [
      {
        "id": "11111111-1111-1111-1111-111111111111",
        "text": "ما هو التعقيد الزمني لخوارزمية البحث الثنائي؟",
        "type": "MCQ",
        "order": 0,
        "options": [
          { "id": "aaaaaaaa-0000-0000-0000-000000000001", "text": "O(n)", "order": 0 },
          { "id": "aaaaaaaa-0000-0000-0000-000000000002", "text": "O(log n)", "order": 1 },
          { "id": "aaaaaaaa-0000-0000-0000-000000000003", "text": "O(n^2)", "order": 2 },
          { "id": "aaaaaaaa-0000-0000-0000-000000000004", "text": "O(1)", "order": 3 }
        ]
      }
    ]
  }
}
```

| Field                         | Type     | Notes                                            |
|--------------------------------|----------|----------------------------------------------------|
| exam.id                         | string (uuid) |                                                |
| exam.title                       | string   |                                                   |
| exam.courseCode                   | string   |                                                   |
| exam.questions[].id                 | string (uuid) |                                              |
| exam.questions[].text                | string   |                                                |
| exam.questions[].type                 | `"MCQ"`  | the only value that exists in Phase 1              |
| exam.questions[].order                 | number   | display order, ascending                         |
| exam.questions[].options[].id            | string (uuid) |                                              |
| exam.questions[].options[].text           | string   |                                              |
| exam.questions[].options[].order           | number   | display order, ascending                   |

**Errors**

| Status | Body                                      | When                                                                 |
|--------|----------------------------------------------|---------------------------------------------------------------------|
| 401    | `{ "error": "غير مصرح" }`                   | missing/invalid/expired token                                        |
| 403    | `{ "error": "لا تملك صلاحية الوصول" }`      | role != student                                                      |
| 404    | `{ "error": "لم يتم العثور على الاختبار" }` | no such exam id, it's a draft/scheduled/soft-deleted exam, **or** the caller isn't enrolled in its course — deliberately the same response in every case |

---

## `POST /api/exams/:id/answers`

Records the calling student's answer to one question of a published exam,
optionally with a spoken voice-confirmation clip of the choice. Creates
the student's `ExamSubmission` for this exam lazily on their first answer
(`status: "in_progress"`) if one doesn't exist yet — there is no separate
"start exam" call. Calling again for a question already answered
overwrites that answer (upsert), so the app can let a student change their
mind before the exam is complete.

- **Auth required:** Bearer token, role = `student`.
- **Headers:** `Content-Type: multipart/form-data`.
- **Path parameter:** `id` — the `Exam.id` (UUID).

**Request body** — `multipart/form-data`:

| Field                    | Type          | Required | Notes                                                        |
|---------------------------|---------------|----------|-----------------------------------------------------------------|
| questionId                 | string (uuid) | yes      | must belong to this exam                                        |
| selectedOptionId             | string (uuid) | yes      | must belong to `questionId`                                    |
| voiceConfirmationAudio         | binary (audio) | no     | max 10MB; any audio MIME type — stored as-is, no transcoding      |

Example (curl):

```bash
curl -X POST https://<host>/api/exams/b1f2c3d4-5e6f-7890-abcd-ef1234567890/answers \
  -H "Authorization: Bearer <accessToken>" \
  -F "questionId=11111111-1111-1111-1111-111111111111" \
  -F "selectedOptionId=aaaaaaaa-0000-0000-0000-000000000002" \
  -F "voiceConfirmationAudio=@confirmation.webm;type=audio/webm"
```

**Response `201 Created`**

```json
{
  "ok": true,
  "answerId": "c2d3e4f5-6789-0abc-def1-234567890abc",
  "examSubmissionId": "d3e4f5a6-7890-1bcd-ef23-4567890abcde"
}
```

Side effects: a `submit_exam_answer` row is written to `AuditLog`.

**Storage note:** `voiceConfirmationAudio`, when present, is stored
**plaintext** in object storage (same pattern as `FacultyResource`, own
`{tenantId}/exam-answers/{examSubmissionId}/{answerId}.<ext>` prefix) —
NOT encrypted like `Document`. Judgment call: this is a spoken confirmation
of a multiple-choice answer choice, not a medical document, and carries no
more sensitivity than the `Answer` row itself (already plaintext in the
database).

**Errors**

| Status | Body                                                | When                                                                 |
|--------|--------------------------------------------------------|---------------------------------------------------------------------|
| 400    | `{ "error": "questionId و selectedOptionId مطلوبان" }` | missing/malformed required fields                                    |
| 400    | `{ "error": "بيانات غير صالحة" }`                       | malformed multipart body, or `voiceConfirmationAudio` present but not a file |
| 400    | `{ "error": "حجم الملف الصوتي يتجاوز الحد المسموح" }`   | audio file exceeds 10MB                                              |
| 401    | `{ "error": "غير مصرح" }`                               | missing/invalid/expired token                                        |
| 403    | `{ "error": "لا تملك صلاحية الوصول" }`                  | role != student                                                      |
| 404    | `{ "error": "لم يتم العثور على الاختبار" }`             | no such exam id, not published, or caller not enrolled in its course |
| 404    | `{ "error": "لم يتم العثور على السؤال" }`               | `questionId` doesn't belong to this exam                             |
| 404    | `{ "error": "لم يتم العثور على الخيار" }`               | `selectedOptionId` doesn't belong to `questionId`                    |

---

## `POST /api/tts/generate`

Server-side text-to-speech proxy for reading exam question/option text
aloud, for the voice-driven exam-taking feature. The Flutter app must never
call Gemini directly (that would require shipping the API key inside the
mobile binary) — it always calls this proxy instead, which holds the key
server-side only.

- **Auth required:** Bearer token, role = `student`.
- **Headers:** `Content-Type: application/json`.
- **Rate limit:** **30 requests per 60-second window, per authenticated
  user** (same in-memory fixed-window limiter as `/api/events`, see
  `src/lib/rate-limit.ts`). Higher than `/api/events`' 20/min because a
  student working through an exam may replay a question or option's audio
  several times in quick succession — this is a direct per-action UI
  trigger, not a buffered batch-flush call. Exceeding it returns `429` with
  a `Retry-After` header (seconds) and `X-RateLimit-Limit` /
  `X-RateLimit-Remaining` headers, same shape as `/api/events`.

**Request body**

```json
{ "text": "ما هو التعقيد الزمني لخوارزمية البحث الثنائي؟" }
```

| Field | Type                      | Required | Notes             |
|-------|---------------------------|----------|--------------------|
| text  | string, 1–2000 characters | yes      |                    |

**Response `200 OK`**: binary WAV audio body (`audio/wav`, 16-bit PCM mono,
24kHz).

| Header        | Value          |
|----------------|----------------|
| Content-Type    | `audio/wav`   |
| Cache-Control    | `no-store`   |

**Errors**

| Status | Body                                                        | When                                    |
|--------|------------------------------------------------------------------|--------------------------------------------|
| 400    | `{ "error": "بيانات غير صالحة" }`                                 | missing/empty/too-long `text`               |
| 401    | `{ "error": "غير مصرح" }`                                         | missing/invalid/expired token               |
| 403    | `{ "error": "لا تملك صلاحية الوصول" }`                            | role != student                             |
| 429    | `{ "error": "عدد الطلبات كبير جداً، الرجاء المحاولة لاحقاً" }`     | rate limit exceeded (30 req/60s per user)   |
| 502    | `{ "error": "تعذر توليد الصوت، حاول مرة أخرى" }`                  | the upstream Gemini TTS call failed          |

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
acknowledge/resolve, plan revision, admin CSV export, audit log viewing,
every faculty-side FacultyResource route (`/api/faculty/resources`,
`/api/faculty/resources/:id`, `/api/faculty/resources/:id/download` — a
faculty member uploads/manages files from the web `/faculty/students` page
only; there is no faculty mobile app surface), and every faculty-side exam
route (`/api/faculty/exams`, `/api/faculty/exams/:id`,
`/api/faculty/exams/generate` — a faculty member creates/edits/publishes
exams from the web `/faculty/exams` pages only; the student-facing side of
the exam feature, `GET /api/exams/:id/questions` and
`POST /api/exams/:id/answers` above, are the only exam endpoints the
mobile app calls). Ask before assuming any of these will be added to the
mobile surface — none were in scope for the app.
