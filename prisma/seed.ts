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
    fullName: string,
    fullNameEn: string
  ) {
    return prisma.user.upsert({
      where: { tenantId_email: { tenantId: tenant.id, email } },
      update: { fullName, fullNameEn },
      create: { tenantId: tenant.id, email, fullName, fullNameEn, passwordHash, role, active: true },
    });
  }

  // Batch 7: dropped the trailing role-descriptor word ("الطالب"/"الأستاذة"/
  // etc.) that used to be baked into these names — now redundant now that
  // the role is ALSO shown as its own badge next to the name wherever
  // fullName is displayed, which produced duplicated, differently-worded
  // role info (e.g. "سارة عبدالله الأستاذة" next to a badge reading "عضو
  // هيئة تدريس").
  // A previous seed revision created a SEPARATE "ريم القحطاني" user under
  // 441204567@student.ksu.edu.sa for a thin, unrelated demo scenario. That
  // scenario has since been merged into the primary student below, so this
  // is now the primary student's real, permanent identity — but she
  // already has her own real AuditLog rows (append-only, never deleted, by
  // design — see audit.ts), so she can't be deleted and re-created under a
  // renamed "أحمد محمد" row. Instead: if she already exists, reuse her
  // row as-is (do NOT rename "أحمد محمد" — leave that old row alone,
  // orphaned but harmless, same as other unused historical seed rows);
  // otherwise (a fresh DB that never had her), rename "أحمد محمد" in place,
  // same reasoning as the specialist rename below.
  const existingReem = await prisma.user.findFirst({
    where: { tenantId: tenant.id, email: "441204567@student.ksu.edu.sa" },
  });
  const staleStudent = existingReem
    ? null
    : await prisma.user.findFirst({ where: { tenantId: tenant.id, email: "student@demo.shadow.sa" } });
  const studentUser =
    existingReem ??
    (staleStudent
      ? await prisma.user.update({
          where: { id: staleStudent.id },
          data: { email: "441204567@student.ksu.edu.sa", fullName: "ريم القحطاني", fullNameEn: "Reem Alqahtani" },
        })
      : await upsertUser("441204567@student.ksu.edu.sa", "student", "ريم القحطاني", "Reem Alqahtani"));
  const facultyUser = await upsertUser("faculty@demo.shadow.sa", "faculty", "سارة عبدالله", "Sarah Abdullah");
  // Renamed from "نورة سعيد" / specialist@demo.shadow.sa. Renaming in place
  // (rather than upserting under the new email) so environments seeded
  // before this rename don't end up with an orphaned duplicate row.
  const staleSpecialist = await prisma.user.findFirst({
    where: { tenantId: tenant.id, email: "specialist@demo.shadow.sa" },
  });
  const specialistUser = staleSpecialist
    ? await prisma.user.update({
        where: { id: staleSpecialist.id },
        data: { email: "h.alzahrani@ksu.edu.sa", fullName: "هند الزهراني", fullNameEn: "Hind Alzahrani" },
      })
    : await upsertUser("h.alzahrani@ksu.edu.sa", "specialist", "هند الزهراني", "Hind Alzahrani");
  const adminUser = await upsertUser("admin@demo.shadow.sa", "admin", "خالد إبراهيم", "Khalid Ibrahim");

  // A second student, unassigned to any specialist yet, to show the
  // "assignment is manual" boundary — not enough on its own to prove it in
  // seed data, but keeps /specialist/queue from looking like a single-row demo.
  const secondStudentUser = await upsertUser("student2@demo.shadow.sa", "student", "منى فهد", "Mona Fahad");

  const studentProfile = await prisma.studentProfile.upsert({
    where: { userId: studentUser.id },
    // Explicit update (not `{}`) so a re-seed of an already-seeded DB
    // actually refreshes these fields to Reem's identity, and clears
    // `deletedAt` — this profile is the same row that used to be "أحمد
    // محمد" and had accumulated real interactive-testing state earlier
    // this session, including a manual soft-delete during that testing.
    update: {
      studentNumber: "441204567",
      major: "إدارة الأعمال",
      majorEn: "Business Administration",
      academicStage: "السنة الثانية",
      academicStageEn: "Second Year",
      phone: "+966500000003",
      requestStatus: "approved",
      verified: true,
      deletedAt: null,
    },
    create: {
      userId: studentUser.id,
      tenantId: tenant.id,
      studentNumber: "441204567",
      major: "إدارة الأعمال",
      majorEn: "Business Administration",
      academicStage: "السنة الثانية",
      academicStageEn: "Second Year",
      phone: "+966500000003",
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
      majorEn: "Business Administration",
      academicStage: "السنة الأولى",
      academicStageEn: "First Year",
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

  // ── Demo documents for "مستنداتي" (metadata only — no binary in DB) ──
  // Fixed createdAt values (not the default now()) so these always sort in
  // the same relative order regardless of which seed run actually inserted
  // each row.
  const demoDocuments = [
    {
      id: "00000000-0000-0000-0000-0000000d0c01",
      filename: "تقرير التقييم الأكاديمي",
      filenameEn: "Academic Evaluation Report",
      sizeBytes: 1_258_291,
      createdAt: new Date("2025-08-02T10:00:00Z"),
      status: "reviewed" as const,
      documentType: "تقرير طبي وتقييم أكاديمي",
      documentTypeEn: "Medical report and academic evaluation",
      issuingEntity: "مستشفى الملك خالد الجامعي",
      issuingEntityEn: "King Khalid University Hospital",
    },
    {
      id: "00000000-0000-0000-0000-0000000d0c02",
      filename: "خطاب الطبيب المعالج",
      filenameEn: "Attending Physician Letter",
      sizeBytes: 838_861,
      createdAt: new Date("2025-08-01T10:00:00Z"),
      status: "reviewed" as const,
      documentType: "خطاب طبي",
      documentTypeEn: "Medical letter",
      issuingEntity: "مستشفى الملك خالد الجامعي",
      issuingEntityEn: "King Khalid University Hospital",
    },
    {
      id: "00000000-0000-0000-0000-0000000d0c03",
      filename: "كشف الدرجات الجامعي",
      filenameEn: "University Transcript",
      sizeBytes: 524_288,
      createdAt: new Date("2025-08-01T09:00:00Z"),
      status: "reviewed" as const,
      documentType: null,
      documentTypeEn: null,
      issuingEntity: null,
      issuingEntityEn: null,
    },
    {
      id: "00000000-0000-0000-0000-0000000d0c04",
      filename: "استمارة طلب الإتاحة",
      filenameEn: "Accommodation Request Form",
      sizeBytes: 314_573,
      createdAt: new Date("2025-08-02T09:00:00Z"),
      status: "needs_update" as const,
      documentType: null,
      documentTypeEn: null,
      issuingEntity: null,
      issuingEntityEn: null,
    },
  ];
  for (const doc of demoDocuments) {
    const shared = {
      studentProfileId: studentProfile.id,
      uploadedByUserId: studentUser.id,
      originalFilename: doc.filename,
      originalFilenameEn: doc.filenameEn,
      mimeType: "application/pdf",
      sizeBytes: doc.sizeBytes,
      status: doc.status,
      documentType: doc.documentType,
      documentTypeEn: doc.documentTypeEn,
      issuingEntity: doc.issuingEntity,
      issuingEntityEn: doc.issuingEntityEn,
      createdAt: doc.createdAt,
    };
    await prisma.document.upsert({
      where: { id: doc.id },
      update: shared,
      create: {
        id: doc.id,
        tenantId: tenant.id,
        objectKey: `${tenant.id}/documents/${studentProfile.id}/${doc.id}.pdf.enc`,
        encryptionKeyRef: "local-env-key-v1",
        ...shared,
      },
    });
  }

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

  // ── Faculty resources shared with the primary student ────────────────
  const facultyResourcesData = [
    {
      id: "00000000-0000-0000-0000-0000000f0001",
      title: "ملخص إحصاء 201 – الأسبوع الرابع",
      titleEn: "STAT 201 Summary – Week 4",
      filename: "stat201-week4-summary.pdf",
      category: "simplified_content" as const,
      note: "ملف مخصص لك",
      noteEn: "File customized for you",
    },
    {
      id: "00000000-0000-0000-0000-0000000f0002",
      title: "شرائح المحاضرة السابعة",
      titleEn: "Lecture 7 Slides",
      filename: "cs301-lecture7-slides.pdf",
      category: "visual_adjustment" as const,
      note: null,
      noteEn: null,
    },
  ];
  for (const res of facultyResourcesData) {
    const shared = {
      tenantId: tenant.id,
      uploadedByUserId: facultyUser.id,
      studentProfileId: studentProfile.id,
      courseCode: "CS301",
      objectKey: `${tenant.id}/faculty-resources/${studentProfile.id}/${res.filename}`,
      originalFilename: res.filename,
      mimeType: "application/pdf",
      sizeBytes: 180_224,
      title: res.title,
      titleEn: res.titleEn,
      category: res.category,
      note: res.note,
      noteEn: res.noteEn,
    };
    await prisma.facultyResource.upsert({
      where: { id: res.id },
      update: shared,
      create: { id: res.id, ...shared },
    });
  }

  // ── Demo usage event + mentor alert ─────────────────────────────────
  // Fixed ids (like the demoDocuments block above) so reseeding updates
  // this one demo alert in place instead of accumulating a fresh
  // duplicate row every run.
  const usageEvent = await prisma.usageEvent.upsert({
    where: { id: "00000000-0000-0000-0000-00000ue0001" },
    update: {
      tenantId: tenant.id,
      studentProfileId: studentProfile.id,
      eventType: "focus_mode_session_missed",
      payload: { sessionsMissedInRow: 3 },
    },
    create: {
      id: "00000000-0000-0000-0000-00000ue0001",
      tenantId: tenant.id,
      studentProfileId: studentProfile.id,
      eventType: "focus_mode_session_missed",
      payload: { sessionsMissedInRow: 3 },
      occurredAt: new Date(),
    },
  });

  const mentorAlertShared = {
    tenantId: tenant.id,
    studentProfileId: studentProfile.id,
    assignedSpecialistId: specialistUser.id,
    triggeredByUsageEventId: usageEvent.id,
    alertType: "engagement_drop",
    severity: "medium" as const,
    message: "الطالب لم يستخدم وضع التركيز في آخر 3 جلسات متتالية.",
    messageEn: "The student hasn't used Focus Mode in the last 3 consecutive sessions.",
  };
  await prisma.mentorAlert.upsert({
    where: { id: "00000000-0000-0000-0000-00000ma0001" },
    update: mentorAlertShared,
    create: { id: "00000000-0000-0000-0000-00000ma0001", status: "open", ...mentorAlertShared },
  });

  // Clean up stale duplicate demo alerts created by earlier non-idempotent
  // seed runs (before this upsert existed) — real leftover rows, not fake
  // data, but they shouldn't keep multiplying every reseed.
  await prisma.mentorAlert.deleteMany({
    where: { tenantId: tenant.id, id: { not: "00000000-0000-0000-0000-00000ma0001" }, alertType: "engagement_drop" },
  });
  await prisma.usageEvent.deleteMany({
    where: { tenantId: tenant.id, id: { not: "00000000-0000-0000-0000-00000ue0001" }, eventType: "focus_mode_session_missed" },
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
      student: "441204567@student.ksu.edu.sa",
      faculty: "faculty@demo.shadow.sa",
      specialist: "h.alzahrani@ksu.edu.sa",
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
