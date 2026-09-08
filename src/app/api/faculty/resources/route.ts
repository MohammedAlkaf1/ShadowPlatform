import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getTranslations } from "next-intl/server";
import { requireRole, AuthError } from "@/lib/session";
import { getTenantScopedPrisma } from "@/lib/tenant-db";
import { assertFacultyLinkedToStudent, FacultyAccessError } from "@/lib/faculty-access";
import { putPlainObject, buildFacultyResourceObjectKey, deleteObject } from "@/lib/s3";
import { verifyFileContent } from "@/lib/file-validation";
import { logAudit } from "@/lib/audit";
import type { FacultyResourceCategory } from "@prisma/client";

const MAX_SIZE_BYTES = Number(process.env.MAX_FACULTY_RESOURCE_SIZE_BYTES ?? 20_971_520);

const ALLOWED_TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".png": "image/png",
};

const VALID_CATEGORIES: FacultyResourceCategory[] = [
  "simplified_content",
  "visual_adjustment",
  "extra_exercises",
  "other",
];

function extensionOf(filename: string): string {
  const idx = filename.lastIndexOf(".");
  return idx === -1 ? "" : filename.slice(idx).toLowerCase();
}

/**
 * GET /api/faculty/resources?studentProfileId=...&courseCode=...
 *
 * Lists the CALLING faculty member's own uploaded resources for one
 * student in one course. Requires an actual FacultyCourseLink between this
 * faculty/student/course triple — not just role=faculty. No admin bypass:
 * FacultyResource has no admin read path in this phase at all.
 */
export async function GET(request: Request) {
  const tErrors = await getTranslations("Common.errors");
  let ctx;
  try {
    ctx = await requireRole("faculty");
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.code === "UNAUTHENTICATED" ? 401 : 403 });
    }
    throw err;
  }

  const { searchParams } = new URL(request.url);
  const studentProfileId = searchParams.get("studentProfileId");
  const courseCode = searchParams.get("courseCode");
  if (!studentProfileId || !courseCode) {
    return NextResponse.json({ error: tErrors("studentProfileIdAndCourseCodeRequired") }, { status: 400 });
  }

  try {
    await assertFacultyLinkedToStudent(ctx, studentProfileId, courseCode);
  } catch (err) {
    if (err instanceof FacultyAccessError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    throw err;
  }

  const db = getTenantScopedPrisma(ctx.tenantId);
  const resources = await db.facultyResource.findMany({
    where: {
      studentProfileId,
      courseCode,
      uploadedByUserId: ctx.userId,
      deletedAt: null,
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      category: true,
      note: true,
      originalFilename: true,
      mimeType: true,
      sizeBytes: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ resources });
}

/**
 * POST /api/faculty/resources — multipart/form-data upload.
 *
 * Fields: file, studentProfileId, courseCode, title, category? (one of the
 * fixed enum values), note?, resourceId? (when present and owned by the
 * caller, REPLACES that row's file/metadata instead of creating a new row).
 */
export async function POST(request: Request) {
  const tErrors = await getTranslations("Common.errors");
  let ctx;
  try {
    ctx = await requireRole("faculty");
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.code === "UNAUTHENTICATED" ? 401 : 403 });
    }
    throw err;
  }

  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return NextResponse.json({ error: tErrors("invalidData") }, { status: 400 });
  }

  const file = formData.get("file");
  const studentProfileId = formData.get("studentProfileId");
  const courseCode = formData.get("courseCode");
  const title = formData.get("title");
  const categoryRaw = formData.get("category");
  const noteRaw = formData.get("note");
  const resourceIdRaw = formData.get("resourceId");

  if (
    !(file instanceof File) ||
    typeof studentProfileId !== "string" ||
    typeof courseCode !== "string" ||
    typeof title !== "string" ||
    !studentProfileId ||
    !courseCode ||
    !title.trim()
  ) {
    return NextResponse.json({ error: tErrors("requiredFieldsMissing") }, { status: 400 });
  }

  const category =
    typeof categoryRaw === "string" && VALID_CATEGORIES.includes(categoryRaw as FacultyResourceCategory)
      ? (categoryRaw as FacultyResourceCategory)
      : null;
  const note = typeof noteRaw === "string" && noteRaw.trim() ? noteRaw.trim() : null;
  const resourceId = typeof resourceIdRaw === "string" && resourceIdRaw ? resourceIdRaw : null;

  const ext = extensionOf(file.name);
  const expectedMime = ALLOWED_TYPES[ext];
  if (!expectedMime || file.type !== expectedMime) {
    return NextResponse.json(
      { error: tErrors("facultyResourceFileTypeNotAllowed") },
      { status: 400 }
    );
  }
  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: tErrors("fileTooLarge") }, { status: 400 });
  }

  try {
    await assertFacultyLinkedToStudent(ctx, studentProfileId, courseCode);
  } catch (err) {
    if (err instanceof FacultyAccessError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    throw err;
  }

  const db = getTenantScopedPrisma(ctx.tenantId);
  const plaintext = Buffer.from(await file.arrayBuffer());
  if (!(await verifyFileContent(plaintext, expectedMime))) {
    return NextResponse.json({ error: tErrors("facultyResourceFileTypeNotAllowed") }, { status: 400 });
  }

  // Replace path: the resource must exist, belong to THIS faculty member,
  // and still be for this exact student/course — re-checked here even
  // though assertFacultyLinkedToStudent already passed above, since the
  // existing row's studentProfileId/courseCode could theoretically differ
  // from the ones just submitted if the client sent inconsistent values.
  if (resourceId) {
    const existing = await db.facultyResource.findUnique({ where: { id: resourceId } });
    if (
      !existing ||
      existing.deletedAt ||
      existing.uploadedByUserId !== ctx.userId ||
      existing.studentProfileId !== studentProfileId ||
      existing.courseCode !== courseCode
    ) {
      return NextResponse.json({ error: tErrors("resourceToReplaceNotFound") }, { status: 404 });
    }

    const newObjectKey = buildFacultyResourceObjectKey(ctx.tenantId, studentProfileId, resourceId, file.name);
    await putPlainObject(newObjectKey, plaintext, file.type);
    if (newObjectKey !== existing.objectKey) {
      await deleteObject(existing.objectKey).catch(() => undefined);
    }

    await db.facultyResource.update({
      where: { id: resourceId },
      data: {
        objectKey: newObjectKey,
        originalFilename: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
        title: title.trim(),
        category,
        note,
      },
    });

    await logAudit({
      tenantId: ctx.tenantId,
      actorUserId: ctx.userId,
      action: "upload_faculty_resource",
      resourceType: "FacultyResource",
      resourceId,
      targetStudentProfileId: studentProfileId,
    });

    return NextResponse.json({ ok: true, resourceId });
  }

  // Create path.
  const newId = randomUUID();
  const objectKey = buildFacultyResourceObjectKey(ctx.tenantId, studentProfileId, newId, file.name);
  await putPlainObject(objectKey, plaintext, file.type);

  await db.facultyResource.create({
    data: {
      id: newId,
      tenantId: ctx.tenantId,
      uploadedByUserId: ctx.userId,
      studentProfileId,
      courseCode,
      objectKey,
      originalFilename: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
      title: title.trim(),
      category,
      note,
    },
  });

  await logAudit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    action: "upload_faculty_resource",
    resourceType: "FacultyResource",
    resourceId: newId,
    targetStudentProfileId: studentProfileId,
  });

  return NextResponse.json({ ok: true, resourceId: newId }, { status: 201 });
}
