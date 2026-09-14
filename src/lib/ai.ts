import { GoogleGenAI, Type, HarmCategory, HarmBlockThreshold } from "@google/genai";
import { categoryLabel, levelLabel } from "./student-ai-labels";
import type { AdaptationDirectives, CategoryCode } from "./adaptation";

/**
 * ══════════════════════════════════════════════════════════════════════
 * EXPLICIT, USER-CONFIRMED EXCEPTION to this project's "no AI/chatbot
 * inside the platform" rule (see AGENTS.md).
 *
 * This file is the ONLY place in the codebase that is allowed to call an
 * external AI model. Scoped to these features, each its own explicit,
 * user-confirmed exception:
 *   1. Voice-driven exam-taking (Phase 1, MCQ only): generating draft
 *      multiple-choice questions from a faculty member's uploaded PDF slide
 *      deck (see /faculty/exams/new's AI-generation option and
 *      POST /api/faculty/exams/generate), and text-to-speech for reading
 *      exam questions aloud to motor-impaired students (see
 *      POST /api/tts/generate).
 *   2. Lecture keyterm glossary (speech-to-text boosting for
 *      Deaf/hard-of-hearing students): extracting English technical terms
 *      from a faculty member's uploaded PDF slide deck (see
 *      POST /api/faculty/keyterms/extract) — never persisted or exposed to
 *      students without the faculty member's explicit review/approval.
 *   3. (Added: critical API-key-exposure remediation, migrating the Flutter
 *      app off client-side Gemini calls) Five student-facing AI features
 *      that previously called Gemini directly from the mobile app with an
 *      embedded API key — Visual Assistance image description/OCR,
 *      Learning Support document summarize/simplify/quiz, deaf-mode
 *      difficult-term definitions, deaf-mode "draft a message to the
 *      instructor", and deaf-mode live-transcript auto-summary. See
 *      POST /api/student/ai/visual-assistance,
 *      POST /api/student/ai/learning-support,
 *      POST /api/student/ai/term-definition,
 *      POST /api/student/ai/message-draft,
 *      POST /api/student/ai/summarize-transcript. Each endpoint builds its
 *      prompt entirely server-side (student category/support-level looked
 *      up from the DB, never trusted from the client) from a FIXED template
 *      per feature — the client only ever supplies the bounded, feature-
 *      specific content (an image, extracted document text, a tapped term,
 *      a message topic, a transcript excerpt), never a raw prompt or model
 *      choice. Prompt wording ported verbatim from the Flutter app's
 *      retired lib/services/adaptive_prompts.dart.
 *
 * All call sites require an authenticated faculty/student user and are
 * server-side only — the API key never reaches the client. This is NOT
 * license to add AI calls anywhere else in the app; every other feature in
 * this codebase remains AI-free by design.
 * ══════════════════════════════════════════════════════════════════════
 */

// gemini-2.5-flash: chosen for this task because it has native multimodal
// PDF understanding (accepts a PDF's bytes directly as an inline part, no
// separate OCR/parsing step needed) and supports a JSON-schema-constrained
// response mode (responseSchema below), which is what makes structured MCQ
// extraction reliable rather than needing to parse free-form prose. Flash
// is also fast/cheap enough for a "generate ~N questions from one slide
// deck" interactive request-response flow, where the faculty member is
// waiting on the result — the larger Pro tier would add latency/cost this
// use case doesn't need.
const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_TTS_MODEL = "gemini-2.5-flash-preview-tts";

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set");
  }
  return new GoogleGenAI({ apiKey });
}

export interface GeneratedOption {
  text: string;
  isCorrect: boolean;
}

export interface GeneratedQuestion {
  text: string;
  options: GeneratedOption[];
}

/**
 * Generates draft MCQ questions from a PDF's bytes. Returns plain data —
 * the caller (POST /api/faculty/exams/generate) is responsible for
 * rendering these as an EDITABLE DRAFT and never persisting/publishing
 * them without the faculty member's explicit save action. This function
 * itself never writes to the database.
 */
export type ExamQuestionLanguage = "ar" | "en";

