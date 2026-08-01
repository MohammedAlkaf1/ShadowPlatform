import "./setup";
import { describe, it, expect, beforeAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { tokenFor, authedRequest } from "./helpers";
import { resetRateLimitStore } from "@/lib/rate-limit";
import { POST as postEvents } from "@/app/api/events/route";

const BASE = "http://localhost/api";

describe("POST /api/events — batch acceptance and rate limiting", () => {
  let student: Awaited<ReturnType<typeof tokenFor>>;

  beforeAll(async () => {
    student = await tokenFor("student@demo.shadow.sa");
    resetRateLimitStore();
  });

  it("accepts an array of multiple events in a single request", async () => {
    const before = await prisma.usageEvent.count({
      where: { studentProfileId: await studentProfileId(student.user.id) },
    });

    const res = await postEvents(
      authedRequest(`${BASE}/events`, student.token, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          events: [
            { eventType: "mode_opened", payload: { mode: "deaf" }, occurredAt: new Date().toISOString() },
            { eventType: "tool_used", payload: { tool: "TEXT_TO_SPEECH" }, occurredAt: new Date().toISOString() },
            { eventType: "provider_error", payload: { provider: "deepgram" }, occurredAt: new Date().toISOString() },
          ],
        }),
      })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, received: 3 });

    const after = await prisma.usageEvent.count({
      where: { studentProfileId: await studentProfileId(student.user.id) },
    });
    expect(after - before).toBe(3);
  });

  it("rejects an empty events array (schema requires at least one)", async () => {
    const res = await postEvents(
      authedRequest(`${BASE}/events`, student.token, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ events: [] }),
      })
    );
    expect(res.status).toBe(400);
  });

  it("enforces the rate limit once the per-user request count exceeds the window limit", async () => {
    resetRateLimitStore();
    const makeRequest = () =>
      postEvents(
        authedRequest(`${BASE}/events`, student.token, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ events: [{ eventType: "mode_opened", occurredAt: new Date().toISOString() }] }),
        })
      );

    // The configured limit is 20/window (src/app/api/events/route.ts). Fire
    // 21 requests; the 21st must be rejected with 429.
    let lastStatus = 0;
    for (let i = 0; i < 21; i++) {
      const res = await makeRequest();
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(429);

    resetRateLimitStore(); // don't leak rate-limit state into other test files
  });

  async function studentProfileId(userId: string): Promise<string> {
    const profile = await prisma.studentProfile.findUnique({ where: { userId } });
    if (!profile) throw new Error(`No StudentProfile for user ${userId}`);
    return profile.id;
  }
});
