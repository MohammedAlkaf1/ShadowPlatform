import { GoogleGenAI, Type } from "@google/genai";

/**
 * ══════════════════════════════════════════════════════════════════════
 * EXPLICIT, USER-CONFIRMED EXCEPTION to this project's "no AI/chatbot
 * inside the platform" rule (see AGENTS.md).
 *
 * This file is the ONLY place in the codebase that is allowed to call an
 * external AI model, and it exists solely to support the voice-driven
 * exam-taking feature (Phase 1, MCQ only):
 *   1. Generating draft multiple-choice questions from a faculty member's
 *      uploaded PDF slide deck (see /faculty/exams/new's AI-generation
 *      option and POST /api/faculty/exams/generate).
 *   2. Text-to-speech for reading exam questions aloud to motor-impaired
 *      students (see POST /api/tts/generate).
 *
 * Both call sites require an authenticated faculty/student user and are
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
export async function generateExamQuestionsFromPdf(
  pdfBytes: Buffer,
  approxQuestionCount: number
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

  const prompt =
    `You are helping a university instructor draft a multiple-choice exam ` +
    `from their lecture slides. Read the attached PDF and generate ` +
    `approximately ${approxQuestionCount} multiple-choice questions that ` +
    `test understanding of the material. Each question must have exactly ` +
    `4 answer options, with exactly ONE marked isCorrect: true and the ` +
    `rest isCorrect: false. Write both questions and options in the same ` +
    `language as the slide content. Do not include any question or option ` +
    `outside of what's returned in the JSON structure.`;

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
