/**
 * Fixed, hardcoded catalogue of accessibility-tool codes.
 *
 * This list is a CONTRACT between this platform and the separate Flutter
 * mobile app: the app switches on these exact string codes to decide which
 * of its own features to enable for a given student. It intentionally
 * mirrors the Prisma `ToolCode` enum in prisma/schema.prisma — the two must
 * be kept in sync by hand, on purpose, because:
 *   - it must NOT be admin-editable free text (a typo would silently break
 *     the mobile app for a real student), and
 *   - adding a new tool always requires a coordinated backend + mobile
 *     release, never a database-only change.
 *
 * The Flutter app owns its own copy of this same list (outside this repo).
 */
export const TOOL_CODES = [
  "REMINDER_MODE",
  "FOCUS_MODE",
  "EXTRA_TIME_TRACKER",
  "SIMPLIFIED_UI",
  "TEXT_TO_SPEECH",
  "SPEECH_TO_TEXT",
  "VISUAL_SCHEDULE",
  "CALM_MODE",
] as const;

export type ToolCodeValue = (typeof TOOL_CODES)[number];

export const TOOL_CODE_LABELS: Record<ToolCodeValue, { ar: string; en: string; description: string }> = {
  REMINDER_MODE: {
    ar: "وضع التذكير",
    en: "Reminder Mode",
    description: "تذكيرات بالمهام والمواعيد النهائية داخل التطبيق",
  },
  FOCUS_MODE: {
    ar: "وضع التركيز",
    en: "Focus Mode",
    description: "تقليل المشتتات والإشعارات داخل التطبيق",
  },
  EXTRA_TIME_TRACKER: {
    ar: "متتبع الوقت الإضافي",
    en: "Extra Time Tracker",
    description: "تفعيل ومتابعة الوقت الإضافي المعتمد للاختبارات والواجبات",
  },
  SIMPLIFIED_UI: {
    ar: "واجهة مبسّطة",
    en: "Simplified UI",
    description: "تقليل التعقيد البصري وتبسيط التنقل داخل التطبيق",
  },
  TEXT_TO_SPEECH: {
    ar: "تحويل النص إلى كلام",
    en: "Text to Speech",
    description: "قراءة النصوص الظاهرة على الشاشة صوتياً",
  },
  SPEECH_TO_TEXT: {
    ar: "تحويل الكلام إلى نص",
    en: "Speech to Text",
    description: "إدخال الكلام بدلاً من الكتابة",
  },
  VISUAL_SCHEDULE: {
    ar: "جدول بصري",
    en: "Visual Schedule",
    description: "جدول خطوات بصري لدعم التنظيم اليومي",
  },
  CALM_MODE: {
    ar: "وضع الهدوء",
    en: "Calm Mode",
    description: "أدوات لتقليل القلق داخل التطبيق",
  },
};