export async function generateExamQuestionsFromPdf(
  pdfBytes: Buffer,
  approxQuestionCount: number,
  language: ExamQuestionLanguage
): Promise<GeneratedQuestion[]> {
  const ai = getClient();

  const responseSchema = {
    type: Type.OBJECT,
    properties: {
      questions: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            text: { type: Type.STRING },
            options: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  text: { type: Type.STRING },
                  isCorrect: { type: Type.BOOLEAN },
                },
                required: ["text", "isCorrect"],
              },
            },
          },
          required: ["text", "options"],
        },
      },
    },
    required: ["questions"],
  };

  // Language is the instructor's explicit choice (see the "عربي"/"English"
  // toggle in the AI-generation form), never inferred from the slide
  // content's own language — a professor with English slides may still
  // want an Arabic exam, and vice versa. The wording below is deliberately
  // "compose/write new questions in <language>" rather than "translate",
  // so Gemini doesn't machine-translate slide phrasing word-for-word (which
  // reads awkwardly) and instead produces natural exam-register prose in
  // the target language, grounded in the slides' meaning.
  const languageInstruction =
    language === "ar"
      ? `Write every question and every option in formal Modern Standard Arabic ` +
        `(الفصحى), regardless of what language the slide content itself is ` +
        `written in. Compose natural, exam-register Arabic that tests the ` +
        `same concepts as the slides — do not produce a literal word-for-word ` +
        `translation of English slide text.`
      : `Write every question and every option in English, regardless of what ` +
        `language the slide content itself is written in. Compose natural, ` +
        `exam-register English that tests the same concepts as the slides — ` +
        `do not produce a literal word-for-word translation of non-English ` +
        `slide text.`;

  const prompt =
    `You are helping a university instructor draft a multiple-choice exam ` +
    `from their lecture slides. Read the attached PDF and generate ` +
    `approximately ${approxQuestionCount} multiple-choice questions that ` +
    `test understanding of the material. Each question must have exactly ` +
    `4 answer options, with exactly ONE marked isCorrect: true and the ` +
    `rest isCorrect: false. ${languageInstruction} Do not include any ` +
    `question or option outside of what's returned in the JSON structure.`;

  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: [
      {
        role: "user",
        parts: [
          { inlineData: { mimeType: "application/pdf", data: pdfBytes.toString("base64") } },
          { text: prompt },
        ],
      },
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema,
    },
  });

  const raw = response.text;
  if (!raw) {
    throw new Error("Gemini returned no content");
  }

  let parsed: { questions?: GeneratedQuestion[] };
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Gemini returned invalid JSON");
  }

  const questions = parsed.questions ?? [];

  // Defensive re-validation server-side — never trust the model's output
  // to actually satisfy "exactly one correct option" even though the
  // prompt+schema both ask for it; drop any malformed question rather than
  // let it reach the teacher's draft screen in a broken state.
  return questions.filter(
    (q) =>
      typeof q.text === "string" &&
      q.text.trim().length > 0 &&
      Array.isArray(q.options) &&
      q.options.length >= 2 &&
      q.options.filter((o) => o.isCorrect === true).length === 1 &&
      q.options.every((o) => typeof o.text === "string" && o.text.trim().length > 0)
  );
}

/**
 * Extracts English technical/domain terms (the kind a Deepgram keyterm list
 * should boost — proper nouns, acronyms, jargon like "blockchain",
 * "consensus", "API") from a PDF slide deck's content, REGARDLESS of
 * whether the deck itself is in Arabic or English. Deliberately prompted as
 * "extract technical terms" rather than "extract English words", so it
 * doesn't just regex-match Latin script — an incidental English word used
 * casually is not what this is for; a term a lecturer would actually say
 * mid-sentence while otherwise speaking Arabic is. Returns plain data, no
 * DB writes — the caller (POST /api/faculty/keyterms/extract) renders these
 * as an editable draft; nothing is visible to students until the faculty
 * member explicitly approves (see LectureKeyterm.approved's schema
 * comment).
 */
