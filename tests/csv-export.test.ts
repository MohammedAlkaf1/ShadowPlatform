import "./setup";
import { describe, it, expect, vi, beforeAll } from "vitest";
import { prisma } from "@/lib/prisma";

// The CSV export route authenticates via the web NextAuth session
// (src/lib/session.ts -> auth()), not the mobile Bearer JWT. Mock the
// NextAuth entry point so this test can call the route handler directly as
// an authenticated admin without going through a real browser login.
let adminUserId: string;
let adminTenantId: string;

vi.mock("@/auth", () => ({
  auth: async () => ({
    user: { id: adminUserId, tenantId: adminTenantId, role: "admin" },
  }),
}));

describe("admin CSV export contains no medical/sensitive fields", () => {
  beforeAll(async () => {
    const admin = await prisma.user.findFirst({ where: { email: "admin@demo.shadow.sa" } });
    if (!admin) throw new Error("Seed the demo admin user before running this test.");
    adminUserId = admin.id;
    adminTenantId = admin.tenantId;
  });

  it("has EXACTLY the four required columns, in order, and no medical data in any row", async () => {
    const { GET } = await import("@/app/api/admin/export/students/route");
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");

    const text = (await res.text()).replace(/^﻿/, ""); // strip BOM
    const lines = text.split("\r\n").filter(Boolean);
    expect(lines.length).toBeGreaterThan(0);

    const header = lines[0].split(",");
    expect(header).toEqual(["اسم الطالب", "حالة الطلب", "تاريخ التسجيل", "حالة خطة الدعم"]);

    // Forbidden: anything that could be a category name, condition name, or
    // support-level label. These are exact strings seeded into this tenant's
    // taxonomy — if any leaked into the export, one of these would match.
    const forbiddenSnippets = [
      "اضطرابات النمو العصبي",
      "صعوبات التعلم",
      "الإعاقات الإدراكية",
      "اضطرابات التواصل",
      "الاضطرابات السلوكية",
      "دعم خفيف",
      "دعم متوسط",
      "دعم مكثف",
      "التوحد",
      "فرط الحركة",
    ];
    for (const snippet of forbiddenSnippets) {
      expect(text).not.toContain(snippet);
    }

    // At least one sample data row exists and has exactly 4 columns.
    const sampleRow = lines[1];
    expect(sampleRow).toBeDefined();
    expect(sampleRow.split(",").length).toBe(4);
  });
});
