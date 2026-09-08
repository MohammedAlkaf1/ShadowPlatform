# تقرير تقني شامل — Shadow Platform (منصة شادو)

> هذا التقرير مبني بالكامل على قراءة فعلية لملفات المشروع في `D:\Shadow\platform` وتشغيل أوامر حقيقية (git, npx tsc, npx vitest, npm run build, npx eslint) في هذه الجلسة بتاريخ 2026-08-19. كل ما لا يوجد له دليل موثّق تمت الإشارة إليه صراحة كـ"غير مؤكد".

---

## 1. نظرة عامة (Overview)

**اسم المشروع** (حقل `name` في `package.json`): `platform`
**الإصدار الحالي** (حقل `version`): `0.1.0`
**النوع**: تطبيق ويب Next.js (App Router)، خاص (`"private": true`).

**الغرض** (من `README.md`، السطر الأول): بوابة ويب لإدارة خدمات دعم الطلاب ذوي الإعاقة في الجامعات السعودية. الطالب يسجّل ويرفع وثائق طبية، مختص يصنّفها ويبني خطة دعم، عضو هيئة تدريس يرى فقط التسهيلات المعتمدة، والإدارة تدير المستخدمين/الأدوار/التعيينات. تطبيق Flutter منفصل (مستودع آخر `D:\Shadow\app`، غير جزء من هذا المستودع) يقرأ الخطة المعتمدة عبر مسارات `/api/*` في هذا المستودع.

بحسب `README.md`: "Phase 1 of a 3-phase plan (Phase 0 planning already approved)."

### البنية الشجرية للمجلدات الرئيسية (مستويين)

```
platform/
├── src/                      # كل كود التطبيق الفعلي
│   ├── app/                    # صفحات ومسارات App Router (لا يوجد pages/ إطلاقاً)
│   ├── components/             # مكوّنات واجهة قابلة لإعادة الاستخدام
│   ├── i18n/                   # إعداد next-intl (ملف request.ts وحيد)
│   ├── lib/                    # منطق خادم مشترك (auth, tenant scoping, S3, تشفير...)
│   ├── types/                  # تمديد أنواع next-auth (next-auth.d.ts)
│   ├── auth.ts                 # إعداد NextAuth v5 (Credentials + JWT)
│   └── middleware.ts            # بوابة auth+RBAC لمسارات الصفحات
├── prisma/                   # مخطط قاعدة البيانات والبذور
│   ├── schema.prisma            # المخطط الكامل (17 model)
│   ├── seed.ts                  # بيانات تجريبية (tenant, مستخدمون, تصنيفات...)
│   └── migrations/              # 6 migrations مُطبَّقة فعلياً
├── tests/                    # اختبارات Vitest (تكاملية، تلمس Postgres/MinIO حقيقيين)
├── messages/                  # ملفات ترجمة next-intl (ar.json, en.json)
├── docs/                      # وثائق داخلية (API.md, تقارير حالة, تصميم)
├── public/                    # أصول ثابتة تُخدَم مباشرة
├── docker-compose.yml         # Postgres + MinIO للتطوير المحلي
├── next.config.ts             # إعداد Next.js (يفصل .next عن .next-prod)
├── middleware.ts               # (داخل src/، انظر أعلاه)
└── package.json               # الاعتماديات والسكربتات
```

**تفصيل `src/app/` (مستوى ثانٍ، من الفحص الفعلي)**:
- `admin/` — لوحات الإدارة: `audit-log/`, `reports/`, `stats/`, `users/`
- `api/` — كل مسارات الـ API (`admin/`, `auth/`, `documents/`, `events/`, `faculty/`, `student/`)
- `faculty/` — `students/`, `upload/`
- `specialist/` — `alerts/`, `queue/`, `students/[id]/{assess,plan,review}`
- `student/` — `status/`, `upload/`
- `login/`, `register/`, `unauthorized/` — صفحات عامة
- `layout.tsx`, `page.tsx` (الجذر، يعيد توجيه لـ `/login`)، `globals.css`, `favicon.ico`

**تفصيل `src/lib/` (كل الملفات الفعلية، 18 ملفاً)**: `adaptation.ts`, `api-auth.ts`, `audit.ts`, `csv.ts`, `encryption.ts`, `faculty-access.ts`, `format-date.ts`, `locale.ts`, `mobile-jwt.ts`, `prisma.ts`, `rate-limit.ts`, `require-role-page.ts`, `s3.ts`, `session.ts`, `specialist-access.ts`, `tenant-db.ts`, `tool-codes.ts`, `utils.ts`, `validation.ts`.

**تفصيل `src/components/` (مستوى ثانٍ)**:
- `ui/` — 18 مكوّناً من shadcn/ui فوق `@base-ui/react` (button, card, dialog, select, table, ...)
- `layout/` — `app-shell.tsx`, `brand-mark.tsx`, `nav-items.ts`, `nav-links.tsx`, `sign-out-button.tsx`
- `providers/` — `auth-provider.tsx` (NextAuth `SessionProvider`)، `theme-provider.tsx` (next-themes)
- `theme/` — `theme-toggle.tsx`
- `i18n/` — `language-switcher.tsx`, `actions.ts`

**docs/ (فعلياً موجود)**: `API.md` (مرجع API كامل للموبايل)، `PLATFORM_STATUS.md` و`FINAL_STATUS_PLATFORM.md` (تقارير حالة سابقة مؤرخة)، مجلد "Mobile app design directions"، وملف `Shadow Platform.dc.html` + صور SVG/PNG مرفقة (تصاميم/أصول).

---

## 2. التقنيات والاعتماديات (Tech & Dependencies)

**لا يوجد حقل `engines` في `package.json`** — لا قيد إصدار Node/npm صريح في الملف. الإصدار الفعلي المُستخدم في هذه الجلسة (`node -v` / `npm -v`): Node **v22.15.0**، npm **10.9.2** (هذا إصدار بيئة التشغيل الحالية فقط، وليس قيداً مكتوباً في المشروع).

**إصدارات الأطر الأساسية** (من `dependencies` في `package.json`):
| الحزمة | الإصدار المُثبَّت |
|---|---|
| next | ^15.5.22 |
| react / react-dom | 19.2.4 (مثبّتة بدقة، بدون `^`) |
| typescript | ^5 (devDependency) |
| prisma / @prisma/client | ^6.19.3 |

### dependencies (كل واحدة، كما وردت حرفياً في `package.json`)