export async function extractLectureKeytermsFromPdf(pdfBytes: Buffer): Promise<string[]> {
  const ai = getClient();

  const responseSchema = {
    type: Type.OBJECT,
    properties: {
      terms: { type: Type.ARRAY, items: { type: Type.STRING } },
    },
    required: ["terms"],
  };

  const prompt =
    `You are helping a university instructor build a glossary of English ` +
    `technical/domain terms from their lecture slides, for a speech-to-text ` +
    `system that needs a boost-list of terms likely to be spoken aloud ` +
    `mid-lecture (even if the lecture itself is mostly in Arabic). Read the ` +
    `attached PDF and extract every distinct English technical term, ` +
    `acronym, proper noun, or piece of jargon that appears — e.g. product/ ` +
    `algorithm/protocol names, technical vocabulary specific to the ` +
    `subject, standard abbreviations. Do NOT include ordinary English words ` +
    `that carry no special/technical meaning in this context (e.g. common ` +
    `words like "the", "example", "chapter"), and do NOT include Arabic ` +
    `text. Each term should appear once (deduplicated), in the casing it ` +
    `most commonly appears in the slides (e.g. "API" not "api").`;

  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: [
      {
        role: "user",
        parts: [
          { inlineData: { mimeType: "application/pdf", data: pdfBytes.toString("base64") } },
          { text: prompt },
        ],
      },
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema,
    },
  });

  const raw = response.text;
  if (!raw) {
    throw new Error("Gemini returned no content");
  }

  let parsed: { terms?: unknown[] };
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Gemini returned invalid JSON");
  }

  const terms = parsed.terms ?? [];

  // Defensive re-validation + dedup server-side — never trust the model's
  // structural/uniqueness guarantees even with schema+prompt.
  const seen = new Set<string>();
  const result: string[] = [];
  for (const t of terms) {
    if (typeof t !== "string") continue;
    const trimmed = t.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────────
// Generic OpenAI-style chat completion (student-facing mobile AI features:
// Visual Assistance image description/reading, Learning Support PDF
// summarize/simplify/quiz).
//
// SECURITY MIGRATION NOTE: these two Flutter features used to call Gemini
// DIRECTLY from the mobile app (lib/services/ai_client.dart), which required
// compiling GEMINI_API_KEY into the release APK. That is what leaked the key
// publicly (it was extractable from the distributed APK binary). This
// function/route pair replaces that: the Flutter app now sends its already-
// built prompt + content here over its normal authenticated Shadow API
// connection, and this file is the only place that ever holds the key.
//
// `ChatMessage`/`ChatContentPart` intentionally mirror the OpenAI-style shape
// ai_client.dart already builds client-side (role + content, where content
// is a string or a list of {type:'text'|'image_url'} parts) so porting the
// translation logic here is a faithful, checkable 1:1 copy of
// ai_client.dart's `_toGeminiRequest`/`_extractGeminiText`, not a
// reinterpretation — see route.ts callers for the validation that happens
// BEFORE this function ever sees a message (size caps, image content-type
// allowlist, fixed model, no client-supplied config).
// ─────────────────────────────────────────────────────────────────────────

export type ChatRole = "system" | "user" | "assistant";

export interface ChatContentPart {
  type: "text" | "image_url";
  text?: string;
  /** Only ever a `data:<mime>;base64,<data>` URI built server-side by the route handler from a verified upload — never taken verbatim from client JSON. */
  image_url?: { url: string };
}

export interface ChatMessage {
  role: ChatRole;
  content: string | ChatContentPart[];
}

export interface ChatCompletionResult {
  content: string | null;
  /** Non-null only on failure — never includes Gemini's raw error text (see route.ts, which logs it server-side but never forwards it to the client). */
  error: string | null;
}

function toGeminiContents(messages: ChatMessage[]): {
  systemParts: { text: string }[];
  contents: { role: string; parts: Record<string, unknown>[] }[];
} {
  const systemParts: { text: string }[] = [];
  const contents: { role: string; parts: Record<string, unknown>[] }[] = [];

  for (const msg of messages) {
    if (msg.role === "system") {
      if (typeof msg.content === "string" && msg.content.length > 0) {
        systemParts.push({ text: msg.content });
      }
      continue;
    }

    const parts: Record<string, unknown>[] = [];
    if (typeof msg.content === "string") {
      if (msg.content.length > 0) parts.push({ text: msg.content });
    } else {
      for (const part of msg.content) {
        if (part.type === "text" && part.text) {
          parts.push({ text: part.text });
        } else if (part.type === "image_url" && part.image_url?.url) {
          // [\s\S]* instead of a dotAll (`/s`) flag — this project's TS
          // target is ES2017, which predates the `/s` flag; functionally
          // identical (base64 data has no newlines anyway).
          const match = /^data:(.+?);base64,([\s\S]*)$/.exec(part.image_url.url);
          if (match) {
            parts.push({ inlineData: { mimeType: match[1], data: match[2] } });
          }
        }
      }
    }

    if (parts.length > 0) {
      contents.push({ role: msg.role === "assistant" ? "model" : "user", parts });
    }
  }

  return { systemParts, contents };
}

// Visual Assistance's own prompt explicitly asks Gemini to describe people
// and surroundings in a real camera photo ("ركز على الأشياء والأشخاص
// والبيئة المحيطة") — unlike this file's other chatCompletion callers
// (Learning Support, Term Definition: plain text, never an image; and the
// PDF functions above: lecture-slide text/charts), a real photo of a person
// is exactly the kind of input Gemini's DEFAULT safety thresholds (tuned
// for open-ended/adversarial use, not a legitimate accessibility tool)
// are prone to over-block, most often surfacing as an empty response
// (finishReason "SAFETY", or promptFeedback.blockReason) rather than a
// thrown API error — the previous code treated that indistinguishably from
// "Gemini returned nothing for some other reason" and never even logged
// which. BLOCK_ONLY_HIGH (Google's own documented, standard "less
// aggressive" tier — not "no filtering") is used for exactly this class of
// legitimate-use-case over-blocking; it can only make blocking LESS
// aggressive, so it cannot regress the already-working text-only callers of
// this same function.
const SAFETY_SETTINGS = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
];

