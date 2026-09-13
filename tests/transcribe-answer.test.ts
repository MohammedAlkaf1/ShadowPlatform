import "./setup";
import { describe, it, expect, vi, beforeAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { tokenFor, authedRequest } from "./helpers";
import type { User } from "@prisma/client";

const BASE = "http://localhost/api/student/ai/transcribe-answer";

/** Minimal valid 44-byte RIFF/WAVE header (PCM16 mono 16kHz) + silent PCM bytes. */
function makeWav(pcmLen = 32): Buffer {
  const wav = Buffer.alloc(44 + pcmLen);
  wav.write("RIFF", 0);
  wav.writeUInt32LE(36 + pcmLen, 4);
  wav.write("WAVE", 8);
  wav.write("fmt ", 12);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(16000, 24);
  wav.writeUInt32LE(32000, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(pcmLen, 40);
  return wav;
}

function wavFormData(overrides: { wav?: Buffer; language?: string; filename?: string; mime?: string } = {}): FormData {
  const form = new FormData();
  const wav = overrides.wav ?? makeWav();
  form.set(
    "audio",
    new Blob([new Uint8Array(wav)], { type: overrides.mime ?? "audio/wav" }),
    overrides.filename ?? "answer.wav"
  );
  if (overrides.language !== null) {
    form.set("language", overrides.language ?? "ar");
  }
  return form;
}

// Mocks src/lib/deepgram.ts entirely so these tests never hit the real
// Deepgram network — the route handler is what's under test, not the
// provider integration itself. Each test sets `deepgramImpl` to control
// the mocked return value.
let deepgramImpl: (wavBytes: Buffer, language: string) => Promise<{ transcript: string | null; error: string | null }> =
  async () => ({ transcript: "أربعة", error: null });

vi.mock("@/lib/deepgram", () => ({
  transcribePrerecordedWav: (wavBytes: Buffer, language: string) => deepgramImpl(wavBytes, language),
}));

describe("POST /api/student/ai/transcribe-answer (Voice Exam Deepgram migration)", () => {
  let physicalModeStudent: User; // seeded 441204567@student.ksu.edu.sa — PHYSICAL_MODE enabled on an approved SupportPlan
  let unauthorizedStudent: User; // brand-new student, no approved SupportPlan at all
  let facultyUser: User;

  beforeAll(async () => {
    const student = await prisma.user.findFirst({ where: { email: "441204567@student.ksu.edu.sa" } });
    if (!student) throw new Error("Seed the demo student user before running this test.");
    physicalModeStudent = student;

    const faculty = await prisma.user.findFirst({ where: { email: "faculty@demo.shadow.sa" } });
    if (!faculty) throw new Error("Seed the demo faculty user before running this test.");
    facultyUser = faculty;

    // A brand-new student with zero StudentProfile/SupportPlan rows — proves
    // the PHYSICAL_MODE authorization gate, independent of course
    // enrollment (this endpoint is gated like the other student-AI
    // endpoints, not like plain exam access).
    unauthorizedStudent = await prisma.user.create({
      data: {
        tenantId: physicalModeStudent.tenantId,
        email: `unauthorized-voice-exam-${Date.now()}@student.ksu.edu.sa`,
        passwordHash: "not-a-real-hash",
        role: "student",
        fullName: "Test Unauthorized Student",
      },
    });
  });

  it("rejects an unauthenticated request", async () => {
    const req = new Request(BASE, { method: "POST", body: wavFormData() });
    const { POST } = await import("@/app/api/student/ai/transcribe-answer/route");
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("rejects a non-student (faculty) request", async () => {
    const { token } = await tokenFor(facultyUser.email);
    const req = authedRequest(BASE, token, { method: "POST", body: wavFormData() });
    const { POST } = await import("@/app/api/student/ai/transcribe-answer/route");
    const res = await POST(req);
    expect([401, 403]).toContain(res.status);
  });

  it("rejects a student without PHYSICAL_MODE enabled (authorization isolation)", async () => {
    const { token } = await tokenFor(unauthorizedStudent.email);
    const req = authedRequest(BASE, token, { method: "POST", body: wavFormData() });
    const { POST } = await import("@/app/api/student/ai/transcribe-answer/route");
    const res = await POST(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  it("rejects a missing audio field", async () => {
    const { token } = await tokenFor(physicalModeStudent.email);
    const form = new FormData();
    form.set("language", "ar");
    const req = authedRequest(BASE, token, { method: "POST", body: form });
    const { POST } = await import("@/app/api/student/ai/transcribe-answer/route");
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("rejects an invalid language value", async () => {
    const { token } = await tokenFor(physicalModeStudent.email);
    const req = authedRequest(BASE, token, { method: "POST", body: wavFormData({ language: "fr" }) });
    const { POST } = await import("@/app/api/student/ai/transcribe-answer/route");
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("rejects content that isn't really a WAV file (fake MIME, magic-byte check)", async () => {
    const { token } = await tokenFor(physicalModeStudent.email);
    const notWav = Buffer.from("this is not a wav file, just text pretending to be one");
    const req = authedRequest(BASE, token, { method: "POST", body: wavFormData({ wav: notWav }) });
    const { POST } = await import("@/app/api/student/ai/transcribe-answer/route");
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("rejects an oversized audio upload", async () => {
    const { token } = await tokenFor(physicalModeStudent.email);
    // MAX_VOICE_EXAM_AUDIO_SIZE_BYTES defaults to 2MB — well above any real
    // 3-8s clip; a deliberately oversized clip proves the size gate fires
    // before the file is even passed to content verification.
    const huge = makeWav(3 * 1024 * 1024);
    const req = authedRequest(BASE, token, { method: "POST", body: wavFormData({ wav: huge }) });
    const { POST } = await import("@/app/api/student/ai/transcribe-answer/route");
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns a controlled 502 (not a raw provider error) when Deepgram fails", async () => {
    deepgramImpl = async () => ({ transcript: null, error: "Deepgram returned HTTP 503" });
    const { token } = await tokenFor(physicalModeStudent.email);
    const req = authedRequest(BASE, token, { method: "POST", body: wavFormData() });
    const { POST } = await import("@/app/api/student/ai/transcribe-answer/route");
    const res = await POST(req);
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(JSON.stringify(body)).not.toContain("DEEPGRAM_API_KEY");
    expect(JSON.stringify(body)).not.toMatch(/Token [A-Za-z0-9]/);
  });

  it("returns a controlled 502 when Deepgram times out", async () => {
    deepgramImpl = async () => ({ transcript: null, error: "Deepgram request timed out" });
    const { token } = await tokenFor(physicalModeStudent.email);
    const req = authedRequest(BASE, token, { method: "POST", body: wavFormData() });
    const { POST } = await import("@/app/api/student/ai/transcribe-answer/route");
    const res = await POST(req);
    expect(res.status).toBe(502);
  });

  it("accepts a valid authenticated+authorized request and returns only {transcript}", async () => {
    deepgramImpl = async () => ({ transcript: "أربعة", error: null });
    const { token } = await tokenFor(physicalModeStudent.email);
    const req = authedRequest(BASE, token, { method: "POST", body: wavFormData({ language: "ar" }) });
    const { POST } = await import("@/app/api/student/ai/transcribe-answer/route");
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ transcript: "أربعة" });
  });

  it("accepts the en-US language value (exact code the Flutter app sends for English)", async () => {
    deepgramImpl = async (_wav, language) => {
      expect(language).toBe("en-US");
      return { transcript: "four", error: null };
    };
    const { token } = await tokenFor(physicalModeStudent.email);
    const req = authedRequest(BASE, token, { method: "POST", body: wavFormData({ language: "en-US" }) });
    const { POST } = await import("@/app/api/student/ai/transcribe-answer/route");
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ transcript: "four" });
  });
});

describe("transcribePrerecordedWav — missing DEEPGRAM_API_KEY (unit-level, real module, no network)", () => {
  it("fails closed with a clear error and never calls fetch when the key is unset", async () => {
    vi.doUnmock("@/lib/deepgram");
    const original = process.env.DEEPGRAM_API_KEY;
    delete process.env.DEEPGRAM_API_KEY;
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    try {
      const { transcribePrerecordedWav } = await import("@/lib/deepgram");
      const result = await transcribePrerecordedWav(makeWav(), "ar");
      expect(result.transcript).toBeNull();
      expect(result.error).toBe("DEEPGRAM_API_KEY is not set");
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      if (original !== undefined) process.env.DEEPGRAM_API_KEY = original;
      fetchSpy.mockRestore();
    }
  });
});