**تخزين وقاعدة بيانات**
- `@prisma/client` ^6.19.3 — عميل Prisma ORM المُولَّد.
- `prisma` ^6.19.3 — Prisma CLI (migrate/seed/studio).
- `@aws-sdk/client-s3` ^3.1101.0 — عميل S3 المستخدم فعلياً في `src/lib/s3.ts` (يعمل ضد MinIO محلياً).
- `@aws-sdk/lib-storage` ^3.1101.0 — مساعدات رفع S3 (multipart streaming).

**مصادقة وأمان**
- `next-auth` ^5.0.0-beta.32 — NextAuth.js v5 (beta)، مستخدم في `src/auth.ts`.
- `bcryptjs` ^3.0.3 — تجزئة/تحقق كلمات المرور (`src/auth.ts`, `prisma/seed.ts`).

**تحقق من صحة البيانات**
- `zod` ^4.4.3 — كل مخططات `src/lib/validation.ts` وبيانات النماذج/API.

**واجهة المستخدم / مكوّنات**
- `@base-ui/react` ^1.6.0 — مكتبة عناصر واجهة "headless" التي تبني فوقها كل مكوّنات `src/components/ui/*` (مؤكَّد بالاستيراد المباشر في avatar/badge/button/checkbox/dialog/dropdown-menu/input/select/separator/tabs/toast).
- `shadcn` ^4.16.1 — أداة CLI لتوليد مكوّنات shadcn/ui (تُستخدم كـ dev tool وليست تُستورد وقت التشغيل، لكنها dependency حقيقية بحسب `package.json`).
- `lucide-react` ^1.28.0 — مكتبة الأيقونات.
- `class-variance-authority` ^0.7.1 — بناء variants لمكوّنات مثل button/badge/tabs (مؤكَّد بالاستيراد).
- `clsx` + `tailwind-merge` ^3.6.0 — دمج أصناف Tailwind (عبر `src/lib/utils.ts`).
- `tw-animate-css` ^1.4.0 — أصناف حركة/انتقال إضافية فوق Tailwind.
- `next-themes` ^0.4.6 — تبديل الوضع الفاتح/الداكن، مربوط فعلياً عبر `src/components/providers/theme-provider.tsx` ومُركَّب في `src/app/layout.tsx`.
- `sonner` ^2.0.7 — إشعارات Toast (مستخدمة في عدة نماذج/actions).
- `recharts` ^3.10.1 — رسم بياني في `src/app/admin/stats/category-chart.tsx`.

**دولية/تعدد لغات**
- `next-intl` ^4.13.4 — نظام الترجمة الكامل (عربي/إنجليزي)، بدون توجيه عبر URL (انظر القسم 3).

**أدوات عامة**
- `uuid` ^14.0.1 — استخدام فعلي في `src/lib/s3.ts`, `src/lib/validation.ts`, وملفات `actions.ts` متعددة.

### devDependencies (كل واحدة، كما وردت حرفياً)
| الحزمة | الإصدار | الدور |
|---|---|---|
| `@playwright/test` | ^1.62.1 | إطار اختبار متصفح (E2E) — لم يُعثر على أي ملف اختبار Playwright فعلي داخل `tests/` (انظر القسم 7) |
| `@tailwindcss/postcss` | ^4 | إضافة PostCSS لـ Tailwind v4 |
| `@types/bcryptjs` | ^2.4.6 | أنواع TypeScript |
| `@types/node` | ^20 | أنواع TypeScript لـ Node |
| `@types/react` | ^19 | أنواع TypeScript لـ React |
| `@types/react-dom` | ^19 | أنواع TypeScript |
| `@types/uuid` | ^10.0.0 | أنواع TypeScript |
| `dotenv` | ^17.4.2 | تحميل ملفات `.env`/`.env.local` يدوياً داخل `tests/setup.ts` |
| `eslint` | ^9 | فحص الكود الثابت |
| `eslint-config-next` | 16.2.12 | إعداد ESLint الرسمي لـ Next.js |
| `tailwindcss` | ^4 | إطار CSS |
| `tsx` | ^4.23.1 | تشغيل TypeScript مباشرة (يُستخدم لتشغيل `prisma/seed.ts`) |
| `typescript` | ^5 | مترجم TypeScript |
| `vite-tsconfig-paths` | ^6.1.1 | حل مسارات tsconfig داخل Vitest |
| `vitest` | ^4.1.10 | إطار الاختبارات |

**ملاحظة إصدار متضارب ظاهرياً**: `eslint-config-next` مثبّت على `16.2.12` بينما `next` نفسه `^15.5.22` — إصداران مختلفان من نفس العائلة (تم التحقق من القيمتين الحرفيتين في `package.json`؛ لم يُفحص أثر ذلك على السلوك الفعلي أبعد من أن `npm run lint`/`npx eslint` نجحا بدون أخطاء في هذه الجلسة).

### npm scripts (من `package.json`، مع ما يفعله كل أمر فعلياً)
| السكربت | الأمر الحرفي | الوصف |
|---|---|---|
| `dev` | `next dev` | خادم تطوير محلي |
| `build` | `next build` | بناء إنتاجي (يُخرَج إلى `.next-prod` عبر `next.config.ts` عند `NODE_ENV=production`) |
| `start` | `next start` | تشغيل البناء الإنتاجي |
| `lint` | `eslint` | فحص الكود الثابت |
| `clean` | كود Node مضمّن (`fs.rmSync`) | يحذف مجلدي `.next` و`.next-prod` |
| `test` | `vitest run` | تشغيل كل الاختبارات مرة واحدة |
| `test:watch` | `vitest` | تشغيل الاختبارات في وضع المراقبة |
| `prisma:migrate` | `prisma migrate dev` | تطبيق/إنشاء migration جديدة |
| `prisma:seed` | `prisma db seed` | تعبئة بيانات تجريبية (يستدعي `tsx prisma/seed.ts` حسب حقل `"prisma".{"seed"}` في `package.json`) |
| `prisma:studio` | `prisma studio` | واجهة إدارة قاعدة البيانات الرسومية |

---

## 3. المعمارية (Architecture)