/**
 * Generic Gemini chat completion for the two migrated student-facing
 * features. Model is ALWAYS `GEMINI_MODEL` — never client-selectable (see
 * this file's top-of-file exception comment: this is one of the explicitly
 * approved, scoped Gemini call shapes, not an arbitrary passthrough).
 */
export async function chatCompletion(
  messages: ChatMessage[],
  maxTokens: number
): Promise<ChatCompletionResult> {
  const ai = getClient();
  const { systemParts, contents } = toGeminiContents(messages);

  try {
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: contents as never,
      config: {
        maxOutputTokens: maxTokens,
        // Same reasoning as the mobile client's original request: disable
        // "thinking" so flash returns direct output instead of spending the
        // token budget on reasoning (which can yield an empty reply).
        thinkingConfig: { thinkingBudget: 0 },
        safetySettings: SAFETY_SETTINGS,
        ...(systemParts.length > 0
          ? { systemInstruction: { parts: systemParts } }
          : {}),
      } as never,
    });

    const text = response.text;
    if (!text || text.trim().length === 0) {
      // Surface WHY the response was empty (blocked prompt, a candidate
      // that finished for a non-STOP reason, or genuinely nothing) rather
      // than a single undifferentiated "no content" — this flows only into
      // the caller's sanitized server-side log, never to the client.
      const blockReason = response.promptFeedback?.blockReason;
      const finishReason = response.candidates?.[0]?.finishReason;
      const reason = blockReason
        ? `prompt blocked: ${blockReason}`
        : finishReason && finishReason !== "STOP"
          ? `finishReason=${finishReason}`
          : "empty response, no block/finish reason reported";
      return { content: null, error: `Gemini returned no content (${reason})` };
    }
    return { content: text, error: null };
  } catch (err) {
    // Deliberately swallow the real Gemini error detail here — the caller
    // (route.ts) logs a sanitized version and never forwards raw provider
    // error text to the client, so it can never leak infra/key detail.
    return { content: null, error: err instanceof Error ? err.message : "Gemini request failed" };
  }
}

/**
 * Synthesizes speech audio for `text` using Gemini's TTS capability.
 * Returns raw PCM audio bytes (see /api/tts/generate for the WAV
 * container it's wrapped in before being sent to the client) plus the
 * sample rate Gemini's TTS output uses, so the caller can build a correct
 * WAV header without guessing.
 */
