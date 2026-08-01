/**
 * Server-side computation of ready-made "adaptation directives" for the
 * Flutter mobile app.
 *
 * WHY THIS FILE EXISTS: the platform's core rule is that a student never
 * receives their own classification/category or support level, not even
 * via API (see docs/API.md, GET /api/student/profile). But the mobile app
 * needs *something* to drive its UI (font sizes, summarization frequency,
 * alert sensitivity, which buttons show, etc.) — previously the app derived
 * all of that itself from a locally-held category+level. This module is the
 * fix: the specialist's Assessment (Condition -> Category, SupportLevel)
 * stays entirely server-side, and this pure function translates it into an
 * OPAQUE, already-decided directive object. The app consumes directives
 * (e.g. "font size 18, auto-summary on"), never the raw category/level that
 * produced them.
 *
 * This is a pure function — no I/O, no Prisma — so it's trivially unit
 * testable and so the caller (the API route) stays in full control of
 * what's fetched from the DB.
 *
 * The full matrix below is a faithful, complete encoding of the two tables
 * in docs/شادو_خطة_التكيف_الشاملة.md ("جدول التكيّف لكل وضع" and "طبقة
 * إضافية: التكيّف حسب التصنيف") — see docs/API.md for the documented JSON
 * shape and a full example.
 */

/** SupportLevel.order in the schema: 1 = light, 2 = medium, 3 = intensive. */
export type SupportLevelOrder = 1 | 2 | 3;

/** Category.code values as seeded in prisma/seed.ts. */
export type CategoryCode =
  | "NEURODEVELOPMENTAL"
  | "LEARNING_DIFFICULTIES"
  | "MILD_COGNITIVE"
  | "COMMUNICATION_LANGUAGE"
  | "BEHAVIORAL_EMOTIONAL";

// ─────────────────────── Mode 1: Deaf / hard-of-hearing ───────────────────────

export type DeafDisplayedTextStyle =
  | "continuous_punctuated" // light
  | "auto_summary_every_5min" // medium
  | "short_sentences_summary_every_2min_highlight_hard_terms"; // intensive

export type DeafHardTermHandling =
  | "none" // light
  | "mark_only" // medium
  | "mark_and_simplified_explanation_on_tap"; // intensive

export type DeafPostLectureOutput =
  | "full_text" // light
  | "text_and_bullet_summary" // medium
  | "text_and_summary_and_auto_review_questions"; // intensive

export type DeafMentorAlert =
  | "none" // light
  | "weekly_report" // medium
  | "immediate_if_3_consecutive_lectures_unopened"; // intensive

export interface DeafModeDirectives {
  displayedTextStyle: DeafDisplayedTextStyle;
  defaultFontSize: 16 | 18 | 22;
  hardTermHandling: DeafHardTermHandling;
  postLectureOutput: DeafPostLectureOutput;
  mentorAlert: DeafMentorAlert;
}

// ─────────────────────── Mode 2: Visual assistance ───────────────────────

export type VisualImageDescriptionStyle =
  | "one_concise_paragraph" // light
  | "structured_broken_into_elements" // medium
  | "short_sequential_sentences_most_important_first"; // intensive

export type VisualReadAloudSpeed =
  | "normal" // light
  | "minus_20_percent" // medium
  | "minus_40_percent_auto_repeat_on_finish"; // intensive

export type VisualFollowUpQuestion =
  | "none" // light
  | "want_more_detail" // medium
  | "clear_after_every_2_sentences"; // intensive

export type VisualMentorAlert =
  | "none" // light
  | "weekly_report" // medium
  | "immediate_if_same_image_requested_more_than_3_times"; // intensive

export interface VisualModeDirectives {
  imageDescriptionStyle: VisualImageDescriptionStyle;
  readAloudSpeed: VisualReadAloudSpeed;
  followUpQuestion: VisualFollowUpQuestion;
  mentorAlert: VisualMentorAlert;
}

// ─────────────────────── Mode 3: Learning difficulties ───────────────────────

export type LearningSummarizeOutput =
  | "brief_paragraph" // light
  | "bulleted_one_point_per_idea" // medium
  | "very_short_sentences_one_idea_per_line_with_icons"; // intensive

export type LearningSimplifyOutput =
  | "light_rephrase" // light
  | "full_easier_language_rephrase" // medium
  | "max_simplification_daily_life_examples_idea_repeated_two_ways"; // intensive

export type LearningReviewQuestionsOutput =
  | "three_analytical" // light
  | "five_graduated" // medium
  | "five_easy_with_model_simplified_answers"; // intensive

export type LearningMentorAlert =
  | "none" // light
  | "weekly_report" // medium
  | "immediate_if_simplify_used_more_than_5_times_on_same_file"; // intensive