### الواجهة الأمامية (Frontend)
- **App Router حصراً**: تم التحقق أن `src/app/` هو المسار الوحيد الموجود؛ لا يوجد مجلد `pages/` في المشروع إطلاقاً.
- **إدارة الحالة**: لا يوجد Redux ولا Zustand ولا React Query ولا SWR ولا `React.createContext` في `src` (تم البحث الفعلي، صفر نتائج). الحالة تُدار عبر:
  - **Server Components** تجلب البيانات مباشرة من Prisma وقت الطلب (لا جلب من العميل عبر fetch لمعظم الصفحات).
  - **Server Actions** (`"use server"`) لعمليات الكتابة — 6 ملفات فعلية: `src/app/register/actions.ts`, `src/app/student/upload/actions.ts`, `src/app/admin/users/actions.ts`, `src/app/specialist/alerts/actions.ts`, `src/app/specialist/students/[id]/review/actions.ts`, `src/components/i18n/actions.ts`.
  - حالة عميل محلية بسيطة (`useState`) داخل 28 مكوّناً تحمل `"use client"` (نماذج، قوائم منسدلة، مبدّل اللغة/الثيم).
- **الأنماط والثيم**: Tailwind CSS v4 (عبر `@tailwindcss/postcss` في `postcss.config.mjs`، لا ملف `tailwind.config.*` منفصل — إعداد v4 القائم على CSS). الوضع الداكن مفعّل فعلياً عبر `next-themes`: `src/components/providers/theme-provider.tsx` يستخدم `attribute="class"` و`defaultTheme="light"`، ومُركَّب في `src/app/layout.tsx` (السطر 65)، ومتحكَّم به عبر `src/components/theme/theme-toggle.tsx` المُستخدَم في `app-shell.tsx` و`login/page.tsx`.
- **مكتبة المكوّنات**: shadcn/ui (مؤكَّد من `components.json` — `"style": "base-nova"`, `baseColor: "neutral"`) مبنية فوق `@base-ui/react` (وليس Radix UI كما هو معتاد في shadcn التقليدي — تم التحقق من الاستيراد الفعلي `from "@base-ui/react/..."` في كل مكوّنات `src/components/ui/`).
- **التدويل (i18n)**: `next-intl` **بدون** توجيه عبر URL (لا `/ar/` أو `/en/` في المسارات) — قرار موثَّق صراحة في `src/i18n/request.ts` لتفادي كسر `middleware.ts`. أولوية حل اللغة: تفضيل `User.locale` المحفوظ ← كوكي `NEXT_LOCALE` ← ترويسة `Accept-Language` ← افتراضي `ar`.

### الخلفية (Backend)
- **API Routes**: 14 ملف `route.ts` فعلي تحت `src/app/api/**` (القائمة الكاملة في القسم 6).
- **Server Actions**: منطق كتابة إضافي خارج `/api` (تسجيل الطالب، رفع الوثائق من الويب، إدارة المستخدمين، تنبيهات المختص، مراجعة الطلب، تبديل اللغة) — الملفات مذكورة أعلاه.
- **اتصال قاعدة البيانات**: عميل Prisma Singleton في `src/lib/prisma.ts` (لم تتم قراءته حرفياً بالكامل في هذه الجلسة لكن استيراده مؤكَّد من كل الملفات الأخرى `from "./prisma"` / `from "@/lib/prisma"`)، ويُستهلَك عبر طبقة تمديد تلقائية في `src/lib/tenant-db.ts` — دالة `getTenantScopedPrisma(tenantId)` تُلحق `tenantId` تلقائياً بكل عملية `where`/`data`/`create` على 13 موديل مُدرَجة صراحة في `TENANT_SCOPED_MODELS` (باستثناء موديلين يرثان النطاق عبر الأب: `ToolActivation`, `PlanRevision`).

### قاعدة البيانات
- **النوع**: PostgreSQL (مؤكَّد من `prisma/schema.prisma`، `datasource db { provider = "postgresql" }`، ومن `docker-compose.yml` الذي يشغّل `postgres:16-alpine`).
- **الـ ORM**: Prisma (`prisma-client-js` generator، `@prisma/client` ^6.19.3).
- **عدد الـ migrations المُطبَّقة فعلياً** (من `ls prisma/migrations`): 6 — `init`, `add_specialist_assignment`, `add_mode_tool_codes`, `add_user_locale`, `add_faculty_resource`, `add_user_full_name`.

**كل موديل في `prisma/schema.prisma` (17 موديلاً فعلياً، مقروءة بالكامل)**:
| الموديل | الغرض (مُستنتَج من الحقول/العلاقات الفعلية) |
|---|---|
| `Tenant` | الجامعة/المؤسسة — يحمل اسم عربي/إنجليزي، إعدادات التسجيل الذاتي (`selfSignupEnabled`, `emailDomain`)، ومدة الاحتفاظ بالوثائق |
| `User` | حساب مستخدم (أي دور)، مرتبط بـ tenant، يحمل `passwordHash`, `role`, `locale`, `deletedAt` (حذف ناعم) |
| `StudentProfile` | البيانات الأكاديمية للطالب (رقم جامعي، تخصص، مرحلة، هاتف) وحالة الطلب `requestStatus` والتحقق `verified` |
| `SpecialistAssignment` | جدول ربط يدوي بين مختص وطالب — أُضيف يدوياً (ليس في الـ ERD الأصلي بحسب تعليق صريح في الملف) لتطبيق قاعدة "التعيين يدوي من الإدارة فقط" |
| `Category` | فئة تصنيف طبي عليا (عربي/إنجليزي + كود) |
| `Condition` | حالة فرعية داخل فئة (مثال: التوحد داخل الاضطرابات العصبية) |
| `SupportLevel` | مستوى الدعم (1 خفيف، 2 متوسط، 3 مكثّف) |
| `Document` | ميتاداتا الوثيقة الطبية المرفوعة (المفتاح في S3، النوع، الحجم، `encryptionKeyRef`) — لا محتوى ثنائي في القاعدة |
| `Assessment` | تقييم المختص لطالب: يربط `Condition` و`SupportLevel` مع ملاحظات نصية |
| `SupportPlan` | خطة الدعم (مسودة/معتمدة/منتهية)، تعتمدها جهة (`approvedByUserId`) |
| `ToolActivation` | ربط أداة `ToolCode` معينة بخطة دعم، مع تفعيل/إيقاف وإعداد JSON اختياري |
| `PlanRevision` | سجل append-only لمراجعات مستوى الدعم لاحقاً (سبب + مستوى جديد) |
| `UsageEvent` | حدث استخدام مُرسَل من تطبيق الموبايل (نوع الحدث + payload JSON) |
| `MentorAlert` | تنبيه للمختص (خطورة/حالة) قد يكون ناتجاً عن `UsageEvent` |
| `FacultyCourseLink` | ربط عضو هيئة تدريس بطالب في مقرر معيّن، يحمل `approvedAccommodations` JSON |
| `FacultyResource` | ملف مخصّص يرفعه عضو هيئة تدريس لطالب واحد (غير مشفّر عمداً، بخلاف `Document`) |
| `AuditLog` | سجل تدقيق لكل قراءة/تعديل حساس (فاعل، إجراء، مورد، هدف اختياري) |