export async function synthesizeSpeech(text: string): Promise<{ pcm: Buffer; sampleRateHz: number }> {
  const ai = getClient();

  const response = await ai.models.generateContent({
    model: GEMINI_TTS_MODEL,
    contents: [{ role: "user", parts: [{ text }] }],
    config: {
      responseModalities: ["AUDIO"],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } },
      },
    },
  });

  const audioPart = response.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData;
  if (!audioPart?.data) {
    throw new Error("Gemini TTS returned no audio content");
  }

  // Gemini's TTS endpoint returns raw 16-bit PCM, mono, 24kHz — documented
  // sample rate for gemini-2.5-flash-preview-tts's audio output as of this
  // writing. Flagged explicitly in the report: this endpoint/behavior is
  // newer surface area than the rest of this codebase's dependencies, so
  // double-check against Google's current docs before shipping to
  // production in case the default sample rate changes.
  return { pcm: Buffer.from(audioPart.data, "base64"), sampleRateHz: 24000 };
}

// ═══════════════════════════════════════════════════════════════════════
// Student-facing AI features migrated from direct client-side Gemini calls
// (see the top-of-file comment, exception 3). Each function below takes
// ONLY the student's server-verified category/directives plus the bounded
// feature-specific content — never a client-supplied prompt.
// ═══════════════════════════════════════════════════════════════════════

export type StudentAiLanguage = "ar" | "en";

/**
 * System prompt for the Visual Assistance mode (image description / text
 * reading). Ported verbatim from adaptive_prompts.dart's
 * buildVisionPrompt/_buildVisionPromptAr/_buildVisionPromptEn.
 */
function buildVisionSystemPrompt(
  directives: AdaptationDirectives,
  categoryCode: CategoryCode,
  language: StudentAiLanguage
): string {
  const level = levelLabel(directives, language);
  const category = categoryLabel(directives, categoryCode, language);

  if (language === "en") {
    return `You are "Shadow", a visual assistant for a university student. Your task is to describe the image or read the text in it.

Student data (confidential — never mention it in your reply):
- General classification: ${category}
- Support level: ${level}

Adjust your style strictly by support level:

■ Light support:
  - A brief description in one paragraph.
  - Plain adult language.
  - Do not ask for additional details.

■ Moderate support:
  - A structured description broken into parts (background, main
    objects, text if present).
  - Simple language.
  - End with a question: "Would you like more detail about something
    specific?"

■ Intensive support:
  - Very short sentences, one piece of information per sentence.
  - Always start with the most important thing in the image (safety,
    written text, a face, then details).
  - After every two sentences, ask: "Is this clear?"
  - Do not use complex terminology.

Adjust your focus by classification:

■ Neurodevelopmental disorders: reduce unnecessary detail.
■ Learning difficulties: repeat an important idea two different ways.
■ Mild cognitive disabilities: use an everyday example instead of an
  abstract description.
■ Communication and language disorders: simple, short words.
■ Behavioral and emotional disorders: a calm, reassuring tone; avoid
  anything that could cause stress.

Fixed rules:
1. Write in English.
2. Never reveal the student's classification or support level.
3. Do not use any medical terminology.
4. If you cannot analyze the image, apologize politely and suggest
   taking a clearer photo.`;
  }

  return `أنت "شادو"، مساعد بصري لطالب جامعي. مهمتك وصف الصورة أو قراءة النص فيها.

بيانات الطالب (سرّية — لا تذكرها في ردّك):
- التصنيف العام: ${category}
- مستوى الدعم: ${level}

اضبط أسلوبك حسب مستوى الدعم بصرامة:

■ دعم خفيف:
  - وصف موجز في فقرة واحدة.
  - لغة عادية للبالغين.
  - لا تسأل عن تفاصيل إضافية.

■ دعم متوسط:
  - وصف منظّم مقسّم إلى عناصر (الخلفية، الأشياء الرئيسية، النص إن
    وُجد).
  - لغة سهلة.
  - انتهِ بسؤال: "هل تريد تفاصيل أكثر عن شيء معيّن؟"

■ دعم مكثف:
  - جمل قصيرة جداً، جملة واحدة لكل معلومة.
  - ابدأ دائماً بأهم شيء في الصورة (السلامة، النص المكتوب، الوجه، ثم
    التفاصيل).
  - بعد كل جملتين، اسأل: "هل واضح؟"
  - لا تستخدم مصطلحات معقدة.

اضبط تركيزك حسب التصنيف:

■ اضطرابات النمو العصبي: قلّل التفاصيل غير الضرورية.
■ صعوبات التعلم: كرّر الفكرة بصياغتين إذا كانت مهمة.
■ الإعاقات الإدراكية الخفيفة: مثال يومي بدل الوصف المجرّد.
■ اضطرابات التواصل واللغة: كلمات بسيطة قصيرة.
■ الاضطرابات السلوكية والانفعالية: نبرة هادئة مطمئنة، تجنّب أي شيء
  يسبّب توتراً.

القواعد الثابتة:
1. اكتب بالعربية.
2. لا تكشف للطالب تصنيفه ولا مستوى دعمه.
3. لا تستخدم أي مصطلح طبي.
4. إذا لم تستطع تحليل الصورة، اعتذر بلطف واقترح التقاط صورة أوضح.`;
}

