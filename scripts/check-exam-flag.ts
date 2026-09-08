import { prisma } from "../src/lib/prisma";
async function main() {
  const exam = await prisma.exam.findUnique({ where: { id: "8a06eed6-3b65-4c8e-9ab6-de32264a5be6" } });
  console.log(JSON.stringify({ showResultsToStudents: exam?.showResultsToStudents }, null, 2));
}
main().finally(() => prisma.$disconnect());