**Enums (9 فعلياً، من قراءة الملف)**: `UserRole` (student/faculty/specialist/admin)، `Locale` (ar/en)، `RequestStatus` (pending/under_review/approved/rejected)، `DocumentStatus` (pending/reviewed)، `SupportPlanStatus` (draft/approved/expired)، `AlertSeverity` (low/medium/high)، `AlertStatus` (open/acknowledged/resolved)، `ToolCode` (12 قيمة: 8 أدوات دقيقة + 4 أكواد وضع)، `FacultyResourceCategory` (simplified_content/visual_adjustment/extra_exercises/other).

### المصادقة (Auth)
- **المكتبة**: NextAuth.js v5 beta (`next-auth` ^5.0.0-beta.32)، الإعداد في `src/auth.ts`.
- **استراتيجية الجلسة**: JWT (`session: { strategy: "jwt" }` — مؤكَّد حرفياً من `src/auth.ts` السطر 27)، وليست جلسة قاعدة بيانات.
- **مزوّد**: `Credentials` وحيد (بريد/كلمة مرور)، التحقق عبر `bcrypt.compare` ضد `passwordHash` في جدول `User`.
- **قناة مصادقة ثانية منفصلة للموبايل**: JWT مستقل (HS256) موقّع بمكتبة `jose`، مُصدَر من `src/lib/mobile-jwt.ts`، يُستخدَم فقط عبر ترويسة `Authorization: Bearer` (لا كوكي متصفح) — يشارك نفس السر `NEXTAUTH_SECRET`.
- **فحوصات الدور/الصلاحية والمكان الفعلي في الكود**:
  - `src/middleware.ts` — بوابة مستوى المسار لصفحات الويب (`/student`, `/specialist`, `/faculty`, `/admin`)؛ الإدارة تتجاوز كل القيود.
  - `src/lib/require-role-page.ts` — دفاع إضافي مُستدعى في أعلى كل `layout.tsx` لكل دور (`src/app/{admin,faculty,specialist,student}/layout.tsx`).
  - `src/lib/session.ts` (`requireRole`) — يُستخدَم داخل كل صفحة/action تعمل عبر جلسة الويب.
  - `src/lib/api-auth.ts` (`requireMobileRole`, `requireApiRole`) — بوابة مسارات `/api/*` (تُفرّق بين JWT الموبايل وجلسة الويب حسب المسار).
  - `src/lib/specialist-access.ts` (`assertSpecialistAssigned`) — يمنع مختصاً من فتح سجل طالب غير مُعيَّن له إدارياً (يُرجع 404 وليس 403 عمداً).
  - `src/lib/faculty-access.ts` (`assertFacultyLinkedToStudent`) — يمنع عضو هيئة تدريس من الوصول لطالب/مقرر لا يملك `FacultyCourseLink` حقيقياً معه؛ **الإدارة لا تتجاوز هذا الفحص** (موثَّق صراحة في تعليق الكود كاستثناء متعمَّد من نمط "الإدارة تتجاوز كل شيء" المُتَّبع في بقية الملف).

### تخزين الملفات
- **أين تُخزَّن الملفات المرفوعة**: تخزين متوافق مع S3 عبر `@aws-sdk/client-s3` (`src/lib/s3.ts`) — MinIO محلياً (`docker-compose.yml`)، وقابل للتوجيه لأي S3 حقيقي في الإنتاج عبر متغيرات البيئة (`S3_ENDPOINT`, إلخ). **لا تخزين على القرص المحلي، ولا تخزين ثنائي داخل قاعدة البيانات**.
- **التشفير**: الوثائق الطبية (`Document`) مُشفَّرة فعلياً بـ **AES-256-GCM** (خوارزمية `node:crypto` القياسية) قبل الكتابة إلى S3/MinIO — `src/lib/encryption.ts`، المفتاح من متغير البيئة `DOCUMENT_ENCRYPTION_KEY` (32 بايت/64 حرف hex). التعليق في الكود يقر صراحة أن هذا **بديل مؤقت محلي لـ KMS حقيقي**، وأن عمود `encryptionKeyRef` مصمَّم ليحمل لاحقاً معرّف مفتاح KMS فعلي.
- **ملفات `FacultyResource` غير مشفَّرة عمداً** — قرار منتج صريح موثَّق في تعليق `prisma/schema.prisma` (الموديل) وفي `src/lib/s3.ts` (بادئة object-key مختلفة `faculty-resources/` عن `documents/` المشفَّرة، لتمييزها بصرياً داخل الـ bucket).

---

## 4. الخدمات الخارجية (Third-party services)

بحث فعلي شامل عن أي استدعاءات `fetch`/SDK لخدمات خارجية (بريد إلكتروني، رسائل نصية، دفع، تحليلات، إلخ) لم يُظهر أي نتيجة سوى:

| الخدمة | الغرض | ملف التكامل | الإعداد/النموذج | متغير البيئة (اسم فقط) |
|---|---|---|---|---|
| تخزين متوافق مع S3 (MinIO محلياً) | تخزين ملفات الوثائق الطبية المشفّرة وملفات `FacultyResource` غير المشفّرة | `src/lib/s3.ts` | `S3Client` من `@aws-sdk/client-s3`، `forcePathStyle` حسب البيئة | `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET`, `S3_FORCE_PATH_STYLE` |

**لا توجد أي خدمة بريد إلكتروني، رسائل SMS، بوابة دفع، أو خدمة تحليلات/مراقبة (مثل Sentry) في الكود** — تم التحقق ببحث فعلي عن `process.env.` وعن روابط `https://` خارج `localhost` في `src/`، ولم يظهر شيء آخر.

