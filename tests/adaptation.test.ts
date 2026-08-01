import { describe, it, expect } from "vitest";
import { computeAdaptationDirectives, defaultAdaptationDirectives } from "@/lib/adaptation";

describe("computeAdaptationDirectives — faithful encoding of the adaptation matrix", () => {
  it("light level (order 1) produces the lightest directives for every mode", () => {
    const d = computeAdaptationDirectives("NEURODEVELOPMENTAL", 1);
    expect(d.mode.deafMode).toEqual({
      displayedTextStyle: "continuous_punctuated",
      defaultFontSize: 16,
      hardTermHandling: "none",
      postLectureOutput: "full_text",
      mentorAlert: "none",
    });
    expect(d.mode.visualMode.readAloudSpeed).toBe("normal");
    expect(d.mode.learningMode.defaultFontSize).toBe(14);
    expect(d.mode.physicalMode.listeningDurationSeconds).toBe(3);
    expect(d.mode.physicalMode.tolerantOfStutter).toBe(false);
  });

  it("intensive level (order 3) produces the most intensive directives for every mode", () => {
    const d = computeAdaptationDirectives("LEARNING_DIFFICULTIES", 3);
    expect(d.mode.deafMode).toEqual({
      displayedTextStyle: "short_sentences_summary_every_2min_highlight_hard_terms",
      defaultFontSize: 22,
      hardTermHandling: "mark_and_simplified_explanation_on_tap",
      postLectureOutput: "text_and_summary_and_auto_review_questions",
      mentorAlert: "immediate_if_3_consecutive_lectures_unopened",
    });
    expect(d.mode.visualMode.mentorAlert).toBe("immediate_if_same_image_requested_more_than_3_times");
    expect(d.mode.learningMode).toEqual({
      summarizeButtonOutput: "very_short_sentences_one_idea_per_line_with_icons",
      simplifyButtonOutput: "max_simplification_daily_life_examples_idea_repeated_two_ways",
      reviewQuestionsButtonOutput: "five_easy_with_model_simplified_answers",
      defaultFontSize: 22,
      mentorAlert: "immediate_if_simplify_used_more_than_5_times_on_same_file",
    });
    expect(d.mode.physicalMode).toEqual({
      voiceCommandHandling: "repeat_and_confirm_then_execute",
      quickContactButtonSize: "extra_large_with_direct_home_screen_access",
      listeningDurationSeconds: 8,
      tolerantOfStutter: true,
      mentorAlert: "immediate_if_quick_contact_used_more_than_2_times_per_day",
    });
  });

  it("medium level (order 2) is the documented middle tier, not just an average", () => {
    const d = computeAdaptationDirectives("MILD_COGNITIVE", 2);
    expect(d.mode.deafMode.displayedTextStyle).toBe("auto_summary_every_5min");
    expect(d.mode.visualMode.followUpQuestion).toBe("want_more_detail");
    expect(d.mode.learningMode.simplifyButtonOutput).toBe("full_easier_language_rephrase");
    expect(d.mode.physicalMode.quickContactButtonSize).toBe("large");
  });

  it("category layer applies ONLY the flags for the given category, all others false", () => {
    const neuro = computeAdaptationDirectives("NEURODEVELOPMENTAL", 2).categoryLayer;
    expect(neuro.reducesNotifications).toBe(true);
    expect(neuro.hidesNonEssentialVisualElements).toBe(true);
    expect(neuro.maxOneInteractiveElementPerScreen).toBe(true);
    expect(neuro.calmColorPalette).toBe(true);
    // Nothing from other categories should be true.
    expect(neuro.autoSummarizesEverywhere).toBe(false);
    expect(neuro.oneStepAtATime).toBe(false);
    expect(neuro.simplerUiLanguage).toBe(false);
    expect(neuro.reassuringTone).toBe(false);
    expect(neuro.readyMadePhrasesForFacultyMessaging).toEqual([]);

    const comm = computeAdaptationDirectives("COMMUNICATION_LANGUAGE", 1).categoryLayer;
    expect(comm.simplerUiLanguage).toBe(true);
    expect(comm.autoRephrasing).toBe(true);
    expect(comm.readyMadePhrasesForFacultyMessaging.length).toBeGreaterThan(0);
    expect(comm.reducesNotifications).toBe(false);

    const behavioral = computeAdaptationDirectives("BEHAVIORAL_EMOTIONAL", 3).categoryLayer;
    expect(behavioral.reassuringTone).toBe(true);
    expect(behavioral.hidesFailureWording).toBe(true);
    expect(behavioral.gentleAlternativePhrasing).toBe(true);
    expect(behavioral.suppressesRepeatedAnnoyingAlerts).toBe(true);
    expect(behavioral.autoSummarizesEverywhere).toBe(false);

    const learning = computeAdaptationDirectives("LEARNING_DIFFICULTIES", 1).categoryLayer;
    expect(learning.autoSummarizesEverywhere).toBe(true);
    expect(learning.repeatsIdeasTwoWays).toBe(true);
    expect(learning.ttsSupportEverywhere).toBe(true);
    expect(learning.reducesNotifications).toBe(false);

    const mildCognitive = computeAdaptationDirectives("MILD_COGNITIVE", 1).categoryLayer;
    expect(mildCognitive.oneStepAtATime).toBe(true);
    expect(mildCognitive.confirmAfterEveryStep).toBe(true);
    expect(mildCognitive.dailyLifeExamplesInsteadOfDefinitions).toBe(true);
    expect(mildCognitive.reducesNotifications).toBe(false);
  });

  it("the mode-axis directives are entirely independent of category (additive, not multiplicative)", () => {
    const a = computeAdaptationDirectives("NEURODEVELOPMENTAL", 2).mode;
    const b = computeAdaptationDirectives("BEHAVIORAL_EMOTIONAL", 2).mode;
    expect(a).toEqual(b);
  });

  it("never returns the raw category code or level anywhere in its own shape", () => {
    const d = computeAdaptationDirectives("NEURODEVELOPMENTAL", 3);
    const serialized = JSON.stringify(d);
    expect(serialized).not.toContain("NEURODEVELOPMENTAL");
    expect(serialized).not.toMatch(/\bcategory\b/i);
    expect(serialized).not.toMatch(/\bsupportLevel\b/i);
  });

  it("defaultAdaptationDirectives matches the light-level, no-category-layer shape", () => {
    const d = defaultAdaptationDirectives();
    expect(d.mode.deafMode.defaultFontSize).toBe(16);
    expect(Object.values(d.categoryLayer).every((v) => v === false || (Array.isArray(v) && v.length === 0))).toBe(
      true
    );
  });
});