export interface LearningModeDirectives {
  summarizeButtonOutput: LearningSummarizeOutput;
  simplifyButtonOutput: LearningSimplifyOutput;
  reviewQuestionsButtonOutput: LearningReviewQuestionsOutput;
  defaultFontSize: 14 | 18 | 22;
  mentorAlert: LearningMentorAlert;
}

// ─────────────────────── Mode 4: Physical / motor ───────────────────────

export type PhysicalVoiceCommandHandling =
  | "execute_directly" // light
  | "repeat_then_execute" // medium
  | "repeat_and_confirm_then_execute"; // intensive

export type PhysicalQuickContactButtonSize =
  | "normal" // light
  | "large" // medium
  | "extra_large_with_direct_home_screen_access"; // intensive

export type PhysicalMentorAlert =
  | "none" // light
  | "weekly_report" // medium
  | "immediate_if_quick_contact_used_more_than_2_times_per_day"; // intensive

export interface PhysicalModeDirectives {
  voiceCommandHandling: PhysicalVoiceCommandHandling;
  quickContactButtonSize: PhysicalQuickContactButtonSize;
  listeningDurationSeconds: 3 | 5 | 8;
  /**
   * Judgment call: the plan doc attaches "tolerates stutter" to the 8-second
   * (intensive) listening duration specifically, not to all three levels —
   * so this is only true at intensive, false at light/medium.
   */
  tolerantOfStutter: boolean;
  mentorAlert: PhysicalMentorAlert;
}

// ─────────────────────── Category layer (additive, on top of mode) ───────────────────────

export interface CategoryLayerDirectives {
  // Neurodevelopmental (autism / ADHD)
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
  /** Only non-empty for the communication/language category. */
  readyMadePhrasesForFacultyMessaging: string[];
  // Behavioral & emotional disorders
  reassuringTone: boolean;
  hidesFailureWording: boolean;
  gentleAlternativePhrasing: boolean;
  suppressesRepeatedAnnoyingAlerts: boolean;
}

export interface AdaptationDirectives {
  mode: {
    deafMode: DeafModeDirectives;
    visualMode: VisualModeDirectives;
    learningMode: LearningModeDirectives;
    physicalMode: PhysicalModeDirectives;
  };
  categoryLayer: CategoryLayerDirectives;
}

// ─────────────────────── Level-axis tables (one entry per mode) ───────────────────────

const DEAF_BY_LEVEL: Record<SupportLevelOrder, DeafModeDirectives> = {
  1: {
    displayedTextStyle: "continuous_punctuated",
    defaultFontSize: 16,
    hardTermHandling: "none",
    postLectureOutput: "full_text",
    mentorAlert: "none",
  },
  2: {
    displayedTextStyle: "auto_summary_every_5min",
    defaultFontSize: 18,
    hardTermHandling: "mark_only",
    postLectureOutput: "text_and_bullet_summary",
    mentorAlert: "weekly_report",
  },
  3: {
    displayedTextStyle: "short_sentences_summary_every_2min_highlight_hard_terms",
    defaultFontSize: 22,
    hardTermHandling: "mark_and_simplified_explanation_on_tap",
    postLectureOutput: "text_and_summary_and_auto_review_questions",
    mentorAlert: "immediate_if_3_consecutive_lectures_unopened",
  },
};

const VISUAL_BY_LEVEL: Record<SupportLevelOrder, VisualModeDirectives> = {
  1: {
    imageDescriptionStyle: "one_concise_paragraph",
    readAloudSpeed: "normal",
    followUpQuestion: "none",
    mentorAlert: "none",
  },
  2: {
    imageDescriptionStyle: "structured_broken_into_elements",
    readAloudSpeed: "minus_20_percent",
    followUpQuestion: "want_more_detail",
    mentorAlert: "weekly_report",
  },
  3: {
    imageDescriptionStyle: "short_sequential_sentences_most_important_first",
    readAloudSpeed: "minus_40_percent_auto_repeat_on_finish",
    followUpQuestion: "clear_after_every_2_sentences",
    mentorAlert: "immediate_if_same_image_requested_more_than_3_times",
  },
};

const LEARNING_BY_LEVEL: Record<SupportLevelOrder, LearningModeDirectives> = {
  1: {
    summarizeButtonOutput: "brief_paragraph",
    simplifyButtonOutput: "light_rephrase",
    reviewQuestionsButtonOutput: "three_analytical",
    defaultFontSize: 14,
    mentorAlert: "none",
  },
  2: {
    summarizeButtonOutput: "bulleted_one_point_per_idea",
    simplifyButtonOutput: "full_easier_language_rephrase",
    reviewQuestionsButtonOutput: "five_graduated",
    defaultFontSize: 18,
    mentorAlert: "weekly_report",
  },
  3: {
    summarizeButtonOutput: "very_short_sentences_one_idea_per_line_with_icons",
    simplifyButtonOutput: "max_simplification_daily_life_examples_idea_repeated_two_ways",
    reviewQuestionsButtonOutput: "five_easy_with_model_simplified_answers",
    defaultFontSize: 22,
    mentorAlert: "immediate_if_simplify_used_more_than_5_times_on_same_file",
  },
};