**ملاحظة من `docs/API.md`**: يذكر التوثيق أن تطبيق الموبايل (خارج نطاق هذا المستودع) يتكامل مع مزوّدَي `deepgram` و`gemini` (عبر نوع حدث `provider_error` في `POST /api/events`) — لكن هذا التكامل نفسه **يحدث داخل تطبيق Flutter المنفصل، وليس في هذا المستودع**؛ منصة الويب هنا تستقبل فقط تقارير الأخطاء كنص حر (`errorType`)، ولا تستدعي أي من هاتين الخدمتين مباشرة.

---

## 5. متغيرات البيئة (Environment variables)

المصدر: `.env.example` (موجود فعلياً وقُرئ بالكامل) — القيم الفعلية في `.env`/`.env.local` **لم تُقرأ ولم تُطبَع** (تم فقط استخراج أسماء المتغيرات عبر `grep` بدون القيم).

| المتغير | الغرض (من التعليق في `.env.example` والكود) |
|---|---|
| `DATABASE_URL` | سلسلة اتصال PostgreSQL التي يقرأها Prisma |
| `NEXTAUTH_SECRET` | سر توقيع/تشفير جلسات NextAuth، ويُعاد استخدامه أيضاً لتوقيع JWT الموبايل (`src/lib/mobile-jwt.ts`) |
| `NEXTAUTH_URL` | عنوان التطبيق الأساسي الذي يحتاجه NextAuth |
| `S3_ENDPOINT` | عنوان خادم S3/MinIO |
| `S3_REGION` | منطقة S3 |
| `S3_ACCESS_KEY_ID` | معرّف مفتاح الوصول لـ S3/MinIO |
| `S3_SECRET_ACCESS_KEY` | المفتاح السري لـ S3/MinIO |
| `S3_BUCKET` | اسم الـ bucket المستخدَم لتخزين الملفات |
| `S3_FORCE_PATH_STYLE` | يفرض نمط path-style للـ S3 client (مطلوب لـ MinIO) |
| `DOCUMENT_ENCRYPTION_KEY` | مفتاح AES-256-GCM (64 حرف hex) لتشفير الوثائق الطبية قبل الرفع |
| `MAX_UPLOAD_SIZE_BYTES` | الحد الأقصى لحجم رفع وثيقة طبية (افتراضي 15MB) |
| `MAX_FACULTY_RESOURCE_SIZE_BYTES` | الحد الأقصى لحجم ملف يرفعه عضو هيئة تدريس (افتراضي 20MB) |

**ملاحظة**: `process.env.NODE_ENV` يُستخدَم أيضاً في `next.config.ts` (لتحديد `distDir`) لكنه متغير بيئة قياسي وليس خاصاً بالمشروع، فلم يُدرَج كسطر مستقل أعلاه.

---

## 6. المسارات والصفحات (Routes & pages)

### جدول الصفحات (Pages) — كل الصفحات تحت `src/app/` (16 ملف `page.tsx`)

الدور المسموح مأخوذ من الفحص الفعلي لـ `requireRolePage(...)` في كل `layout.tsx` + `requireRole(...)` داخل كل `page.tsx` نفسه (وليس افتراضاً).

| المسار | الدور المسموح | الغرض |
|---|---|---|
| `/` | عام (لا حراسة، إعادة توجيه) | تعيد التوجيه إلى `/login` |
| `/login` | عام | تسجيل الدخول (Credentials)، مبدّل لغة/ثيم |
| `/register` | عام | تسجيل ذاتي للطالب (حل tenant عبر نطاق البريد) |
| `/unauthorized` | عام (لأي مستخدم مسجَّل دخول برفض دور) | صفحة "لا تملك صلاحية" |
| `/student/status` | `student` | حالة الطلب + الأدوات المفعّلة + موارد الأستاذ |
| `/student/upload` | `student` | رفع وثيقة طبية PDF |
| `/faculty/students` | `faculty`, `admin` | قائمة طلاب المقررات المرتبطة عبر `FacultyCourseLink` |
| `/faculty/upload` | `faculty` فقط (ليس admin — قرار متعمَّد موثَّق في تعليق الملف) | رفع ملف مخصّص لطالب واحد |
| `/specialist/queue` | `specialist`, `admin` | قائمة الطلاب بانتظار المراجعة |
| `/specialist/alerts` | `specialist`, `admin` | معالجة تنبيهات المرشد |
| `/specialist/students/[id]` | `specialist`, `admin` | تفاصيل طالب (وثائق، تقييمات، خطة) |
| `/specialist/students/[id]/assess` | `specialist`, `admin` | **إعادة توجيه فقط** إلى `/review` (مسار قديم مُبقى للتوافق مع روابط محفوظة) |
| `/specialist/students/[id]/plan` | `specialist`, `admin` | **إعادة توجيه فقط** إلى `/review` (نفس السبب) |
| `/specialist/students/[id]/review` | `specialist`, `admin` | شاشة موحّدة: تصنيف + بناء/اعتماد خطة الدعم |
| `/admin/users` | `admin` | إدارة المستخدمين + تعيين المختصين يدوياً |
| `/admin/stats` | `admin` | إحصائيات جامعية + رسم بياني (recharts) |
| `/admin/reports` | `admin` | تصدير تقارير (CSV) |
| `/admin/audit-log` | `admin` | عرض سجل التدقيق الكامل مع فلاتر |

### جدول مسارات الـ API — كل الملفات تحت `src/app/api/**` (14 ملف `route.ts` فعلي)

الطرق (Methods) والدور المطلوب مأخوذان من فحص فعلي لكل ملف (الدوال المُصدَّرة `export async function GET/POST/DELETE` واستدعاءات `requireRole`/`requireMobileRole`/`requireApiRole` داخل كل واحد).

