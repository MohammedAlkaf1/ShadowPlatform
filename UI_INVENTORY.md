# Shadow Platform (منصة شادو) — UI Inventory

Read-only visual/structural inventory of all pages under `src/app/`, produced for a Figma redesign brief. Everything below is drawn directly from the current code (as of this session) and from real authenticated screenshots taken with Playwright against the local dev server. Screenshots live in `ui-inventory-screenshots/` at the project root, named after the route.

## How to read this document

- **Allowed roles** are copied verbatim from each page's own `requireRole(...)` call in `src/lib/session.ts`'s convention — not guessed from the URL.
- **AppShell** is the shared chrome (sidebar + header) rendered by every authenticated page, described once below instead of per page.
- Tailwind classes are grepped directly from the page/panel file; any raw hex/arbitrary-color or non-token Tailwind palette class is flagged explicitly as an inconsistency.
- Arabic strings are quoted verbatim from `messages/ar.json`.

---

## Shared shell: AppShell

File: `src/components/layout/app-shell.tsx`, `src/components/layout/nav-links.tsx`, `src/components/layout/nav-items.ts`, `src/components/layout/brand-mark.tsx`, `src/components/layout/sign-out-button.tsx`, `src/components/i18n/language-switcher.tsx`, `src/components/theme/theme-toggle.tsx`.

Every authenticated page.tsx (not layout.tsx — batch 5 moved this to page level) calls `<AppShell navItems={...} role={...} userEmail={...} tenantName={...} title={...} subtitle={...}>`. Structure, top to bottom / start to end:

- **`<aside>` sidebar** (`bg-sidebar text-sidebar-foreground`, fixed `md:w-[272px]`, sticky on desktop):
  1. Top block: `BrandIcon` (42px rounded SVG icon) + tenant name (`tenantName`, e.g. "جامعة الرياض التجريبية"), bottom-bordered.
  2. `NavLinks` — vertical nav list, one row per `NavItem` (see below for the per-role item sets). Active route = subtle `bg-sidebar-accent` highlight + small filled dot; inactive = transparent dot.
  3. Bottom block: user-info card only (`bg-sidebar-accent/40`, rounded 16px) — viewer's role label (bold) + email (`dir="ltr"` inline span). No interactive controls here.
- **Header** (`bg-background`, bottom border, `min-h-[76px]`):
  1. `BrandWordmark` (horizontal logo SVG) + vertical divider.
  2. Page `title` (bold, `text-lg`/`sm:text-xl`) and `subtitle` (`text-muted-foreground`, small) — flex-1, fills the middle.
  3. `LanguageSwitcher`, `ThemeToggle`, `SignOutButton` — in that order, end-aligned.
- **`<main>`** (`bg-background`, `px-4 py-6 sm:px-8 sm:py-8`) — page content.

Nav item sets (`src/components/layout/nav-items.ts`, one function per section, translated via `Nav.<section>`):
- **Admin**: لوحة التحكم (`/admin/stats`) · سجل التدقيق (`/admin/audit-log`) · تعيين مختص (`/admin/users`). Note: `/admin/reports` exists but has **no nav entry** — reachable only by direct URL/link.
- **Faculty**: لوحة التحكم (`/faculty/students`) · رفع ملف لطالب (`/faculty/upload`) · الاختبارات (`/faculty/exams`) · مصطلحات المحاضرة (`/faculty/keyterms`).
- **Specialist**: لوحة التحكم (`/specialist/queue`) · التنبيهات (`/specialist/alerts`).
- **Student**: لوحتي (`/student/status`) · رفع وثيقة (`/student/upload`).

An admin browsing another role's URL (every protected page's `requireRole` allows an admin bypass) sees that **section's** nav, not the admin nav — deliberate, per the code comment.

**EchoCard** (`src/components/ui/echo-card.tsx`): a decorative offset translucent-fill layer behind exactly one hero card per dashboard-style screen (navy tint in light mode, cream tint in dark mode, 24px corners, insets 18px top/start, -9px end, -11px bottom). Used once per screen only.

---

# Public pages

## `/` — `src/app/page.tsx`
No UI of its own. Server component: reads session via `getRequestContext()`, redirects unauthenticated users to `/login`, and authenticated users to their role's home (`student→/student/status`, `faculty→/faculty/students`, `specialist→/specialist/queue`, `admin→/admin/stats`). No screenshot possible/meaningful (pure redirect, 307 observed).