const PHYSICAL_BY_LEVEL: Record<SupportLevelOrder, PhysicalModeDirectives> = {
  1: {
    voiceCommandHandling: "execute_directly",
    quickContactButtonSize: "normal",
    listeningDurationSeconds: 3,
    tolerantOfStutter: false,
    mentorAlert: "none",
  },
  2: {
    voiceCommandHandling: "repeat_then_execute",
    quickContactButtonSize: "large",
    listeningDurationSeconds: 5,
    tolerantOfStutter: false,
    mentorAlert: "weekly_report",
  },
  3: {
    voiceCommandHandling: "repeat_and_confirm_then_execute",
    quickContactButtonSize: "extra_large_with_direct_home_screen_access",
    listeningDurationSeconds: 8,
    tolerantOfStutter: true,
    mentorAlert: "immediate_if_quick_contact_used_more_than_2_times_per_day",
  },
};

const CATEGORY_LAYER_DEFAULTS: CategoryLayerDirectives = {
  reducesNotifications: false,
  hidesNonEssentialVisualElements: false,
  maxOneInteractiveElementPerScreen: false,
  calmColorPalette: false,
  autoSummarizesEverywhere: false,
  repeatsIdeasTwoWays: false,
  ttsSupportEverywhere: false,
  oneStepAtATime: false,
  confirmAfterEveryStep: false,
  dailyLifeExamplesInsteadOfDefinitions: false,
  simplerUiLanguage: false,
  autoRephrasing: false,
  readyMadePhrasesForFacultyMessaging: [],
  reassuringTone: false,
  hidesFailureWording: false,
  gentleAlternativePhrasing: false,
  suppressesRepeatedAnnoyingAlerts: false,
};

const CATEGORY_LAYER_OVERRIDES: Record<CategoryCode, Partial<CategoryLayerDirectives>> = {
  NEURODEVELOPMENTAL: {
    reducesNotifications: true,
    hidesNonEssentialVisualElements: true,
    maxOneInteractiveElementPerScreen: true,
    calmColorPalette: true,
  },
  LEARNING_DIFFICULTIES: {
    autoSummarizesEverywhere: true,
    repeatsIdeasTwoWays: true,
    ttsSupportEverywhere: true,
  },
  MILD_COGNITIVE: {
    oneStepAtATime: true,
    confirmAfterEveryStep: true,
    dailyLifeExamplesInsteadOfDefinitions: true,
  },
  COMMUNICATION_LANGUAGE: {
    simplerUiLanguage: true,
    autoRephrasing: true,
    readyMadePhrasesForFacultyMessaging: ["اطلب تمديد المهلة", "اسأل عن موعد المكتب المفتوح", "اطلب توضيح المطلوب"],
  },
  BEHAVIORAL_EMOTIONAL: {
    reassuringTone: true,
    hidesFailureWording: true,
    gentleAlternativePhrasing: true,
    suppressesRepeatedAnnoyingAlerts: true,
  },
};

/**
 * Pure function: (category, support level) -> ready-made directives.
 * Never called with, and never returns, the raw category/level values
 * themselves — the caller (the API route) is responsible for never
 * including those in the response alongside this object.
 */
export function computeAdaptationDirectives(
  categoryCode: CategoryCode,
  supportLevelOrder: SupportLevelOrder
): AdaptationDirectives {
  return {
    mode: {
      deafMode: DEAF_BY_LEVEL[supportLevelOrder],
      visualMode: VISUAL_BY_LEVEL[supportLevelOrder],
      learningMode: LEARNING_BY_LEVEL[supportLevelOrder],
      physicalMode: PHYSICAL_BY_LEVEL[supportLevelOrder],
    },
    categoryLayer: {
      ...CATEGORY_LAYER_DEFAULTS,
      ...CATEGORY_LAYER_OVERRIDES[categoryCode],
    },
  };
}

/** Default directives for a student with no assessment yet (mildest/safest defaults, light level, no category layer). */
export function defaultAdaptationDirectives(): AdaptationDirectives {
  return {
    mode: {
      deafMode: DEAF_BY_LEVEL[1],
      visualMode: VISUAL_BY_LEVEL[1],
      learningMode: LEARNING_BY_LEVEL[1],
      physicalMode: PHYSICAL_BY_LEVEL[1],
    },
    categoryLayer: { ...CATEGORY_LAYER_DEFAULTS },
  };
}
