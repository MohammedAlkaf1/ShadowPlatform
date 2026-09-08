// One-off script: creates a real, PUBLISHED exam for the seeded
// faculty@demo.shadow.sa / CS301 pairing (student@demo.shadow.sa is
// enrolled there via seed.ts's FacultyCourseLink), for manual end-to-end
// device verification of the voice-driven exam feature. Not part of the
// app or test suite — run once via `npx tsx scripts/create-test-exam.ts`
// and delete afterward.
import { prisma } from "../src/lib/prisma";

async function main() {
  const faculty = await prisma.user.findFirst({ where: { email: "faculty@demo.shadow.sa" } });
  if (!faculty) throw new Error("faculty@demo.shadow.sa not found — run `npm run prisma:seed` first");

  const exam = await prisma.exam.create({
    data: {
      tenantId: faculty.tenantId,
      title: "اختبار قصير — تجربة الاختبار الصوتي",
      facultyUserId: faculty.id,
      courseCode: "CS301",
      source: "MANUAL",
      availableAt: new Date(Date.now() - 60_000), // published (1 minute in the past)
      questions: {
        create: [
          {
            text: "كم ناتج جمع اثنين زائد اثنين؟",
            type: "MCQ",
            order: 0,
            options: {
              create: [
                { text: "ثلاثة", isCorrect: false, order: 0 },
                { text: "أربعة", isCorrect: true, order: 1 },
                { text: "خمسة", isCorrect: false, order: 2 },
              ],
            },
          },
          {
            text: "ما هي عاصمة المملكة العربية السعودية؟",
            type: "MCQ",
            order: 1,
            options: {
              create: [
                { text: "جدة", isCorrect: false, order: 0 },
                { text: "الرياض", isCorrect: true, order: 1 },
                { text: "الدمام", isCorrect: false, order: 2 },
              ],
            },
          },
        ],
      },
    },
    include: { questions: { include: { options: true } } },
  });

  console.log(JSON.stringify({ examId: exam.id, title: exam.title, questions: exam.questions.length }, null, 2));
}

main().finally(() => prisma.$disconnect());