## `/login` — `src/app/login/page.tsx`
**Role**: none (public; middleware's `PUBLIC_PATHS` includes `/login`).

**Structure** (client component, wrapped in `Suspense`):
- Two-pane full-height flex row (`flex min-h-screen w-full flex-col md:flex-row`).
- **Left pane** (flex-1): `ThemeToggle` (absolute top-end) → `BrandWordmark` → `<h1>` "تسجيل الدخول" → subtitle paragraph → form: `Label`+`Input` (email, `dir="ltr"`), `Label`+`Input` (password, `dir="ltr"`), inline error `<p>` (`text-destructive`), submit `Button` (`variant="accent" size="cta"`, full width, rounded-16px) → "نسيت كلمة المرور؟" plain text (no link — no reset flow exists) → "ليس لديك حساب؟ سجّل كطالب جديد" link to `/register`.
- **Right pane** (`bg-sidebar`, fixed `md:w-[540px]`): "حسابات تجريبية" heading + subtitle, then 4 demo-account buttons (student/faculty/specialist/admin), each a `bg-sidebar-accent/40` rounded-18px card showing role name + colored dot + name/email (`dir="ltr"`) + description. Clicking a card only fills the email field (`fillDemoEmail`) and shows a `toast.info` — it never bypasses real `signIn()`.

**Components**: `Button`, `Input`, `Label`, `ThemeToggle`, `BrandWordmark`. No `Card` used on this page (the two panes are plain divs).

**Colors/style flags**: demo-account dot colors are raw Tailwind palette classes, not semantic tokens: `bg-emerald-500` (student), `bg-sky-500` (faculty), `bg-violet-500` (specialist), `bg-primary` (admin — the only one on-token). Also uses inline arbitrary box-shadow values on the inputs: `shadow-[0_2px_4px_rgba(30,42,58,0.06)] dark:shadow-[0_2px_6px_rgba(0,0,0,0.3)]` (hardcoded rgba, not a token).

**States**: `loading` disables submit and swaps label to "جاري الدخول..."; invalid credentials show "البريد الإلكتروني أو كلمة المرور غير صحيحة" (`Login.errorInvalidCredentials`).

**Navigation**: links out to `/register`. No inbound nav item (entry point).

**Screenshot**: `ui-inventory-screenshots/login.png` — captured successfully.

## `/register` — `src/app/register/page.tsx`
**Role**: none (public).

**Structure**: centered single `Card` (`max-w-lg`) on a `bg-secondary` full-height background. `CardHeader` (centered): title "سجّل كطالب جديد" (`text-primary`), subtitle "أنشئ حسابك للتقديم على خدمات الدعم". `CardContent`: form in a 2-col grid (`sm:grid-cols-2`) — full-name (col-span-2), email (col-span-2, `dir="ltr"`), password (col-span-2, `dir="ltr"`), student number, phone (`dir="ltr"`), major, academic stage — inline error paragraph, submit `Button` (default variant, full width). Below: "لديك حساب بالفعل؟ تسجيل الدخول" link to `/login` (`text-accent`).

**Components**: `Card`/`CardHeader`/`CardTitle`/`CardDescription`/`CardContent`, `Button`, `Input`, `Label`.

**Colors/style flags**: none non-token; straightforward `bg-secondary`, `text-primary`, `text-destructive`, `text-accent` usage.

**States**: `loading` → "جاري التسجيل..."; server-action error surfaces `result.error` or falls back to "حدث خطأ أثناء التسجيل".

**Navigation**: linked from `/login`'s "سجّل كطالب جديد"; links back to `/login`.

**Screenshot**: `ui-inventory-screenshots/register.png` — captured successfully (empty form, no session).

## `/unauthorized` — `src/app/unauthorized/page.tsx`
**Role**: none directly, but only reachable while **authenticated** — `/unauthorized` is not in middleware's `PUBLIC_PATHS`, so an unauthenticated visit redirects to `/login` first (confirmed: it screenshots as the login page for a signed-out session). It is reached when a logged-in user of one role hits another role's route prefix.

**Structure**: centered column (`bg-secondary`, `py-24`): `<h1>` "غير مصرح بالوصول" (`text-primary`) → message paragraph (`text-muted-foreground`, max-w-md) — "لا تملك الصلاحية اللازمة لعرض هذه الصفحة. إذا كنت تعتقد أن هذا خطأ، تواصل مع مسؤول النظام." → a `<Link href="/">` styled via `buttonVariants()` directly (not through `Button`'s `render` prop — documented codebase convention), label "العودة للصفحة الرئيسية".

**Components**: `buttonVariants` only (no `Button`/`Card` imports).

**Screenshot**: `ui-inventory-screenshots/unauthorized.png` — captured correctly by visiting `/admin/stats` as the `student` demo account (redirected to `/unauthorized` as expected).

---

# Student pages (`requireRole("student")`)

## `/student/status` — `src/app/student/status/page.tsx`
**Role**: `student` only.

**Structure** (inside `AppShell` title "لوحتي" / subtitle "حالة طلبك، والأدوات المفعّلة، وكل ملف رفعته أو وصلك"):
1. Hero row (`flex sm:flex-row sm:items-stretch`): `EchoCard`-wrapped `Card` (rounded-24px) — tag "الحالة الحالية", title "حالة طلبك", a status `Badge` (color varies, see below), description, and (if `!verified`) "حسابك بانتظار التحقق...". Beside it, conditionally (only if an approved plan exists), a plain stat `Card` showing "الأدوات المفعّلة" count.
2. `Card` "الأدوات المفعّلة في التطبيق" — "آخر تحديث لخطتك: <date>" note, then a 2-col grid of enabled-tool list items (`CheckCircle2` icon, tool name + description) or empty state "لا توجد أدوات مفعّلة حالياً. سيتم تفعيلها بعد اعتماد خطة الدعم الخاصة بك."
3. `Card` "ملفاتي (<count>)" with subtitle "الوثائق التي رفعتها والملفات التي شاركها أساتذتك معك" — a GET filter form (`select` "كل الملفات"/"وثائق رفعتها"/"ملفات من أستاذ" + submit) and a `Table` (columns: الملف, المصدر, التاريخ, الحالة, فتح). Rows merge the student's own `Document` uploads and faculty-shared `FacultyResource` rows, sorted by date desc; faculty rows may show a "جديد" `Badge` if uploaded within the last 3 days, and a download link; the student's own uploads have no download action (`downloadHref: null` — no such route exists for students).
4. Hidden-note footer paragraph (small dot + muted text) reiterating that students never see their classification/category/support level/specialist notes/medical report contents.

**Components**: `Card`/`CardHeader`/`CardTitle`/`CardContent`, `Table` family, `Badge`, `EchoCard`. Icons: `CheckCircle2`, `Download`, `FileText`.

**Colors/style flags — inconsistency**: `STATUS_TONE` map uses **raw Tailwind palette colors instead of semantic tokens** for the "approved" status: `"bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-400"` (student/status/page.tsx:17). The other three statuses correctly use tokens (`bg-muted text-muted-foreground`, `bg-accent/15 text-accent`, `bg-destructive/15 text-destructive`).

**States**: empty tools → "لا توجد أدوات مفعّلة حالياً..."; empty files → "لا توجد ملفات بعد" (no filter) or "لا توجد ملفات مطابقة لهذا الفلتر" (filtered).

**Navigation**: nav item "لوحتي". No outbound page links besides file download hrefs (external API routes) and the GET filter form (self).

**Screenshot**: `ui-inventory-screenshots/student-status.png` — captured with real demo data (58 files, a request status badge, several enabled tools).

## `/student/upload` — `src/app/student/upload/page.tsx` + `src/app/student/upload/upload-form.tsx`
**Role**: `student` only.

**Structure** (title "رفع وثيقة" / subtitle "PDF فقط — تُرسل مباشرة لأخصائي الدعم المُعيَّن لك، ولا يراها أستاذك."):
- `UploadForm` (client): a `flex lg:flex-row` layout — `EchoCard`-wrapped hero `Card` (`bg-primary`, rounded-24px, centered text, `text-primary-foreground`): `UploadCloud` icon, "ارفع وثيقتك الطبية أو التقييمية" title, description, "اختر ملفاً" `Button` (`variant="accent" size="cta"`, rounded-full) that triggers the hidden file input; selected filename shown as a small pill. Beside it, a `Card` "بيانات الوثيقة" containing the actual `<input type=file accept="application/pdf">` + `Label` + submit `Button` (default, full width, "رفع المستند"/"جاري الرفع...").
- Hidden-note footer: "وثيقتك تُرسل للأخصائي المُعيَّن لك فقط..."

**Components**: `EchoCard`, `Card`/`CardHeader`/`CardTitle`/`CardContent`, `Button`, `Input`, `Label`.

**States**: `loading` → "جاري الرفع..."; success → `toast.success` "تم رفع المستند بنجاح" + form reset; failure → `toast.error` with server error or "تعذر رفع الملف".

**Navigation**: nav item "رفع وثيقة". No outbound links.

**Screenshot**: `ui-inventory-screenshots/student-upload.png` — captured, empty form (pre-submission) state.

---

# Faculty pages

## `/faculty/students` — `src/app/faculty/students/page.tsx`
**Role**: `requireRole("faculty", "admin")`.

**Structure** (title "طلابي" / subtitle "قائمة الطلاب المسجّلين في مقرراتك والتسهيلات المعتمدة لهم فقط"):
1. Hero row: `EchoCard`-wrapped `Card` — tag "مقرراتك", title "الطلاب في مقرراتك", big number = distinct student count, description. Side column: 3 plain stat `Card`s — "المقررات" count, "الملفات التي رفعتها" count, "طلاب لديهم تسهيلات" count.
2. `Card` "القائمة (<count>)" with an optional GET course-filter (`<select>` + submit button styled by hand, not `buttonVariants`) shown only if >1 course. `Table` columns: المقرر, الرقم الجامعي, الطالب, التسهيلات المعتمدة, and (faculty only) الملفات المخصصة. Accommodations render as `Badge`s per key/value pair or "لا توجد تسهيلات مسجّلة"; the files column is an outline `Button`-styled `Link` "إدارة الملفات" to `/faculty/upload?link=<id>`.
3. Hidden-note footer re: faculty never seeing medical reports/diagnosis/classification/support level/specialist notes.

**Components**: `Card`, `Table`, `Badge`, `EchoCard`, `buttonVariants` (via `Link`, not `Button`).

**States**: empty roster → "لا يوجد طلاب مرتبطون بمقرراتك حالياً" / filtered-empty → "لا يوجد طلاب في هذا المقرر".

**Navigation**: nav item "لوحة التحكم" (faculty section's home). Links to `/faculty/upload?link=<id>` per row.

**Screenshot**: `ui-inventory-screenshots/faculty-students.png` — captured with real data (2 courses, CS301/BUS101, 2 students).

## `/faculty/upload` — `src/app/faculty/upload/page.tsx` + `src/app/faculty/upload/upload-panel.tsx`
**Role**: `faculty` only (deliberately, no admin bypass — matches the underlying API's own access rule).

**Structure** (title "رفع ملف لطالب"):
- `FacultyUploadPanel` (client), `flex lg:flex-row`: `EchoCard`-wrapped hero `Card` (`bg-primary`, same visual pattern as student/upload's hero) with "اختر ملفاً" trigger. Beside it, `Card` "بيانات الملف": `Select` (student+course), file `Input` (accept pdf/pptx/docx/png), title `Input`, note `Textarea`, submit + (when replacing) cancel `Button`s. Below the form, inside the same card: "الملفات المرفوعة سابقاً" — a `<ul>` list of existing `FacultyResource` rows, each with title/date and 3 icon buttons (`Download` via `render` prop on an `<a>`, `RefreshCw` "replace", `Trash2` "delete" in `text-destructive`).
- Hidden-note footer.

**Components**: `EchoCard`, `Card`, `Button` (including `icon-sm` + `ghost` variants and the `render` prop pattern for the download link), `Input`, `Label`, `Textarea`, `Select` family.

**States**: `links.length === 0` → whole panel replaced by a single `Card` "لا يوجد طلاب مرتبطون بمقرراتك بعد."; list loading → "جاري التحميل..."; empty list → "لا توجد ملفات مرفوعة لهذا الطالب بعد"; various `toast` success/error messages per action (upload/replace/delete).

**Navigation**: nav item "رفع ملف لطالب"; also reachable via `?link=<id>` from `/faculty/students`' "إدارة الملفات" links.

**Screenshot**: `ui-inventory-screenshots/faculty-upload.png` — captured with a pre-selected link and 57 existing resources listed.

## `/faculty/exams` — `src/app/faculty/exams/page.tsx`
**Role**: `faculty` only.

**Structure** (title "الاختبارات"):
1. Right-aligned "اختبار جديد" `Link`-as-button (`variant="accent" size="cta"`, rounded-full, `Plus` icon) → `/faculty/exams/new`.
2. If no course links: `Card` "لا يوجد طلاب مرتبطون بمقرراتك بعد."; otherwise `Card` "اختباراتي" containing a `<ul>` of exam rows (each a full-row `Link` to `/faculty/exams/:id`), showing title, course code, question count, source (AI/manual), and a status `Badge` (`outline`="مسودة" / `secondary`="مجدوَل" / `default`="منشور", computed by module-level `statusOf()`).

**Components**: `Card`, `Badge`, `buttonVariants` (Link-as-button pattern). Icons: `FileQuestion`, `Plus`.

**States**: no course links vs. course links but zero exams ("لم تُنشئ أي اختبار بعد.") are two distinct empty states.

**Navigation**: nav item "الاختبارات". Links to `/faculty/exams/new` and `/faculty/exams/:id`.

**Screenshot**: `ui-inventory-screenshots/faculty-exams.png` — captured, 3 real exams listed (all "منشور").

## `/faculty/exams/new` — `src/app/faculty/exams/new/page.tsx` + `new-exam-panel.tsx`
**Role**: `faculty` only.

**Structure** (title "إنشاء اختبار جديد"):
- `NewExamPanel` (client), 3 internal modes:
  - **`choose`** (initial): 2-col grid of clickable `Card`s ("إنشاء يدوي" with `PencilLine` icon, "إنشاء بمساعدة الذكاء الاصطناعي" with `Sparkles` icon), each `role="button"` with keyboard handling.
  - **`manual`/`ai`** (after picking): `Card` with exam title `Input` + course `Select`; if AI mode, an additional dashed-border block with PDF file input, question-count number input, language `Select` (عربي/English), "توليد الأسئلة" outline `Button`, and a live status line while generating (cycles through 3 stage labels on a timer, `role="status" aria-live="polite"`). Below: `Card` "الأسئلة" — per-question editable blocks (question text `Input`, per-option `Input`+`Checkbox` "الإجابة الصحيحة", add/remove option/question buttons, `Trash2` delete). Below that: `Card` with a single "إظهار النتيجة للطلاب بعد التسليم" `Checkbox`+description. Footer: "حفظ كمسودة" (outline) + "نشر الاختبار" (`variant="accent"`) buttons.

**Components**: `Card`, `Button`, `Input`, `Label`, `Select` family, `Checkbox`. Icons: `PencilLine`, `Sparkles`, `Plus`, `Trash2`, `UploadCloud`.

**States**: `courseCodes.length === 0` → single `Card` "لا يوجد طلاب مرتبطون بمقرراتك بعد."; `generating` → button label "جاري التوليد... قد يستغرق دقيقة" + animated stage text; validation errors via `toast.error` (missing title/course/questions/each question needing ≥2 options with exactly one marked correct).

**Navigation**: reached only from "اختبار جديد" on `/faculty/exams`. On save/publish, `router.push("/faculty/exams")`.

**Screenshot**: `ui-inventory-screenshots/faculty-exams-new.png` — captured in the initial "choose" state.

## `/faculty/exams/[id]` — `src/app/faculty/exams/[id]/page.tsx` + `publish-button.tsx` + `show-results-toggle.tsx`
**Role**: `faculty` only; further scoped to `exam.facultyUserId === ctx.userId` (else `notFound()` — never 403, to avoid confirming existence of exams owned by others).

**Structure** (title = exam title, subtitle = "المقرر: <code>"):
1. `Card` header row: status `Badge` + "تاريخ الإنشاء <date>" on the start side; on the end side, "النتائج" `Link`-button (`variant="secondary"`, `BarChart3` icon) to `.../results`, and (only if still a draft) `PublishButton` (`variant="accent"`).
2. `Card` containing `ShowResultsToggle` — a single `Checkbox` "إظهار النتيجة للطلاب بعد التسليم" that PUTs the exam immediately on change.
3. `Card` "الأسئلة" — each question numbered, listed with all its options; the correct option gets a filled dot (`bg-primary`) + bold text, incorrect options get a hollow dot (`bg-muted-foreground/30`) + muted text.

**Components**: `Card`, `Badge`, `buttonVariants`, `Checkbox` (inside the toggle component). Icon: `BarChart3`.

**Navigation**: reached from `/faculty/exams`' row links. Links onward to `/faculty/exams/:id/results`.

**Screenshot**: `ui-inventory-screenshots/faculty-exams-id.png` — captured using the real seeded exam "اختبار قصير — تجربة الاختبار الصوتي" (CS301, published, 2 questions).

## `/faculty/exams/[id]/results` — `src/app/faculty/exams/[id]/results/page.tsx`
**Role**: `faculty` only, same ownership rule as the exam detail page.

**Structure** (title "النتائج", subtitle = exam title):
- "رجوع للاختبار" back-link (`ArrowRight` icon, `rtl:rotate-180`) to `/faculty/exams/:id`.
- `Card` "نتائج الطلاب" → `Table` (الطالب [name+email], وقت التسليم, النتيجة, الحالة). Score cell shows `<correct>/<total> (<pct>%)`, or "غير متوفرة (تسليم قديم)" for legacy completed submissions with no stored score, or an em-dash for in-progress. Status `Badge`: `default`="مكتمل" / `secondary`="قيد التنفيذ".

**Components**: `Card`, `Badge`, `Table` family. Icon: `ArrowRight`.

**States**: `submissions.length === 0` → "لم يقدّم أي طالب هذا الاختبار بعد."

**Navigation**: reached from the exam detail page's "النتائج" button. Links back to the exam detail page.

**Screenshot**: `ui-inventory-screenshots/faculty-exams-id-results.png` — captured with one real submission (2/2, 100%).

## `/faculty/keyterms` — `src/app/faculty/keyterms/page.tsx` + `keyterms-panel.tsx`
**Role**: `faculty` only.

**Structure** (title "مصطلحات المحاضرة"):
- `KeytermsPanel` (client), 4 stacked `Card`s:
  1. "اختر المقرر" — a `Select`.
  2. "استخراج مصطلحات من سلايدات" (with `Sparkles` icon in the title) — chapter-title `Input`, PDF file `Input`, "استخراج المصطلحات" outline `Button`.
  3. "مراجعة واعتماد[ — <chapter>]" — manual-term `Input`+"إضافة" button, then draft terms rendered as removable pill chips (`TermChip`: term text `dir="ltr"` + source `Badge` + `X` remove button), and (once draft non-empty) an "اعتماد N مصطلح" `variant="accent"` button.
  4. "المعجم المعتمد — <course>" — an `Accordion` (`multiple`, all sections open by default) grouped by chapter title, each panel listing that chapter's approved terms as the same `TermChip` pills (removable here too, hitting a DELETE endpoint).

**Components**: `Card`, `Button`, `Input`, `Label`, `Select` family, `Badge`, `Accordion`/`AccordionItem`/`AccordionTrigger`/`AccordionPanel`. Icons: `Sparkles`, `Plus`, `UploadCloud`, `X`.

**States**: `courseCodes.length === 0` → single `Card` "لا يوجد طلاب مرتبطون بمقرراتك بعد."; draft empty → "لا توجد مصطلحات بالمسودة بعد..."; saved list loading → "جاري التحميل..."; saved list empty → "لا توجد مصطلحات معتمدة لهذا المقرر بعد."; various toasts (extract failure, duplicate term, all-extracted-terms-already-saved info, save success/failure).

**Navigation**: nav item "مصطلحات المحاضرة".

**Screenshot**: `ui-inventory-screenshots/faculty-keyterms.png` — captured with the real, **pre-existing** BUS101 glossary (chapters "CHAPTER 2 Components in Blockchain Application" and "غير مصنّف") fully expanded and visible — confirmed in the DB query below to be untouched.

---

# Specialist pages

## `/specialist/queue` — `src/app/specialist/queue/page.tsx`
**Role**: `requireRole("specialist", "admin")`.

**Structure** (title "قائمة المراجعة" / subtitle "الطلاب المُحالون إليك من قِبل مسؤول النظام"):
1. Hero row: `EchoCard`-wrapped `Card` — tag "بحاجة لاهتمامك", big number = count of assigned students with an open alert or no assessment yet, description, and a `Sparkline` of weekly assessments (12-week window). Side column: 3 plain stat `Card`s — "إجمالي المعيّنين", "خطط معتمدة", "خطط بحاجة لمراجعة".
2. `Card` "الطلاب (<count>)" — GET level-filter (`<select>`+button) plus, only if a genuinely un-assessed assignee exists, "ابدأ المراجعة" `Link`-button (`variant="accent"`) to that student's review screen. `Table` columns: الطالب, الفئة, مستوى الدعم, آخر تقييم, حالة الخطة, تنبيهات مفتوحة (a `destructive` `Badge` with `AlertTriangle` icon when >0), إجراءات (two outline `Link`-buttons: "التفاصيل" → `/specialist/students/:id`, "مراجعة" → `.../review`).
3. Hidden-note footer re: specialists only seeing explicitly assigned students.

**Components**: `Card`, `Table`, `Badge`, `EchoCard`, `Sparkline`, `buttonVariants`. Icon: `AlertTriangle`.

**States**: empty (no filter) → "لا يوجد طلاب محالون إليك حالياً"; empty (filtered) → "لا يوجد طلاب في هذا المستوى".

**Navigation**: nav item "لوحة التحكم" (specialist section home). Links to `/specialist/students/:id` and `/specialist/students/:id/review`.

**Screenshot**: `ui-inventory-screenshots/specialist-queue.png` — captured with 3 real assigned students.

## `/specialist/alerts` — `src/app/specialist/alerts/page.tsx` + `alert-row-actions.tsx`
**Role**: `requireRole("specialist", "admin")`.

**Structure** (title "تنبيهات المتابعة"):
- Single `Card` "التنبيهات (<count>)" → `Table` (الخطورة, الطالب, النوع, الرسالة, الحالة, إجراءات). Severity `Badge` colored via a local `SEVERITY_TONE` map (see flag below). Actions column (`AlertRowActions`, client): "إقرار" outline button (only while `status==="open"`), "إغلاق التنبيه" toggles an inline `Textarea` + "تأكيد الإغلاق" button; once resolved, shows plain muted text "تم الإغلاق" instead of buttons.

**Components**: `Card`, `Table`, `Badge`, `Button`, `Textarea`.

**Colors/style flags**: `SEVERITY_TONE` (alerts/page.tsx:12-16) mixes token-based and non-token classes consistently on-token (`bg-destructive/15 text-destructive`, `bg-accent/15 text-accent`, `bg-muted text-muted-foreground`) — no raw hex here, but worth noting this is a second ad hoc severity/status color map (see also `STATUS_TONE` in student/status and `SEVERITY_TONE` duplication pattern) rather than a single shared badge-tone utility.

**States**: empty → "لا توجد تنبيهات حالياً".

**Navigation**: nav item "التنبيهات". No outbound page links (row actions are server actions, not navigation).

**Screenshot**: `ui-inventory-screenshots/specialist-alerts.png` — captured with 7 real alerts (6 open, 1 acknowledged/closed).

## `/specialist/students/[id]` — `src/app/specialist/students/[id]/page.tsx`
**Role**: `requireRole("specialist", "admin")` + `assertSpecialistAssigned(ctx, studentProfileId)` (throws/404s if this specialist isn't the assigned one; admin bypasses).

**Structure** (title "ملف الطالب", subtitle = "<name> — <student number>"), inside `mx-auto max-w-4xl`:
1. Header row: name/email/student-number-major-stage block on the start side; "مراجعة الوثيقة" `Link`-button (default variant) to `.../review` on the end side.
2. `Card` "المستندات المرفوعة (<count>)" → `Table` (الملف [with `FileText` icon], تاريخ الرفع, الحالة, تنزيل [outline button-link to `/api/documents/:id`]).
3. `Card` "سجل التقييمات (<count>)" → `divide-y` list of assessment entries (category — condition, support level, notes, timestamp).
4. `Card` "خطط الدعم (<count>)" → `divide-y` list of plan rows (date + status `Badge`).
5. 2-col grid (`lg:grid-cols-2`): `Card` "سجل مراجعات مستوى الدعم (<count>)" and `Card` "ملخص استخدام التطبيق" (event-type counts as `divide-y` rows with a `Badge` count each).

**Components**: `Card`, `Table`, `Badge`, `buttonVariants`.

**States**: each of the 5 sections has its own empty-state line ("لا توجد مستندات مرفوعة", "لا توجد تقييمات بعد", "لا توجد خطط بعد", "لا توجد مراجعات مسجّلة", "لا توجد بيانات استخدام بعد").

**Navigation**: reached from `/specialist/queue`'s "التفاصيل" link. Links onward to `.../review`.

**Screenshot**: `ui-inventory-screenshots/specialist-students-id.png` — captured for student أحمد محمد (56 documents, 1 assessment, 1 plan, usage summary present).

## `/specialist/students/[id]/review` — `src/app/specialist/students/[id]/review/page.tsx` + `review-form.tsx`
**Role**: `requireRole("specialist", "admin")` + `assertSpecialistAssigned`.

**Structure** (title "مراجعة وثيقة", subtitle = student name), inside `mx-auto max-w-5xl`:
1. Header row: name/email block; "السجل الكامل" outline `Link`-button to `/specialist/students/:id`.
2. Two-column row (`lg:flex-row`): `EchoCard`-wrapped `Card` "الوثائق" (flex-[1.7]) — a fixed-height dashed-border placeholder box "معاينة الوثيقة تُعرض هنا من التخزين الآمن" (no real PDF preview is implemented), then up to 5 most-recent documents as a `divide-y` list with "فتح" outline buttons. Beside it, `Card` "التصنيف ومستوى الدعم" (subtitle "يظهر لك وحدك كأخصائي دعم مُعيَّن لهذه الطالبة.") containing `ReviewForm`.
3. `ReviewForm` (client) — combined classification + plan flow in one screen:
   - If already classified and not reclassifying: a summary block (`bg-secondary/40`) with "إعادة التصنيف" button.
   - Else: classify form — category `Select`, condition `Select` (depends on category), support-level radio-style cards (custom `<input type=radio>`, not the `Checkbox` component), notes `Textarea`, "حفظ التصنيف" submit.
   - Once classified: plan section — plan-status `Badge`; if approved, a locked notice + all 8 tool `Checkbox`es disabled; else editable single-column tool checklist (`TOOL_CODES`), "حفظ الأدوات" outline button, and either "اعتمد خطة الدعم" (`variant="accent"`) or "حفظ الخطة" (`variant="accent"`, if no plan row yet) plus "أعدها للطالب" outline button. If approved, a "مراجعة مستوى الدعم" disclosure revealing a new-level `Select` + reason `Textarea` + "حفظ المراجعة" button.

**Components**: `Card`, `EchoCard`, `Button`, `Checkbox`, `Label`, `Textarea`, `Badge`, `Select` family, `buttonVariants`. Icon: `FileText`.

**States**: `documents.length === 0` → "لا توجد وثائق مرفوعة بعد"; various toasts per action.

**Navigation**: reached from `/specialist/queue`'s "مراجعة"/"ابدأ المراجعة" links and `/specialist/students/:id`'s "مراجعة الوثيقة" link. Links back to `/specialist/students/:id`. (`/specialist/students/:id/assess` and `.../plan` are now pure redirects to this route — see below.)

**Screenshot**: `ui-inventory-screenshots/specialist-students-id-review.png` — captured for the same student, showing an approved plan with several tools enabled and locked.

### `/specialist/students/[id]/assess` and `/specialist/students/[id]/plan` — redirects only
`src/app/specialist/students/[id]/assess/page.tsx` and `.../plan/page.tsx` contain **no UI** — each is a one-line `redirect()` to `.../review`, kept only so old bookmarks/deep links don't 404. Not screenshotted (nothing renders; they 307 straight through to the review page, which is already captured above).

---

# Admin pages (`requireRole("admin")`)

## `/admin/stats` — `src/app/admin/stats/page.tsx` + `category-chart.tsx`
**Role**: `admin` only.

**Structure** (title "إحصائيات الجامعة" / subtitle "نظرة عامة على الطلاب والطلبات على مستوى الجامعة"):
1. Hero row: `EchoCard`-wrapped `Card` — tag "نظرة عامة على المنصة", title "إجمالي الطلاب", big number, description, `Sparkline` (12-week registrations). Side column: 3 stat `Card`s — "قيد الانتظار", "قيد المراجعة", "بحاجة لتعيين مختص".
2. `Card` "توزيع الطلاب حسب الفئة" → `CategoryChart` (Recharts `BarChart`, `dir="ltr"`, bars in `var(--chart-1)`, tooltip using `var(--popover)`/`var(--border)` tokens).
3. `Card` "توزيع الطلاب حسب مستوى الدعم" → 3-col grid of level-count tiles (`bg-secondary/40`) + "متوسط وقت المراجعة" line.
4. `Card` "الطلبات" with subtitle "صفِّ حسب حالة الطلب لمعرفة من يحتاج اهتمامًا" — GET status-filter `<select>`+outline button, and "إدارة المستخدمين" `Link`-button (`variant="accent"`, `Users` icon) to `/admin/users`. `Table` columns: الطالب, حالة الطلب, التعيين ("معيّن" secondary badge or "غير معيّن" accent-tinted badge), تاريخ التسجيل.
5. Hidden-note footer re: tenant isolation.

**Components**: `Card`, `Table`, `Badge`, `EchoCard`, `Sparkline`, `buttonVariants`, plus the standalone `CategoryChart` client component (Recharts `Bar`/`BarChart`/`CartesianGrid`/`ResponsiveContainer`/`Tooltip`/`XAxis`/`YAxis`).

**States**: `requestsList.length === 0` → "لا توجد طلبات تطابق هذا الفلتر".

**Navigation**: nav item "لوحة التحكم" (admin home). Links to `/admin/users`.

**Screenshot**: `ui-inventory-screenshots/admin-stats.png` — captured with 3 real students (2 approved, distributed across categories/levels).

## `/admin/audit-log` — `src/app/admin/audit-log/page.tsx`
**Role**: `admin` only.

**Structure** (title "سجل التدقيق"):
1. Right-aligned "تصدير السجل CSV" `<a download>`-as-button (`variant="accent"`, `Download` icon) hitting `/api/admin/export/students`.
2. `Card` "تصفية" — GET form, 5-col grid (`sm:grid-cols-5`): user `<select>`, action-type `<select>`, from-date `Input[type=date]`, to-date `Input[type=date]`, "تطبيق" `Button`.
3. Bordered/rounded table wrapper → `Table` (الوقت, المستخدم [name+role badge, email], الإجراء, الطالب المعني [monospace id or em-dash]) — capped at 300 rows, newest first.
4. Read-only-note footer: "السجل للقراءة فقط ولا يُحذف منه شيء. يظهر لحساب الإدارة وحده."

**Components**: `Card`, `Table`, `Badge`, `Label`, `Input`, `Button`/`buttonVariants`.

**States**: `logs.length === 0` → "لا توجد سجلات مطابقة".

**Navigation**: nav item "سجل التدقيق". No outbound page links (only the CSV export link, which is a file download, not navigation).

**Screenshot**: `ui-inventory-screenshots/admin-audit-log.png` — captured; note this action itself (`view_audit_log`) is logged by the page.

## `/admin/users` — `src/app/admin/users/page.tsx` + `assign-specialist-form.tsx` + `manage-users-panel.tsx` + `user-row-actions.tsx` + `create-user-form.tsx`
**Role**: `admin` only.

**Structure** (title "تعيين مختص" / subtitle "اربط مختصاً بطالب يدوياً، وأدر المستخدمين عند الحاجة"):
1. Conditional accent-tinted `Badge` at the top: "طلبات جديدة تحتاج تعييناً: N" (only if >0).
2. `Card` "تعيين المختصين للطلاب" (note: "التعيين هنا يدوي بالكامل...") → `AssignSpecialistForm` (client): 3-col grid — specialist `Select` (label includes current caseload count), student `Select`, "تعيين المختص" `Button` (`variant="accent"`, `min-h-[52px]`). Below, if any assignments exist, a `Table` (المختص, الطالب) listing all current assignments. Hidden-note: "لا تظهر في هذه الشاشة أبداً تصنيف الطالب أو مستوى دعمه..."
3. `Card` "إدارة المستخدمين" → `ManageUsersPanel` (client): "إضافة مستخدم جديد" label + `CreateUserForm` (4-col grid: full name, email, password, role `Select`, conditionally student-number, "إضافة مستخدم" button), then a search `Input` (`type=search`), then a `Table` (المستخدم [name+email], الدور badge, الحالة [active/disabled badge + optional "بحاجة لتعيين" accent badge], إجراءات [`UserRowActions`: role `Select` + activate/deactivate `Button`]). Rows needing assignment get a `bg-accent/5` row tint.

**Components**: `Card`, `Table`, `Badge`, `Button`, `Input`, `Label`, `Select` family.

**States**: `assignments.length === 0` hides the assignment table; `filtered.length === 0` (search) → "لا يوجد مستخدمون مطابقون لهذا البحث".

**Navigation**: nav item "تعيين مختص". Also linked from `/admin/stats`'s "إدارة المستخدمين" button. No further outbound page links (all actions are in-place server actions).

**Screenshot**: `ui-inventory-screenshots/admin-users.png` — captured with 8 real users and 3 assignments.

## `/admin/reports` — `src/app/admin/reports/page.tsx`
**Role**: `admin` only. **Not in the admin nav** (see AppShell section above) — reachable only via direct URL; still fully functional.

**Structure** (title "التقارير" / subtitle "تصدير تقارير إدارية لا تتضمن أي بيانات طبية"):
- Single `Card` "تقرير الطلاب (CSV)" — description paragraph detailing exactly what the export includes/excludes, and a "تنزيل التقرير" `<a download>`-as-button (`Download` icon, default variant — **not** accent, unlike the visually near-identical export button on `/admin/audit-log`, which is accent-styled).

**Components**: `Card`, `buttonVariants`. Icon: `Download`.

**Navigation**: no inbound nav item; not linked from any other page in the codebase (grep confirms no `<Link href="/admin/reports"` anywhere) — a true orphan route.

**Screenshot**: `ui-inventory-screenshots/admin-reports.png` — captured successfully.

---

# Summary

## Pages grouped by role

- **Public** (no session required): `/`, `/login`, `/register`.
- **Authenticated, any role, misrouted**: `/unauthorized`.
- **Student**: `/student/status`, `/student/upload`.
- **Faculty**: `/faculty/students` (+admin), `/faculty/upload`, `/faculty/exams`, `/faculty/exams/new`, `/faculty/exams/[id]`, `/faculty/exams/[id]/results`, `/faculty/keyterms`.
- **Specialist**: `/specialist/queue` (+admin), `/specialist/alerts` (+admin), `/specialist/students/[id]` (+admin), `/specialist/students/[id]/review` (+admin); `/specialist/students/[id]/assess` and `/specialist/students/[id]/plan` are redirect-only shims to `.../review`.
- **Admin**: `/admin/stats`, `/admin/audit-log`, `/admin/users`, `/admin/reports` (orphaned, no nav entry).

22 file-system routes total; 20 render real UI (screenshotted); 2 (`assess`, `plan`) are pure redirects with no markup.

## Shared components inventory

**Layout** (`src/components/layout/`):
- `app-shell.tsx` (`AppShell`) — used by every authenticated page (all 18 non-redirect, non-public pages).
- `nav-links.tsx` (`NavLinks`) — used inside `AppShell` only.
- `nav-items.ts` — one `get*NavItems()` per section, called by every page in that section.
- `brand-mark.tsx` (`BrandIcon`, `BrandWordmark`) — `BrandIcon` in `AppShell`'s sidebar and nowhere else; `BrandWordmark` in `AppShell`'s header and on `/login`'s left pane.
- `sign-out-button.tsx` — `AppShell` header only.

**i18n/theme**: `language-switcher.tsx` (`AppShell` header + `/login` uses `ThemeToggle` only, not the language switcher, on its own top bar), `theme-toggle.tsx` (`AppShell` header, `/login`).

**UI primitives** (`src/components/ui/`), with usage:
- `card.tsx` — nearly every page (all dashboards, forms, list wrappers).
- `button.tsx` — nearly every page; variants actually used across the app: `default`, `accent`, `outline`, `secondary`, `ghost`, `destructive` (only as a color role for icons, e.g. `Trash2` text-destructive — no page sets `variant="destructive"` on an actual `Button`/`badge` for a primary action), `link` (unused in pages surveyed). Sizes used: `default`, `sm`, `cta`, `icon-sm`.
- `table.tsx` — `admin/audit-log`, `admin/stats`, `admin/users` (assignments table), `faculty/students`, `faculty/exams/[id]/results`, `specialist/queue`, `specialist/alerts`, `specialist/students/[id]`, `student/status`.
- `badge.tsx` — used on nearly every list/table page for status chips.
- `echo-card.tsx` (`EchoCard`) — one per dashboard-style page: `admin/stats`, `faculty/students`, `faculty/upload`, `specialist/queue`, `specialist/students/[id]/review`, `student/status`, `student/upload`.
- `sparkline.tsx` — `admin/stats`, `specialist/queue` only (the two pages with a genuine weekly time series).
- `select.tsx` — `admin/users` (2 forms), `admin/audit-log`/`admin/stats`/`faculty/students`/`specialist/queue` (native `<select>`, not this component, for GET filters — see inconsistency below), `faculty/exams/new`, `faculty/keyterms`, `specialist/students/[id]/review`, `faculty/upload`.
- `input.tsx` / `label.tsx` — every form page.
- `checkbox.tsx` — `faculty/exams/new` (per-option correct + show-results), `faculty/exams/[id]` (`ShowResultsToggle`), `specialist/students/[id]/review` (tool activations).
- `textarea.tsx` — `faculty/upload` (note field), `specialist/alerts` (`AlertRowActions` close-reason), `specialist/students/[id]/review` (assessment notes, revision reason).
- `accordion.tsx` — `faculty/keyterms` only.
- `dialog.tsx` — imported/defined but **not used by any of the 22 pages** in this survey (no `<Dialog>` usage found in any page or panel file grepped).
- `avatar.tsx`, `dropdown-menu.tsx`, `separator.tsx`, `sonner.tsx` (toast host), `tabs.tsx`, `toast.tsx` — not directly used by page-level markup in these 22 pages (`sonner`'s `toast()` calls are used everywhere via the `sonner` package import, but the `ui/sonner.tsx` Toaster wrapper itself is mounted once in the root layout, not per-page).

## Inconsistencies noticed

1. **Raw Tailwind palette colors instead of semantic tokens**:
   - `src/app/login/page.tsx:31,38,45` — demo-account dot colors `bg-emerald-500`, `bg-sky-500`, `bg-violet-500` (only the 4th, `bg-primary`, is on-token).
   - `src/app/student/status/page.tsx:17` — `STATUS_TONE.approved` = `"bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-400"`, a raw-hex-family Tailwind color pair with no equivalent semantic token in `globals.css` (there is no `--success`/`--emerald` token defined at all) — the only "success" color anywhere in the app, introduced ad hoc on this one page.
   - `src/app/login/page.tsx:132,145` — arbitrary inline box-shadow values `shadow-[0_2px_4px_rgba(30,42,58,0.06)] dark:shadow-[0_2px_6px_rgba(0,0,0,0.3)]` on the two `Input`s, duplicating (by hand) roughly what `Card`'s own shadow token already expresses elsewhere.
   - `src/components/ui/card.tsx:28` and `src/components/ui/echo-card.tsx:31` also use hardcoded `rgba(...)` shadow/fill values rather than CSS custom properties — consistent with each other, but neither is expressed as a reusable `--shadow-*` token in `globals.css`, so any redesign pass touching card elevation has to edit two component files by hand instead of one token.

2. **Filter `<select>` inconsistency**: most GET-filter dropdowns across dashboard pages (`admin/audit-log`, `admin/stats`, `faculty/students`, `specialist/queue`, `student/status`) are hand-styled native `<select>` elements (`className="flex h-11 min-w-40 rounded-md border border-input bg-background px-2 text-sm"` or similar, repeated near-verbatim in each file) rather than the shared `Select` component used everywhere else in the app (forms on `admin/users`, `faculty/exams/new`, `faculty/keyterms`, `specialist/students/[id]/review`). This is a deliberate simplification for plain GET-form filters (the `Select` component is a controlled Base UI primitive, awkward inside a native `<form method="GET">`), but it means filter dropdowns and form dropdowns look/behave slightly differently (native OS-rendered popup vs. the app's styled popover) on the same app.

3. **Button-as-link pattern duplicated everywhere, not centralized**: every single outbound "styled like a button but is actually a `<Link>`/`<a>`" (there are roughly 15+ instances across the pages surveyed: `unauthorized`, `admin/reports`, `admin/audit-log`'s export, `admin/stats`'s manage-users button, `faculty/students`' manage-files link, `faculty/exams`' new-exam button, `specialist/queue`'s per-row + start-review links, `specialist/students/[id]`'s review link, `specialist/students/[id]/review`'s full-history/open links, `faculty/upload`'s download icon-button) all independently call `buttonVariants({...})` inline with a `cn(...)` wrapper, rather than there being a single shared `LinkButton` wrapper component — functionally consistent (all correctly avoid misusing `Button`'s `render` prop, per the codebase's own documented rule) but a lot of repeated boilerplate.

4. **Orphaned route**: `/admin/reports` (`src/app/admin/reports/page.tsx`) has no nav entry anywhere (`nav-items.ts`'s `getAdminNavItems()` only lists stats/audit-log/users) and is not linked from any other page — it is fully functional but effectively undiscoverable in the current UI, while `/admin/audit-log` independently re-implements the identical CSV-export affordance as an accent-styled button, creating duplicate functionality with inconsistent visual weight (accent on audit-log vs. default on reports for what is the same download).

5. **Ad hoc severity/status color maps duplicated per page** rather than a shared utility: `student/status/page.tsx`'s `STATUS_TONE`, `specialist/alerts/page.tsx`'s `SEVERITY_TONE`, and inline one-off `Badge` tint overrides (`bg-accent/15 text-accent`) repeated in `admin/stats`, `admin/users`, and `student/status` for "needs attention"/"not assigned" states — all hand-rolled per file with the same `bg-<token>/15 text-<token>` idiom, but never factored into a shared badge-tone helper or additional `Badge` variant.

6. **Card corner radius**: the base `Card` component (`src/components/ui/card.tsx:28`) is `rounded-[20px]`, but every `EchoCard`-wrapped hero `Card` across every dashboard explicitly overrides this to `rounded-[24px]` (and `EchoCard`'s own echo layer is hard-coded to `rounded-[24px]` too) — meaning "hero card" is a distinct, manually-repeated radius value (`admin/stats`, `faculty/students`, `specialist/queue`, `student/status`, `faculty/upload`, `student/upload`, `specialist/students/[id]/review` all repeat the literal string `rounded-[24px]` on their hero `Card`) rather than a `size="hero"` variant on the `Card` component itself.

7. **Table cell RTL handling** is correct but fragile-by-convention rather than enforced: `table.tsx`'s own comments document a real, previously-shipped bug (forcing `dir="ltr"` directly on a `TableCell` desyncs its alignment from `TableHead` under RTL) and the fix (wrap only the inner text in a `dir="ltr"` `<span>`) is applied consistently by hand in every table across all pages surveyed — but nothing in the type system or component API prevents a future page from reintroducing the same mistake; it relies entirely on comments being read.

---

## Screenshot capture notes

All 20 real (non-redirect) pages were captured via Playwright (`v1.62.1`) against the local dev server (`http://localhost:3000`) using the 4 seeded demo accounts (`student@demo.shadow.sa`, `faculty@demo.shadow.sa`, `specialist@demo.shadow.sa`, `admin@demo.shadow.sa`, password `Password123!`, confirmed against `prisma/seed.ts`). Viewport 1440×900, full-page screenshots, saved to `D:\Shadow\platform\ui-inventory-screenshots\`.

For pages needing a real record id, **existing seeded/real data was reused instead of creating new throwaway records** — the database already contained usable exams (`اختبار قصير — تجربة الاختبار الصوتي`, CS301, published, with one real submission) and specialist-assigned students (أحمد محمد, with a real assessment + approved support plan). No exam, student, keyterm, or user record was created or deleted during this session — every screenshot was taken via read-only page navigation, no form was ever submitted.

`/unauthorized` initially mis-captured as the login page on the first pass (visiting it directly while unauthenticated redirects to `/login`, since `/unauthorized` is not in the middleware's public-path allowlist); corrected by logging in as `student` and navigating to an admin-only URL (`/admin/stats`), which the middleware correctly redirected to `/unauthorized` — that corrected screenshot is what's referenced above. All 4 admin screenshots also needed a retake after an initial run where the admin login race lost to `waitForLoadState`; the retake explicitly waited for the URL to leave `/login` before proceeding, and all 4 subsequently verified correct.
