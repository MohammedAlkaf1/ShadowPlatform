/**
 * Canonical Privacy Policy copy — English and Arabic.
 *
 * Source of truth: D:\Shadow\app\lib\pages\settings\privacy_policy_screen.dart
 * (the Flutter app's Settings > Privacy Policy screen, last revised
 * 2026-09-10). Copied verbatim from that file's `_englishPolicy` /
 * `_arabicPolicy` constants — do not edit the wording here without also
 * updating the Flutter source (and vice versa), since both are meant to be
 * the same approved legal text. `src/app/privacy/policy-body.tsx` handles
 * turning this plain text into headings/paragraphs/lists for the web page;
 * no wording was changed to do that.
 */

export const PRIVACY_POLICY_EN = `Shadow — Privacy Policy

Last updated: 2026-09-10

This screen describes what Shadow ("the app") and its companion platform
actually collect and process. It is written to reflect the current
implementation, not a generic template.

1. Data we collect
• Account information: the email address you sign in with, and an
  authentication session (a short-lived access token kept only in memory,
  and — only if you enable "remember me" — a longer-lived refresh token
  stored in your device's secure keystore, never in plain text).
• Profile/adaptation data: accessibility preferences and support settings
  associated with your account, fetched from the platform and cached
  on-device so the app keeps working offline.
• Usage-event telemetry: small, non-identifying interaction records (e.g.
  which accessibility mode was used) queued on-device and sent to the
  platform in batches. This telemetry specifically never includes
  transcript text, audio, or documents — see "Voice Exam" below for a
  separate feature that does send audio.
• Locally-saved settings: language, font size, theme, and transcript
  retention preference. These stay on your device.

2. AI / third-party processing
Certain accessibility features (real-time speech-to-text for the
deaf/hard-of-hearing mode, and image/document understanding for the
learning-support mode) send audio, images, or document content you provide
to third-party AI providers (Deepgram for speech-to-text, Google Gemini for
vision/text) to generate a response. This only happens when you actively
use those features, and you are asked to consent before first use. Live
transcription audio, captured images, and document/PDF content are sent
for processing and then discarded by the app — the app itself does not
write this content to storage on your device or keep it after the response
is generated. These providers process the content under their own privacy
terms; Shadow does not control, and makes no claim about, how long
Deepgram or Gemini themselves retain content on their servers.

3. Voice Exam feature
The voice-driven exam mode sends the student's selected answer for each
question to the Shadow platform. If you use the voice-confirmation step
(repeating your answer back before submitting), a short spoken audio clip
of that confirmation is also sent to the platform as part of submitting
your answer. This app does not control, and makes no claim about, how long
the platform retains exam answers or confirmation audio — that is governed
by the platform/your institution, not this app.

4. Storage & retention
• Saved transcripts are stored on-device, with a retention period you
  control in Settings (default 30 days).
• Authentication credentials use platform-appropriate secure storage
  (Android Keystore-backed encrypted storage / iOS Keychain), never plain
  SharedPreferences.
• We do not maintain a separate analytics/tracking SDK in this app.

5. Your rights
• You can sign out at any time, which clears your session and any
  remembered login from the device.
• You can clear saved transcripts from Settings.
• You can withdraw AI consent; features that require it will stop working
  until you re-consent.
• To request deletion of your platform account/data, contact your
  institution's Shadow platform administrator.

6. Security practices
• All platform API traffic requires HTTPS in production builds — a release
  build refuses to run against a non-HTTPS or development endpoint.
• Access tokens are never persisted to disk; refresh tokens and saved
  credentials use encrypted, OS-level secure storage.
• We do not log passwords, tokens, or API keys.

7. Children / minors
Shadow is designed for university students and is not intended to be
directed at children.

8. Contact
For privacy questions, contact your institution's Shadow platform
administrator, or open an issue on the app's repository:
https://github.com/MohammedAlkaf1/SHADOW

Note: this policy describes the app's technical data handling. It is not a
substitute for your institution's own data-protection/legal policy, which
governs the platform account itself.
`;