export type VisualAssistanceMode = "describe" | "read_text";

/**
 * Describes an image or reads text out of it, adapted to the student's own
 * server-verified accessibility profile. Ported from
 * analyze_image_with_gpt4o.dart: the user-facing instruction line is
 * hardcoded Arabic in the original app regardless of UI language (a
 * pre-existing asymmetry, preserved here rather than "fixed" as part of
 * this migration) — only the system prompt is bilingual.
 */
export async function describeOrReadImage(
  imageBytes: Buffer,
  imageMimeType: "image/jpeg" | "image/png",
  mode: VisualAssistanceMode,
  directives: AdaptationDirectives,
  categoryCode: CategoryCode,
  language: StudentAiLanguage
): Promise<string> {
  const systemPrompt = buildVisionSystemPrompt(directives, categoryCode, language);
  const instruction =
    mode === "read_text"
      ? "اقرأ واستخرج كل النصوص الموجودة في الصورة. قدم النص كما هو دون تعليق إضافي."
      : "صف ما تراه في هذه الصورة بشكل تفصيلي باللغة العربية. ركز على الأشياء والأشخاص والبيئة المحيطة.";

  // Reuses the existing chatCompletion/ChatMessage infrastructure above
  // (built for exactly this pair of features) instead of a second direct
  // ai.models.generateContent call, per the "no duplicate AI helpers" rule.
  const result = await chatCompletion(
    [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: [
          { type: "image_url", image_url: { url: `data:${imageMimeType};base64,${imageBytes.toString("base64")}` } },
          { type: "text", text: instruction },
        ],
      },
    ],
    600
  );

  if (!result.content) {
    throw new Error(result.error ?? "Gemini returned no content");
  }
  return result.content;
}