| المسار | الطرق | الدور المطلوب | الغرض |
|---|---|---|---|
| `/api/auth/[...nextauth]` | `GET`, `POST` (من `handlers` الخاصة بـ NextAuth) | عام | يطبّق تدفق تسجيل الدخول/الخروج لجلسة NextAuth نفسها |
| `/api/auth/login` | `POST` | عام (بلا مصادقة مسبقة) | تبادل بريد/كلمة مرور بزوج access/refresh JWT للموبايل |
| `/api/auth/refresh` | `POST` | عام (رمز التحديث نفسه هو بيانات الاعتماد) | إصدار access token جديد من refresh token |
| `/api/documents/upload` | `POST` | Bearer JWT، `student` (موبايل فقط) | رفع وتشفير وثيقة PDF طبية |
| `/api/documents/[id]` | `GET` | مزدوج (JWT موبايل أو جلسة ويب)، `specialist` أو `admin` | تنزيل/فك تشفير وثيقة طبية معيّنة |
| `/api/events` | `POST` | Bearer JWT، `student` (موبايل فقط) | استقبال دفعة أحداث استخدام، محدود بـ rate limit |
| `/api/student/profile` | `GET` | Bearer JWT، `student` (موبايل فقط) | ملف الطالب الأساسي + `enabledTools` + `adaptationDirectives` (بدون تصنيف/مستوى أبداً) |
| `/api/student/support-plan` | `GET` | Bearer JWT، `student` (موبايل فقط) | حالة خطة الدعم المعتمدة + الأدوات المفعّلة |
| `/api/student/faculty-resources` | `GET` | Bearer JWT، `student` (موبايل فقط) | قائمة ملفات الأستاذ الخاصة بالطالب نفسه |
| `/api/student/faculty-resources/[id]/download` | `GET` | مزدوج (JWT موبايل أو جلسة ويب)، `student` | تنزيل ملف أستاذ واحد يخص الطالب المتصل فقط |
| `/api/faculty/resources` | `GET`, `POST` | جلسة ويب، `faculty` فقط | عرض/رفع ملفات مخصّصة لطالب في مقرر |
| `/api/faculty/resources/[id]` | `DELETE` | جلسة ويب، `faculty` فقط | حذف ملف مخصّص (حذف ناعم) |
| `/api/faculty/resources/[id]/download` | `GET` | جلسة ويب، `faculty` فقط | تنزيل ملف رفعه الأستاذ نفسه |
| `/api/admin/export/students` | `GET` | جلسة ويب، `admin` فقط | تصدير CSV لبيانات الطلاب (بدون حقول طبية، بحسب `docs/PLATFORM_STATUS.md`) |

**ملاحظة موثَّقة صراحة في `docs/API.md`**: مسارات اعتماد التنبيه/مراجعة الخطة/تصدير CSV/سجل التدقيق وكل مسارات `FacultyResource` هي مسارات **ويب فقط حالياً** (جلسة NextAuth)، ولا يوجد لها نظير في واجهة الموبايل بعد.

---

## 7. الاختبارات والجودة (Tests & quality)

### ملفات الاختبار
إطار الاختبار: **Vitest** (`vitest.config.mts`, `environment: "node"`). كل الاختبارات **تكاملية فعلياً** — `tests/setup.ts` يحمّل `.env`/`.env.local` الحقيقيين ويتصل بقاعدة Postgres وMinIO المحليتين الفعليتين (وليست اختبارات وحدة معزولة بالكامل)؛ `fileParallelism: false` مضبوط عمداً لأن الاختبارات تتشارك صفوفاً مزروعة في قاعدة بيانات حقيقية.

7 ملفات فعلية تحت `tests/` (`wc -l` فعلي):
- `adaptation.test.ts` (114 سطراً)
- `csv-export.test.ts` (63 سطراً)
- `events.test.ts` (86 سطراً)
- `faculty-resources.test.ts` (215 سطراً)
- `permissions.test.ts` (157 سطراً)
- `helpers.ts` (79 سطراً — مساعدات مشتركة، ليس ملف اختبار)
- `setup.ts` (9 أسطر — إعداد بيئة Vitest)

**لا يوجد أي ملف اختبار Playwright فعلي** رغم أن `@playwright/test` مثبَّت في `devDependencies` — لم يُعثر على أي مجلد/ملف بامتداد اختبار Playwright المعتاد (`*.spec.ts` تحت `e2e/` أو ما شابه) في المشروع.

### نتيجة تشغيل فعلي لـ `npx vitest run` (نُفِّذ في هذه الجلسة)
```
 Test Files  5 passed (5)
      Tests  23 passed (23)
   Duration  34.04s
```
كل الملفات الخمسة نجحت، 23 اختباراً ناجحاً بدون فشل. (تقرير سابق داخلي `docs/FINAL_STATUS_PLATFORM.md` كان يذكر مشكلة `Cannot find module 'next/server'` أدّت لفشل ملفين — هذه المشكلة **غير موجودة حالياً**؛ تم التحقق بالتشغيل الفعلي في هذه الجلسة أن كل الملفات تُحمَّل وتنجح.)

### ESLint / Prettier
- **ESLint**: مُهيَّأ عبر `eslint.config.mjs` (صيغة Flat Config)، يمدّد `eslint-config-next/core-web-vitals` و`eslint-config-next/typescript`، مع تجاهل صريح لـ `.next/**`, `.next-prod/**`, `out/**`, `build/**`, `next-env.d.ts`. تشغيل فعلي لـ `npx eslint .` في هذه الجلسة **لم يُظهر أي تحذير أو خطأ**.
- **Prettier**: **لا يوجد أي ملف إعداد Prettier** (`.prettierrc*`) في جذر المشروع — تم البحث الفعلي ولم يُعثر على شيء.

### `npx tsc --noEmit`
نُفِّذ فعلياً في هذه الجلسة — **exit code 0**، لا أخطاء أنواع.

### `npm run build`
نُفِّذ فعلياً في هذه الجلسة. النتيجة الحرفية:
```
✓ Compiled successfully in 16.5s
Linting and checking validity of types ...
Collecting page data ...
✓ Generating static pages (27/27)

Build error occurred
[Error: ENOENT: no such file or directory, rename
 'D:\Shadow\platform\.next-prod\export\500.html' ->
 'D:\Shadow\platform\.next-prod\server\pages\500.html']
```
**البناء تجميعياً نجح بالكامل (compile ناجح، فحص الأنواع ناجح، توليد الصفحات الثابتة 27/27 ناجح)**، لكن الخطوة الأخيرة من عملية `next build` فشلت بخطأ `ENOENT` أثناء نقل ملف `500.html` — بسبب وجود مجلد `.next-prod` من تشغيل سابق غير مكتمل يتعارض مع محتوى الإخراج الجديد.

**تحديث لاحق (تحقّق مباشر بعد هذا التقرير، بنفس الجلسة)**: تم حذف `.next-prod` فعلياً وإعادة تشغيل `npx next build` من الصفر — **البناء نجح بالكامل 100% بدون أي خطأ**، كل الـ27 مساراً تم توليدها بنجاح تام. هذا يؤكد أن السبب كان فعلاً تعارض مجلد `.next-prod` المتبقي من تشغيل سابق (كما رجّح هذا القسم أصلاً)، وليس عطلاً حقيقياً في الكود. **الخلاصة: `npm run build` ينجح بالكامل على شجرة نظيفة.**

