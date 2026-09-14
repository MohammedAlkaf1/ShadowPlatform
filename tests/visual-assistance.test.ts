import "./setup";
import { describe, it, expect, vi, beforeAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { tokenFor, authedRequest } from "./helpers";
import type { User } from "@prisma/client";

const BASE = "http://localhost/api/student/ai/visual-assistance";

/** Minimal valid 1x1 transparent PNG — a real, magic-byte-verifiable PNG, not a fake. */
const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

function pngFormData(overrides: { mode?: string; language?: string } = {}): FormData {
  const form = new FormData();
  const bytes = Buffer.from(TINY_PNG_BASE64, "base64");
  form.set("image", new Blob([new Uint8Array(bytes)], { type: "image/png" }), "photo.png");
  form.set("mode", overrides.mode ?? "describe");
  form.set("language", overrides.language ?? "ar");
  return form;
}

/**
 * Captures the exact argument passed to the real (mocked-at-the-network-
 * boundary-only) @google/genai client's generateContent — everything above
 * that call (route validation, toGeminiContents, chatCompletion,
 * describeOrReadImage) runs FOR REAL, unmocked. This is what verifies the
 * actual generated Gemini request structure without a live API call: if
 * toGeminiContents ever regresses to a malformed/missing inlineData part,
 * this test's structural assertions catch it directly, rather than only
 * being inferable from a live 400/502.
 */
let capturedArgs: unknown = null;
let generateContentImpl: (args: unknown) => Promise<{ text: string }> = async () => ({ text: "وصف الصورة" });

vi.mock("@google/genai", async () => {
  const actual = await vi.importActual<typeof import("@google/genai")>("@google/genai");
  // A real `class`, not an arrow function passed to mockImplementation —
  // arrow functions can never be invoked with `new` (ai.ts's getClient()
  // does `new GoogleGenAI({apiKey})`), so this must be truly constructible.
  class MockGoogleGenAI {
    models = {
      generateContent: vi.fn(async (args: unknown) => {
        capturedArgs = args;
        return generateContentImpl(args);
      }),
    };
  }
  return {
    ...actual,
    GoogleGenAI: MockGoogleGenAI,
  };
});

interface CapturedGenerateContentArgs {
  model: string;
  contents: { role: string; parts: Record<string, unknown>[] }[];
  config?: {
    systemInstruction?: { parts: { text: string }[] };
    maxOutputTokens?: number;
    thinkingConfig?: { thinkingBudget: number };
  };
}

describe("POST /api/student/ai/visual-assistance — Gemini request structure (no live API call)", () => {
  let visualModeStudent: User; // seeded 441204567@student.ksu.edu.sa — VISUAL_MODE enabled on an approved SupportPlan

  beforeAll(async () => {
    const student = await prisma.user.findFirst({ where: { email: "441204567@student.ksu.edu.sa" } });
    if (!student) throw new Error("Seed the demo student user before running this test.");
    visualModeStudent = student;
  });

  it("builds a correctly-shaped Gemini request: inlineData (camelCase) + text parts under a single user turn, plus a separate systemInstruction", async () => {
    capturedArgs = null;
    generateContentImpl = async () => ({ text: "هذه صورة اختبار" });

    const { token } = await tokenFor(visualModeStudent.email);
    const req = authedRequest(BASE, token, { method: "POST", body: pngFormData({ mode: "describe", language: "ar" }) });
    const { POST } = await import("@/app/api/student/ai/visual-assistance/route");
    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ result: "هذه صورة اختبار" });

    expect(capturedArgs).not.toBeNull();
    const args = capturedArgs as CapturedGenerateContentArgs;

    // Exactly one user turn (the system message is translated into a
    // separate top-level `config.systemInstruction`, never into `contents`).
    expect(args.contents).toHaveLength(1);
    expect(args.contents[0].role).toBe("user");

    // Two parts: the image (inlineData, correct camelCase keys, correct
    // mimeType, non-empty base64 data) and the text instruction — in that
    // order, matching describeOrReadImage's construction exactly.
    const parts = args.contents[0].parts;
    expect(parts).toHaveLength(2);

    const imagePart = parts[0] as { inlineData?: { mimeType?: string; data?: string } };
    expect(imagePart.inlineData).toBeDefined();
    expect(imagePart.inlineData?.mimeType).toBe("image/png");
    expect(typeof imagePart.inlineData?.data).toBe("string");
    expect(imagePart.inlineData?.data?.length).toBeGreaterThan(0);
    // The exact same base64 the server received — proves no corruption/
    // truncation through the regex-based data-URI round trip.
    expect(imagePart.inlineData?.data).toBe(TINY_PNG_BASE64);
    // Never the OpenAI-style shape or a snake_case field leaking through.
    expect(imagePart).not.toHaveProperty("image_url");
    expect(imagePart).not.toHaveProperty("inline_data");

    const textPart = parts[1] as { text?: string };
    expect(typeof textPart.text).toBe("string");
    expect(textPart.text?.length).toBeGreaterThan(0);

    // systemInstruction is a sibling of `contents`, not embedded in it —
    // matches Gemini's documented request shape exactly.
    expect(args.config?.systemInstruction?.parts).toBeDefined();
    expect(args.config?.systemInstruction?.parts?.[0]?.text?.length).toBeGreaterThan(0);

    // Model is always the fixed server constant — never client-selectable.
    expect(args.model).toBe("gemini-2.5-flash");
  });

  it("propagates the mode-specific instruction correctly for read_text vs describe", async () => {
    generateContentImpl = async () => ({ text: "النص المستخرج" });
    const { token } = await tokenFor(visualModeStudent.email);
    const req = authedRequest(BASE, token, { method: "POST", body: pngFormData({ mode: "read_text", language: "en" }) });
    const { POST } = await import("@/app/api/student/ai/visual-assistance/route");
    const res = await POST(req);
    expect(res.status).toBe(200);

    const args = capturedArgs as CapturedGenerateContentArgs;
    const textPart = args.contents[0].parts[1] as { text?: string };
    expect(textPart.text).toContain("اقرأ");
  });

  it("returns a controlled 502 (not a raw provider error) when Gemini rejects the request", async () => {
    generateContentImpl = async () => {
      throw new Error('{"error":{"code":400,"message":"simulated Gemini rejection","status":"INVALID_ARGUMENT"}}');
    };
    const { token } = await tokenFor(visualModeStudent.email);
    const req = authedRequest(BASE, token, { method: "POST", body: pngFormData() });
    const { POST } = await import("@/app/api/student/ai/visual-assistance/route");
    const res = await POST(req);
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(JSON.stringify(body)).not.toContain("GEMINI_API_KEY");
    expect(JSON.stringify(body)).not.toContain("INVALID_ARGUMENT");
  });
});