function buildLearningSystemPrompt(
  directives: AdaptationDirectives,
  categoryCode: CategoryCode,
  actionArabicLabel: string,
  language: StudentAiLanguage
): string {
  const level = levelLabel(directives, language);
  const category = categoryLabel(directives, categoryCode, language);

  if (language === "en") {
    const actionEnglishLabel =
      actionArabicLabel === "تلخيص" ? "Summarize" : actionArabicLabel === "تبسيط" ? "Simplify" : "Review Questions";
    return `You are "Shadow", an academic assistant for a university student. Your task is to help them understand study material they've given you.

Student data (confidential — never mention it in your reply):
- General classification: ${category}
- Support level: ${level}
- Requested action: ${actionEnglishLabel}

Adjust your style strictly by support level:

■ Light support:
  - "Summarize": a brief paragraph preserving the main points, in
    academic language.
  - "Simplify": a lighter rewrite that keeps the original content and
    terminology.
  - "Review Questions": 3 analytical questions testing deep
    understanding.

■ Moderate support:
  - "Summarize": a bulleted summary, one point per main idea, in
    simple language.
  - "Simplify": a full rewrite in simpler language, defining terms the
    first time they appear.
  - "Review Questions": 5 questions graded from easy to hard.

■ Intensive support:
  - "Summarize": very short sentences, one idea per line, everyday
    language, with visual markers (▪ ➤ ✓).
  - "Simplify": maximum simplification. A short sentence, an everyday
    example, then the idea restated a second way. Assume no prior
    knowledge.
  - "Review Questions": 5 easy questions, each followed immediately by
    a simplified model answer (the goal is understanding, not testing).

Adjust your focus by classification:

■ Neurodevelopmental disorders: avoid long texts; make each part
  self-contained so the student can read one part and return later.
■ Learning difficulties: repeat any important idea two different ways.
■ Mild cognitive disabilities: back every idea with a concrete,
  everyday example.
■ Communication and language disorders: simple vocabulary, short
  sentences, avoid using multiple synonyms for the same idea.
■ Behavioral and emotional disorders: a reassuring tone; avoid any
  phrase implying failure or difficulty ("this is complex", "you may
  not understand", etc.).

Fixed rules:
1. Write in English.
2. Never reveal the student's classification or support level.
3. Do not use any medical terminology.
4. Never do the assignment for the student. Explain and simplify only.
5. If the provided content looks like a direct exam question or
   assignment, gently remind the student that you're helping them
   understand it, and do not give them the final answer.`;
  }

  return `أنت "شادو"، مساعد أكاديمي لطالب جامعي. مهمتك مساعدته على فهم مادة
دراسية أعطاك إياها.

بيانات الطالب (سرّية — لا تذكرها في ردّك):
- التصنيف العام: ${category}
- مستوى الدعم: ${level}
- الإجراء المطلوب: ${actionArabicLabel}

اضبط أسلوبك حسب مستوى الدعم بصرامة:

■ دعم خفيف:
  - "تلخيص": فقرة موجزة تحفظ النقاط الرئيسية بلغة أكاديمية.
  - "تبسيط": إعادة صياغة أخف مع الحفاظ على المحتوى الأصلي والمصطلحات.
  - "أسئلة مراجعة": 3 أسئلة تحليلية تختبر الفهم العميق.

■ دعم متوسط:
  - "تلخيص": ملخص منقّط، نقطة واحدة لكل فكرة رئيسية، بلغة سهلة.
  - "تبسيط": إعادة صياغة كاملة بلغة أبسط، مع تعريف المصطلحات
    عند أول ورود.
  - "أسئلة مراجعة": 5 أسئلة متدرّجة من السهل للأصعب.

■ دعم مكثف:
  - "تلخيص": جمل قصيرة جداً، فكرة واحدة كل سطر، بلغة الحياة اليومية،
    مع إشارات بصرية (▪ ➤ ✓).
  - "تبسيط": تبسيط أقصى. جملة قصيرة، مثال من الحياة اليومية، ثم
    إعادة الفكرة بصياغة ثانية. لا تفترض أي معرفة سابقة.
  - "أسئلة مراجعة": 5 أسئلة سهلة، وبعد كل سؤال ضع الإجابة النموذجية
    مبسّطة (لأن الهدف الفهم، لا الاختبار).

اضبط تركيزك حسب التصنيف:

■ اضطرابات النمو العصبي: تجنّب النصوص الطويلة، اجعل كل جزء مستقلاً
  بحيث يقدر الطالب يقرأ جزءاً ثم يعود لاحقاً.
■ صعوبات التعلم: كرّر أي فكرة مهمة بصياغتين.
■ الإعاقات الإدراكية الخفيفة: كل فكرة بمثال يومي محسوس.
■ اضطرابات التواصل واللغة: مفردات بسيطة، جمل قصيرة، تجنّب المرادفات
  المتعددة للفكرة الواحدة.
■ الاضطرابات السلوكية والانفعالية: نبرة مطمئنة، تجنّب أي عبارة توحي
  بالفشل أو الصعوبة ("هذا معقد"، "قد لا تفهم"، إلخ).

القواعد الثابتة:
1. اكتب بالعربية.
2. لا تكشف للطالب تصنيفه ولا مستوى دعمه.
3. لا تستخدم أي مصطلح طبي.
4. لا تحلّ الواجبات نيابةً عن الطالب. تشرح وتبسّط فقط.
5. إذا كان المحتوى المُقدَّم يبدو سؤال اختبار أو واجب مباشر، ذكّر
   الطالب بلطف أنك تساعده على الفهم، ولا تعطيه الحل النهائي.`;
}