export const PRIVACY_POLICY_AR = `شادو — سياسة الخصوصية

آخر تحديث: 2026-09-10

يوضّح هذا القسم ما يجمعه تطبيق "شادو" والمنصة المرتبطة به فعليًا، بناءً على
التنفيذ الحالي للتطبيق وليس نصًا عامًا.

١. البيانات التي نجمعها
• معلومات الحساب: البريد الإلكتروني الذي تسجّل الدخول به، وجلسة مصادقة (رمز
  وصول قصير الأمد يُحفظ في الذاكرة فقط، ورمز تجديد أطول أمدًا — فقط إن
  فعّلت "تذكرني" — يُحفظ في التخزين الآمن للجهاز، وليس كنص عادي أبدًا).
• بيانات الملف الشخصي والتكيّف: تفضيلات إمكانية الوصول وإعدادات الدعم
  المرتبطة بحسابك، تُجلب من المنصة وتُخزّن محليًا ليستمر عمل التطبيق دون
  اتصال بالإنترنت.
• بيانات استخدام تحليلية: سجلات تفاعل صغيرة وغير مُعرِّفة للهوية (مثل أي وضع
  إمكانية وصول استُخدم) تُجمّع على الجهاز وتُرسل للمنصة على دفعات. هذه
  البيانات التحليلية تحديدًا لا تشمل أبدًا نص النسخ الصوتي أو الصوت أو
  المستندات — انظر قسم "الاختبار الصوتي" أدناه بخصوص ميزة منفصلة تُرسل صوتًا
  فعليًا.
• الإعدادات المحفوظة محليًا: اللغة، حجم الخط، المظهر، ومدة الاحتفاظ بالنسخ
  الصوتية. تبقى هذه على جهازك فقط.

٢. الذكاء الاصطناعي ومعالجة الطرف الثالث
بعض ميزات إمكانية الوصول (تحويل الكلام إلى نص الفوري لوضع الصم وضعاف
السمع، وفهم الصور/المستندات لوضع الدعم التعليمي) ترسل الصوت أو الصور أو
محتوى المستندات التي تقدمها إلى مزودي ذكاء اصطناعي من طرف ثالث (Deepgram
لتحويل الكلام إلى نص، وGoogle Gemini للرؤية والنص) لإنشاء استجابة. يحدث هذا
فقط عند استخدامك الفعلي لهذه الميزات، وستُسأل عن الموافقة قبل أول استخدام.
يُرسَل صوت النسخ الحي والصور الملتقطة ومحتوى المستندات/PDF للمعالجة ثم
يُتجاهَل من قبل التطبيق — لا يكتب التطبيق نفسه هذا المحتوى إلى تخزين على
جهازك ولا يحتفظ به بعد إنشاء الاستجابة. يعالج هؤلاء المزودون المحتوى وفق
سياسات الخصوصية الخاصة بهم؛ لا يتحكم شادو، ولا يُقدّم أي ادّعاء، بخصوص مدة
احتفاظ Deepgram أو Gemini بالمحتوى على خوادمهم.

٣. ميزة الاختبار الصوتي
يرسل وضع الاختبار الصوتي إجابة الطالب المختارة لكل سؤال إلى منصة شادو. إذا
استخدمت خطوة "التأكيد الصوتي" (تكرار إجابتك قبل إرسالها)، يُرسَل أيضًا مقطع
صوتي قصير لهذا التأكيد إلى المنصة كجزء من إرسال إجابتك. لا يتحكم هذا
التطبيق، ولا يُقدّم أي ادّعاء، بخصوص مدة احتفاظ المنصة بإجابات الاختبار أو
مقاطع التأكيد الصوتي — يخضع ذلك لمنصة/مؤسستك، وليس لهذا التطبيق.

٤. التخزين والاحتفاظ بالبيانات
• تُخزَّن النسخ الصوتية المحفوظة على الجهاز، بمدة احتفاظ تتحكم بها من
  الإعدادات (٣٠ يومًا افتراضيًا).
• تستخدم بيانات المصادقة تخزينًا آمنًا مناسبًا للمنصة (تخزين مشفّر مدعوم من
  Android Keystore أو iOS Keychain)، وليس أبدًا SharedPreferences العادي.
• لا يحتوي هذا التطبيق على أداة تحليلات/تتبع منفصلة.

٥. حقوقك
• يمكنك تسجيل الخروج في أي وقت، مما يمسح جلستك وأي بيانات دخول محفوظة من
  الجهاز.
• يمكنك مسح النسخ الصوتية المحفوظة من الإعدادات.
• يمكنك سحب موافقتك على الذكاء الاصطناعي؛ ستتوقف الميزات التي تتطلبها حتى
  تُوافق مجددًا.
• لطلب حذف حسابك/بياناتك على المنصة، تواصل مع مسؤول منصة شادو في مؤسستك.

٦. ممارسات الأمان
• تتطلب جميع اتصالات واجهة برمجة تطبيقات المنصة HTTPS في إصدارات الإنتاج —
  ترفض نسخة الإصدار العمل مع نقطة نهاية غير HTTPS أو نقطة تطوير.
• لا تُحفظ رموز الوصول على القرص أبدًا؛ تستخدم رموز التجديد وبيانات الدخول
  المحفوظة تخزينًا آمنًا مشفّرًا على مستوى نظام التشغيل.
• لا نسجّل كلمات المرور أو الرموز أو مفاتيح الواجهة البرمجية.

٧. الأطفال / القُصّر
شادو مصمَّم لطلاب الجامعات، وليس موجَّهًا للأطفال.

٨. التواصل
لأي استفسارات تتعلق بالخصوصية، تواصل مع مسؤول منصة شادو في مؤسستك، أو افتح
تذكرة (issue) في مستودع التطبيق:
https://github.com/MohammedAlkaf1/SHADOW

ملاحظة: تصف هذه السياسة التعامل التقني للتطبيق مع البيانات، وهي ليست بديلاً
عن سياسة حماية البيانات القانونية الخاصة بمؤسستك، والتي تحكم حساب المنصة
نفسه.
`;
