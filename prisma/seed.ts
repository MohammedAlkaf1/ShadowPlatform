import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const DEMO_PASSWORD = "Password123!";

async function main() {
  console.log("Seeding Shadow Platform demo data...");

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  // ── Tenant ──────────────────────────────────────────────────────────
  const tenant = await prisma.tenant.upsert({
    where: { id: "00000000-0000-0000-0000-000000000001" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000001",
      name: "جامعة الرياض التجريبية",
      nameEn: "Demo University of Riyadh",
      active: true,
      selfSignupEnabled: true,
      emailDomain: "demo.shadow.sa",
      documentRetentionDays: 90,
    },
  });

  // ── Classification taxonomy ─────────────────────────────────────────
  const categoriesData = [
    {
      code: "NEURODEVELOPMENTAL",
      nameAr: "اضطرابات النمو العصبي",
      nameEn: "Neurodevelopmental Disorders",
      conditions: [
        { nameAr: "التوحد", nameEn: "Autism" },
        { nameAr: "فرط الحركة وتشتت الانتباه", nameEn: "ADHD" },
      ],
    },
    {
      code: "LEARNING_DIFFICULTIES",
      nameAr: "صعوبات التعلم",
      nameEn: "Learning Difficulties",
      conditions: [
        { nameAr: "صعوبات القراءة", nameEn: "Reading Difficulties (Dyslexia)" },
        { nameAr: "صعوبات الكتابة", nameEn: "Writing Difficulties" },
        { nameAr: "صعوبات الحساب", nameEn: "Math Difficulties (Dyscalculia)" },
        { nameAr: "صعوبات الفهم الأكاديمي", nameEn: "Academic Comprehension Difficulties" },
      ],
    },
    {
      code: "MILD_COGNITIVE",
      nameAr: "الإعاقات الإدراكية الخفيفة",
      nameEn: "Mild Cognitive Disabilities",
      conditions: [{ nameAr: "الإعاقة الذهنية البسيطة", nameEn: "Mild Intellectual Disability" }],
    },
    {
      code: "COMMUNICATION_LANGUAGE",
      nameAr: "اضطرابات التواصل واللغة",
      nameEn: "Communication & Language Disorders",
      conditions: [
        { nameAr: "صعوبات النطق", nameEn: "Speech Difficulties" },
        { nameAr: "الفهم اللغوي", nameEn: "Language Comprehension" },
        { nameAr: "التعبير", nameEn: "Expression" },
      ],
    },
    {
      code: "BEHAVIORAL_EMOTIONAL",
      nameAr: "الاضطرابات السلوكية والانفعالية",
      nameEn: "Behavioral & Emotional Disorders",
      conditions: [
        { nameAr: "مشكلات السلوك", nameEn: "Behavior Problems" },
        { nameAr: "الاندفاع", nameEn: "Impulsivity" },
        { nameAr: "القلق داخل البيئة التعليمية", nameEn: "Academic Anxiety" },
      ],
    },
  ];

  const conditionsByNameAr: Record<string, { id: string }> = {};

  for (const cat of categoriesData) {
    const category = await prisma.category.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code: cat.code } },
      update: {},
      create: {
        tenantId: tenant.id,
        code: cat.code,
        nameAr: cat.nameAr,
        nameEn: cat.nameEn,
      },
    });

    for (const cond of cat.conditions) {
      const existing = await prisma.condition.findFirst({
        where: { tenantId: tenant.id, categoryId: category.id, nameAr: cond.nameAr },
      });
      const condition =
        existing ??
        (await prisma.condition.create({
          data: {
            tenantId: tenant.id,
            categoryId: category.id,
            nameAr: cond.nameAr,
            nameEn: cond.nameEn,
          },
        }));
      conditionsByNameAr[cond.nameAr] = condition;
    }
  }

  // ── Support levels ──────────────────────────────────────────────────
  const levelDefs = [
    { order: 1, nameAr: "دعم خفيف" },
    { order: 2, nameAr: "دعم متوسط" },
    { order: 3, nameAr: "دعم مكثف" },
  ];
  const levels: Record<number, { id: string }> = {};
  for (const lvl of levelDefs) {
    const level = await prisma.supportLevel.upsert({
      where: { tenantId_order: { tenantId: tenant.id, order: lvl.order } },
      update: {},
      create: { tenantId: tenant.id, order: lvl.order, nameAr: lvl.nameAr },
    });
    levels[lvl.order] = level;
  }

  // ── Demo users (one per role) ───────────────────────────────────────
  async function upsertUser(
    email: string,
    role: "student" | "faculty" | "specialist" | "admin",
    fullName: string
  ) {
    return prisma.user.upsert({
      where: { tenantId_email: { tenantId: tenant.id, email } },
      update: { fullName },
      create: { tenantId: tenant.id, email, fullName, passwordHash, role, active: true },
    });
  }

  const studentUser = await upsertUser("student@demo.shadow.sa", "student", "أحمد محمد الطالب");
  const facultyUser = await upsertUser("faculty@demo.shadow.sa", "faculty", "سارة عبدالله الأستاذة");
  const specialistUser = await upsertUser("specialist@demo.shadow.sa", "specialist", "نورة سعيد المختصة");
  const adminUser = await upsertUser("admin@demo.shadow.sa", "admin", "خالد إبراهيم المسؤول");

  // A second student, unassigned to any specialist yet, to show the
  // "assignment is manual" boundary — not enough on its own to prove it in
  // seed data, but keeps /specialist/queue from looking like a single-row demo.
  const secondStudentUser = await upsertUser("student2@demo.shadow.sa", "student", "منى فهد الطالبة");

  const studentProfile = await prisma.studentProfile.upsert({
    where: { userId: studentUser.id },
    update: {},
    create: {
      userId: studentUser.id,
      tenantId: tenant.id,
      studentNumber: "441012345",
      major: "علوم الحاسب",
      academicStage: "السنة الثالثة",
      phone: "+966500000001",
      requestStatus: "approved",
      verified: true,
    },
  });

  const secondStudentProfile = await prisma.studentProfile.upsert({
    where: { userId: secondStudentUser.id },
    update: {},
    create: {
      userId: secondStudentUser.id,
      tenantId: tenant.id,
      studentNumber: "441098765",
      major: "إدارة الأعمال",
      academicStage: "السنة الأولى",
      phone: "+966500000002",
      requestStatus: "under_review",
      verified: true,
    },
  });

  // ── Specialist assignment (manual, by admin) ────────────────────────
  await prisma.specialistAssignment.upsert({
    where: {
      specialistUserId_studentProfileId: {
        specialistUserId: specialistUser.id,
        studentProfileId: studentProfile.id,
      },
    },
    update: {},
    create: {
      tenantId: tenant.id,
      specialistUserId: specialistUser.id,
      studentProfileId: studentProfile.id,
      assignedByUserId: adminUser.id,
    },
  });

  // ── Demo document (metadata only — no binary in DB) ─────────────────
  await prisma.document.upsert({
    where: { id: "00000000-0000-0000-0000-0000000d0c01" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-0000000d0c01",
      tenantId: tenant.id,
      studentProfileId: studentProfile.id,
      uploadedByUserId: studentUser.id,
      objectKey: `${tenant.id}/documents/${studentProfile.id}/demo-report.pdf.enc`,
      originalFilename: "التقرير-الطبي.pdf",
      mimeType: "application/pdf",
      sizeBytes: 245_760,
      encryptionKeyRef: "local-env-key-v1",
      status: "reviewed",
    },
  });

  // ── Demo assessment + support plan + tool activations ───────────────
  const assessment = await prisma.assessment.upsert({
    where: { id: "00000000-0000-0000-0000-0000000a5501" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-0000000a5501",
      tenantId: tenant.id,
      studentProfileId: studentProfile.id,
      specialistUserId: specialistUser.id,
      conditionId: conditionsByNameAr["فرط الحركة وتشتت الانتباه"].id,
      supportLevelId: levels[2].id,
      notes: "الطالب يحتاج دعمًا في التنظيم والتركيز أثناء المحاضرات والاختبارات.",
      assessedAt: new Date(),
    },
  });

  const supportPlan = await prisma.supportPlan.upsert({
    where: { id: "00000000-0000-0000-0000-000000005001" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000005001",
      tenantId: tenant.id,
      studentProfileId: studentProfile.id,
      assessmentId: assessment.id,
      approvedByUserId: specialistUser.id,
      status: "approved",
      approvedAt: new Date(),
      expiresAt: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000),
    },
  });

  const enabledTools: { toolCode: import("@prisma/client").ToolCode }[] = [
    { toolCode: "REMINDER_MODE" },
    { toolCode: "FOCUS_MODE" },
    { toolCode: "EXTRA_TIME_TRACKER" },
    // Top-level mode switches — all 4 enabled for the primary demo student
    // so the manual Phase 3 test scenario (mobile app home screen) has
    // something to show.
    { toolCode: "DEAF_MODE" },
    { toolCode: "VISUAL_MODE" },
    { toolCode: "LEARNING_MODE" },
    { toolCode: "PHYSICAL_MODE" },
  ];
  for (const tool of enabledTools) {
    await prisma.toolActivation.upsert({
      where: { supportPlanId_toolCode: { supportPlanId: supportPlan.id, toolCode: tool.toolCode } },
      update: { enabled: true },
      create: { supportPlanId: supportPlan.id, toolCode: tool.toolCode, enabled: true },
    });
  }

  // ── Faculty course links ─────────────────────────────────────────────
  await prisma.facultyCourseLink.upsert({
    where: {
      facultyUserId_studentProfileId_courseCode: {
        facultyUserId: facultyUser.id,
        studentProfileId: studentProfile.id,
        courseCode: "CS301",
      },
    },
    update: {},
    create: {
      tenantId: tenant.id,
      facultyUserId: facultyUser.id,
      studentProfileId: studentProfile.id,
      courseCode: "CS301",
      approvedAccommodations: { extraTimePercent: 50, seatingNote: "مقعد أمامي قريب من السبورة" },
    },
  });

  await prisma.facultyCourseLink.upsert({
    where: {
      facultyUserId_studentProfileId_courseCode: {
        facultyUserId: facultyUser.id,
        studentProfileId: secondStudentProfile.id,
        courseCode: "BUS101",
      },
    },
    update: {},
    create: {
      tenantId: tenant.id,
      facultyUserId: facultyUser.id,
      studentProfileId: secondStudentProfile.id,
      courseCode: "BUS101",
      approvedAccommodations: { extraTimePercent: 25 },
    },
  });

  // ── Demo usage event + mentor alert ─────────────────────────────────
  const usageEvent = await prisma.usageEvent.create({
    data: {
      tenantId: tenant.id,
      studentProfileId: studentProfile.id,
      eventType: "focus_mode_session_missed",
      payload: { sessionsMissedInRow: 3 },
      occurredAt: new Date(),
    },
  });

  await prisma.mentorAlert.create({
    data: {
      tenantId: tenant.id,
      studentProfileId: studentProfile.id,
      assignedSpecialistId: specialistUser.id,
      triggeredByUsageEventId: usageEvent.id,
      alertType: "engagement_drop",
      severity: "medium",
      status: "open",
      message: "الطالب لم يستخدم وضع التركيز في آخر 3 جلسات متتالية.",
    },
  });

  // ── Audit trail for the seed's own document review ──────────────────
  await prisma.auditLog.create({
    data: {
      tenantId: tenant.id,
      actorUserId: specialistUser.id,
      targetStudentProfileId: studentProfile.id,
      action: "view_document",
      resourceType: "Document",
    },
  });

  console.log("Seed complete.");
  console.log({
    tenant: tenant.nameEn,
    demoLogins: {
      student: "student@demo.shadow.sa",
      faculty: "faculty@demo.shadow.sa",
      specialist: "specialist@demo.shadow.sa",
      admin: "admin@demo.shadow.sa",
      password: DEMO_PASSWORD,
    },
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