كذلك، أثناء إعداد هذا التقرير وُجدت لحظياً عمليتا `next dev` منفصلتان تعملان بالتوازي على المنفذين 3000 و3001 (إحداهما عملية عالقة تعذّر إيقافها)، مما تسبب في تعارضات عابرة حقيقية شُوهدت في جلسة أخرى من هذه الجلسة (فشل `vitest` الكامل برسالة `Cannot read properties of undefined (reading 'config')`، وفشل `next build` بنفس خطأ الـ`.next-prod`) — تم التحقق أن هذه ليست أعطالاً دائمة في الكود، بل نتاج تعارض عمليات متزامنة على نفس المشروع.

---

## 8. الإحصائيات (Statistics)

عدّ فعلي بأدوات `find`/`wc` في هذه الجلسة:

| المقياس | العدد الفعلي |
|---|---|
| ملفات `.ts` في `src/` | 44 |
| ملفات `.tsx` في `src/` | 58 |
| ملفات اختبار (`.ts` تحت `tests/`) | 7 (5 ملفات اختبار فعلية + `helpers.ts` + `setup.ts`) |
| مجموع أسطر الكود في `src/` (`.ts` + `.tsx`، `wc -l`) | 10,055 سطراً |
| أسطر `prisma/schema.prisma` + `prisma/seed.ts` | 848 سطراً |
| نماذج قاعدة البيانات (models) | 17 |
| Enums | 9 |
| Migrations مُطبَّقة | 6 |
| صفحات (`page.tsx`) | 16 |
| مسارات API (`route.ts`) | 14 |

### Git
هذا مستودع Git فعلي (تم التحقق بـ `git log`/`git status`/`git branch`):
- **الفرع الحالي**: `main`
- **عدد الـ commits**: 80 (`git log --oneline | wc -l`)
- **آخر commit**: `4917b613` — "fix: Card had no real shadow, only a faint ring — login \"no card\" complaint" (بتاريخ Tue Aug 18 2026)
- **حالة working tree**: نظيفة، لا تغييرات غير مُلتزَمة (`git status --short` أعاد ناتجاً فارغاً)

---

## 9. الحالة الحقيقية (Real state)

### ميزات مكتملة **ومُتحقَّق منها** (دليل موثَّق فعلي: اختبارات آلية ناجحة، أو تحقق حي موثَّق في `docs/FINAL_STATUS_PLATFORM.md`)
- تدفق تسجيل الطالب، رفع وثيقة PDF وتشفيرها AES-256-GCM، تخزينها في MinIO، وفك تشفيرها عند التنزيل — موثَّق في `docs/FINAL_STATUS_PLATFORM.md` كـ"مؤكَّد بالاختبار الحي" (تنزيل حي أرجع بايتات `%PDF-1.4` صحيحة).
- عزل الأدوار الأربعة (student/faculty/specialist/admin) على مستوى الكود — 23 اختبار Vitest تكاملي ناجح فعلياً في هذه الجلسة، تغطي `permissions.test.ts`, `faculty-resources.test.ts`, `csv-export.test.ts`, `events.test.ts`, `adaptation.test.ts`.
- `npx tsc --noEmit` نظيف، و`npx eslint .` بلا تحذيرات — تم التحقق مباشرة في هذه الجلسة.
- منطق تحديد نطاق tenant التلقائي (`getTenantScopedPrisma`) مطبَّق في الكود ومُختبَر ضمنياً عبر اختبارات الصلاحيات.

### مبني لكنه **غير مُتحقَّق منه في متصفح حقيقي ضمن هذه الجلسة**
- لم يُشغَّل `npm run dev` ولم تُفتَح أي صفحة فعلياً في متصفح خلال إعداد هذا التقرير — الاستنتاجات كلها من قراءة الكود وتشغيل أوامر CLI (build/test/lint/tsc)، وليس من تصفح حي.
- التكامل مع تطبيق Flutter (`D:\Shadow\app`، مستودع منفصل خارج نطاق هذا الفحص) — موثَّق في `docs/PLATFORM_STATUS.md` كـ"لم يُختبر يدوياً على جهاز/محاكي حقيقي بعد".
- ~~نجاح `npm run build` تجميعياً لكن فشله في خطوة النقل الأخيرة~~ — **مُحدَّث**: تم التحقق لاحقاً بنفس الجلسة أن `npm run build` ينجح بالكامل 100% على شجرة نظيفة بعد حذف `.next-prod` القديم (انظر التحديث في القسم 7). لم يعد هذا بنداً غير مُتحقَّق منه.

### ما هو مُعطَّل عمداً في الكود (بدليل file:line)
- `src/app/specialist/students/[id]/assess/page.tsx` (كامل الملف) — مسار كامل الآن مجرد `redirect()` إلى `/specialist/students/[id]/review`؛ التعليق في الملف يوضّح أنه أُبقي فقط لتفادي كسر روابط محفوظة قديمة، ولم يعد له واجهة فعلية خاصة به.
- `src/app/specialist/students/[id]/plan/page.tsx` (كامل الملف) — نفس الحالة تماماً، إعادة توجيه فقط لنفس السبب.
- لا توجد أي راية ميزة (`feature flag`) بقيمة `false` ولا أي نمط `.skip(`/`.disable` في `src` أو `tests` — تم البحث الفعلي ولم يظهر شيء من هذا النوع.

### بحث شامل عن `TODO`/`FIXME`/`HACK`
تم تنفيذ بحث فعلي عبر `grep -rn "TODO\|FIXME\|HACK"` على `src/`, `prisma/`, `docs/`, `README.md`, `AGENTS.md` — **لم يُعثر على أي نتيجة واحدة**. لا توجد تعليقات TODO/FIXME/HACK في الكود المصدري لهذا المشروع في وقت إعداد التقرير.

