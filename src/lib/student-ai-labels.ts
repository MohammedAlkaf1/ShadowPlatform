import type { AdaptationDirectives, CategoryCode, SupportLevelOrder } from "./adaptation";

/**
 * Category/support-level LABEL derivation for the student-facing Gemini
 * system prompts in ai.ts (visual assistance, learning support).
 *
 * Ported 1:1 from the Flutter app's lib/services/adaptive_prompts.dart
 * (`_categoryArabicLabel`/`_categoryEnglishLabel`/`_levelArabicLabel`/
 * `_levelEnglishLabel`), which is being retired now that these prompts are
 * built server-side instead of on-device. This is a pure label mapping —
 * the actual category/supportLevel never leaves the server (same rule as
 * GET /api/student/profile and computeAdaptationDirectives), only these
 * already-decided, non-diagnostic label strings are interpolated into the
 * Gemini system prompt text.
 *
 * Faithfully preserves one quirk from the Dart source: the "level" label is
 * always derived from `learningMode.defaultFontSize`, even when building
 * the VISUAL prompt (not `visualMode`) — this isn't a bug in the port, the
 * original Dart code does the same (adaptive_prompts.dart's
 * `_levelArabicLabel` is shared by both prompt builders and only ever reads
 * `directives.learningMode.defaultFontSize`).
 */
export function levelLabel(directives: AdaptationDirectives, language: "ar" | "en"): string {
  const fontSize = directives.mode.learningMode.defaultFontSize;
  if (language === "en") {
    if (fontSize === 14) return "Light support";
    if (fontSize === 18) return "Moderate support";
    return "Intensive support";
  }
  if (fontSize === 14) return "دعم خفيف";
  if (fontSize === 18) return "دعم متوسط";
  return "دعم مكثف";
}

export function categoryLabel(
  directives: AdaptationDirectives,
  fallbackCategoryCode: CategoryCode,
  language: "ar" | "en"
): string {
  const layer = directives.categoryLayer;

  if (layer.reducesNotifications || layer.hidesNonEssentialVisualElements) {
    return language === "en" ? "Neurodevelopmental disorders" : "اضطرابات النمو العصبي";
  }
  if (layer.autoSummarizesEverywhere || layer.repeatsIdeasTwoWays) {
    return language === "en" ? "Learning difficulties" : "صعوبات التعلم";
  }
  if (layer.oneStepAtATime || layer.confirmAfterEveryStep) {
    return language === "en" ? "Mild cognitive disabilities" : "الإعاقات الإدراكية الخفيفة";
  }
  if (layer.simplerUiLanguage || layer.autoRephrasing) {
    return language === "en" ? "Communication and language disorders" : "اضطرابات التواصل واللغة";
  }
  if (layer.reassuringTone || layer.hidesFailureWording) {
    return language === "en" ? "Behavioral and emotional disorders" : "الاضطرابات السلوكية والانفعالية";
  }

  // No category-layer flag set — fall back to the raw category code's
  // default label (mirrors the Dart fallback to `profile.category.*Label`).
  const fallback: Record<CategoryCode, { ar: string; en: string }> = {
    NEURODEVELOPMENTAL: { ar: "اضطرابات النمو العصبي", en: "Neurodevelopmental disorders" },
    LEARNING_DIFFICULTIES: { ar: "صعوبات التعلم", en: "Learning difficulties" },
    MILD_COGNITIVE: { ar: "الإعاقات الإدراكية الخفيفة", en: "Mild cognitive disabilities" },
    COMMUNICATION_LANGUAGE: { ar: "اضطرابات التواصل واللغة", en: "Communication and language disorders" },
    BEHAVIORAL_EMOTIONAL: { ar: "الاضطرابات السلوكية والانفعالية", en: "Behavioral and emotional disorders" },
  };
  return fallback[fallbackCategoryCode][language];
}

/** Support level order (1/2/3) -> sentence count for the deaf-mode transcript auto-summary, ported from AutoSummaryService._sentenceCountFor. */
export function autoSummarySentenceCount(supportLevelOrder: SupportLevelOrder): number {
  return supportLevelOrder === 3 ? 3 : 2;
}