export type LearningSupportMode = "summarize" | "simplify" | "quiz";

const LEARNING_ACTION_ARABIC_LABEL: Record<LearningSupportMode, string> = {
  summarize: "تلخيص",
  simplify: "تبسيط",
  quiz: "أسئلة مراجعة",
};

/**
 * Summarizes/simplifies/generates review questions from student-supplied
 * document text (already extracted client-side, same as the original
 * process_document_with_gpt4o.dart — this function never parses a PDF
 * itself). The user message's action label is hardcoded Arabic regardless
 * of UI language, matching the original Flutter code exactly.
 */
export async function processLearningText(
  text: string,
  mode: LearningSupportMode,
  directives: AdaptationDirectives,
  categoryCode: CategoryCode,
  language: StudentAiLanguage
): Promise<string> {
  const actionLabel = LEARNING_ACTION_ARABIC_LABEL[mode];
  const systemPrompt = buildLearningSystemPrompt(directives, categoryCode, actionLabel, language);
  const userMessage = `الإجراء المطلوب: ${actionLabel}\n\nالمحتوى:\n${text}`;

  // Reuses chatCompletion (see describeOrReadImage's comment above) instead
  // of a second direct ai.models.generateContent call.
  const result = await chatCompletion(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
    800
  );

  if (!result.content) {
    throw new Error(result.error ?? "Gemini returned no content");
  }
  return result.content;
}

/**
 * One-sentence simplified definition of a difficult term (deaf-mode,
 * intensive support). Ported from deaf_mode_transcription_widget.dart's
 * _TermDefinitionSheet._load — a standalone simple prompt, not the
 * adaptive_prompts.dart system-prompt machinery.
 */
export async function defineTermSimple(term: string, language: StudentAiLanguage): Promise<string> {
  const prompt =
    language === "en"
      ? `Explain the meaning of the term "${term}" in one very short, very simple English sentence, suitable for a student who needs intensive support.`
      : `اشرح معنى المصطلح "${term}" بجملة واحدة قصيرة جداً وبسيطة جداً بالعربية، مناسبة لطالب يحتاج دعماً مكثفاً.`;

  const result = await chatCompletion([{ role: "user", content: prompt }], 150);
  if (!result.content) {
    throw new Error(result.error ?? "Gemini returned no content");
  }
  return result.content;
}

/**
 * Drafts a short, polite message to the instructor about a student-supplied
 * topic. Ported from deaf_mode_transcription_widget.dart's
 * _MessageAssistantSheet._generate.
 */
export async function draftMessageToInstructor(topic: string, language: StudentAiLanguage): Promise<string> {
  const prompt =
    language === "en"
      ? `Write a short, polite, formal English message from a university student to their instructor, about: ${topic}. Keep it brief and direct, no long preamble.`
      : `اكتب رسالة قصيرة ومهذبة بصيغة رسمية باللغة العربية، موجّهة من طالب جامعي لأستاذه، بخصوص: ${topic}. اجعلها مختصرة ومباشرة، بلا مقدمات طويلة.`;

  const result = await chatCompletion([{ role: "user", content: prompt }], 200);
  if (!result.content) {
    throw new Error(result.error ?? "Gemini returned no content");
  }
  return result.content;
}

/**
 * Summarizes a rolling excerpt of a live deaf-mode lecture transcript.
 * Ported from auto_summary_service.dart's triggerNow — hardcoded Arabic
 * prompt regardless of UI language, matching the original exactly.
 * `supportLevelOrder` picks the sentence count (2 for light/moderate, 3 for
 * intensive), same as AutoSummaryService._sentenceCountFor.
 */
export async function summarizeTranscriptChunk(transcriptExcerpt: string, sentenceCount: number): Promise<string> {
  const prompt = `لخّص هذا في ${sentenceCount} جمل قصيرة جداً بالعربية:\n\n${transcriptExcerpt}`;

  const result = await chatCompletion([{ role: "user", content: prompt }], 200);
  if (!result.content) {
    throw new Error(result.error ?? "Gemini returned no content");
  }
  return result.content;
}