### الوثائق الداخلية الموجودة فعلياً — ملخص صادق لمحتواها
- **`README.md`** (10,636 بايت) — دليل إعداد محلي كامل (Docker، متغيرات البيئة، migrations)، جدول حسابات تجريبية، شرح مفصّل لنموذج الصلاحيات، وقسم "Judgment calls" يوثّق 7 قرارات هندسية اتُّخذت أثناء البناء (مثل إضافة `SpecialistAssignment`، حل tenant بالبريد وحده، تثبيت Prisma على v6 بدل v7).
- **`AGENTS.md`** (327 بايت فقط) — تحذير قصير موجَّه لأي وكيل AI بأن نسخة Next.js هذه قد تختلف عن بيانات تدريبه، ويجب قراءة `node_modules/next/dist/docs/` قبل الكتابة.
- **`CLAUDE.md`** (11 بايت) — سطر واحد فقط: `@AGENTS.md` (استيراد مرجعي لملف AGENTS.md، لا محتوى مستقل).
- **`docs/PLATFORM_STATUS.md`** — تقرير حالة داخلي سابق (تاريخ إعداد غير مذكور صراحة كرقم يوم، لكن يذكر أرقاماً مختلفة عن الحالة الحالية: 18 commit، 82 ملف TS/TSX، 16 موديلاً، 9 مسارات API — **هذه أرقام قديمة/تاريخية وليست الحالة الحالية**، إذ تحقّقت هذه الجلسة من أرقام مختلفة فعلياً أعلى بكثير: 80 commit، 102 ملف، 17 موديلاً، 14 مساراً). يحتوي أيضاً على تفصيل صادق لفجوات النشر (لا استضافة، لا SSL، لا نسخ احتياطي، لا مراجعة PDPL قانونية).
- **`docs/FINAL_STATUS_PLATFORM.md`** — تقرير حالة داخلي أحدث من السابق (يذكر 40 commit، 94 ملف TS/TSX، 17 موديلاً — لا يزال أقدم من الحالة الحالية المفحوصة في هذه الجلسة). يوثّق بصراحة عطلاً حرجاً سابقاً (المختص لم يكن يقدر يفتح أي وثيقة من الويب) وإصلاحه، ومشكلة اختبارات كانت قائمة وقتها (`Cannot find module 'next/server'`) — **هذه المشكلة تحديداً تأكَّد في هذه الجلسة أنها لم تعد موجودة** (23/23 اختباراً ناجحة الآن). كما يوثّق أن الوضع الداكن لم يكن مفعَّلاً وقتها — **هذا أيضاً تغيَّر**؛ تم التحقق في هذه الجلسة أن `next-themes` مُركَّب فعلياً في `layout.tsx` مع زر تبديل فعلي.
- **`docs/API.md`** — مرجع API كامل وتفصيلي جداً لكل مسار موجَّه لتطبيق الموبايل (شُرح بالكامل في القسم 6 أعلاه).
- **`SHADOW_PLATFORM_NEXTJS_PROMPT.md`** (في جذر المشروع، 15,808 بايت) — لم تتم قراءته بالكامل في هذه الجلسة (خارج قائمة الأقسام المطلوبة صراحة)؛ يبدو من اسمه أنه موجّه البناء الأصلي (prompt) للمشروع.

**فجوة مهمة موثَّقة داخلياً وتم التحقق من استمرارها فعلياً في هذه الجلسة**: تسجيل الدخول في `src/auth.ts` يحل المستخدم بالبريد الإلكتروني وحده (`prisma.user.findFirst({ where: { email... } })`) بدون أي محدِّد للجامعة (tenant) — **تم التحقق مباشرة من الكود الفعلي في هذه الجلسة أن هذا لا يزال قائماً دون تغيير**. يعني هذا أن المنصة تدعم عملياً جامعة واحدة فقط في تدفق تسجيل الدخول الحالي، رغم أن كل جدول في قاعدة البيانات يحمل `tenantId` ومُهيَّأ بنيوياً لتعدد المؤسسات.

---

## ما لم أستطع التحقق منه

- **محتوى القيم الفعلية في `.env` و`.env.local`** — لم تُقرأ عمداً امتثالاً لقيود التقرير؛ لا يمكن التأكد من صحة/اتساق القيم الفعلية المُستخدَمة محلياً.
- **تشغيل التطبيق فعلياً في متصفح** (`npm run dev` وفتح الصفحات) — لم يُنفَّذ في هذه الجلسة؛ كل ما ورد عن سلوك الواجهة الفعلي في المتصفح (مثل عمل الوضع الداكن بصرياً، أو صحة تدفقات النماذج) مبني على قراءة الكود المصدري فقط، وليس مشاهدة حية.
- ~~سبب دقيق لفشل الخطوة الأخيرة من `npm run build`~~ — **مُحدَّث ومؤكَّد**: تم اختباره لاحقاً بنفس الجلسة، السبب كان فعلاً تعارض `.next-prod` قديماً، والبناء ينجح 100% على شجرة نظيفة.
- **تشغيل تطبيق الموبايل Flutter أو أي فحص لمستودع `D:\Shadow\app`** — خارج نطاق هذه الجلسة بالكامل؛ كل ما وَرَد عنه مأخوذ حرفياً من ما يذكره `docs/PLATFORM_STATUS.md`/`docs/API.md` عن ذلك المستودع، دون تحقق مباشر من كوده.
- **اختبار Playwright فعلي** — الحزمة مثبَّتة لكن لم يُعثر على أي ملف اختبار Playwright قابل للتشغيل؛ لا يمكن الجزم إن كانت هناك نية مستقبلية لاستخدامها لم تُنفَّذ بعد أو أنها تبعية غير مستخدَمة بالكامل.
- **محتوى `src/lib/prisma.ts`، `src/lib/format-date.ts`، `src/lib/utils.ts`، وملفات المكوّنات غير الأساسية** (مثل `nav-items.ts`، `brand-mark.tsx`) — لم تُقرأ سطراً بسطر في هذه الجلسة؛ استيرادها واستخدامها العام مؤكَّد من ملفات أخرى تستوردها، لكن التفاصيل الداخلية الدقيقة لهذه الملفات بالذات لم تُفحص مباشرة.
- **محتوى `SHADOW_PLATFORM_NEXTJS_PROMPT.md` و`docs/Shadow Platform.dc.html` وملفات "Mobile app design directions"** — لم تُقرأ في هذه الجلسة، فقط لوحظ وجودها.
- **دلالة الفارق بين إصدار `next` (^15.5.22) وإصدار `eslint-config-next` (16.2.12)** — لوحظ الفارق الرقمي فقط؛ لم يُفحص ما إذا كان هذا مقصوداً أو تأثيره الفعلي على قواعد الفحص المُطبَّقة.
