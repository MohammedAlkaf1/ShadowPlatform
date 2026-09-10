import { z } from "zod";

// Field-level messages are intentionally omitted here (Zod's default
// messages are never surfaced to the user — every caller of these schemas
// falls back to a locale-aware `Common.errors.invalidData` message instead
// of reading `parsed.error.issues[0]?.message`, since a hardcoded message
// here can't vary by request locale the way a next-intl translation can).
export const studentRegisterSchema = z.object({
  email: z.string().email(),
  fullName: z.string().min(2),
  password: z.string().min(8),
  studentNumber: z.string().min(3),
  major: z.string().min(2),
  academicStage: z.string().min(1),
  phone: z.string().min(8),
});

export type StudentRegisterInput = z.infer<typeof studentRegisterSchema>;

export const assessmentSchema = z.object({
  studentProfileId: z.string().uuid(),
  conditionId: z.string().uuid(),
  supportLevelId: z.string().uuid(),
  notes: z.string().min(5),
});

export const createUserSchema = z.object({
  email: z.string().email(),
  fullName: z.string().min(2),
  // Optional English rendering of fullName — same ar/en pairing convention
  // as every other localized field in the schema (User.fullNameEn etc.).
  // Never auto-translated; left null when not explicitly provided.
  fullNameEn: z.string().trim().optional(),
  password: z.string().min(8),
  role: z.enum(["student", "faculty", "specialist", "admin"]),
  // Only meaningful when role === "student" - optional here since the field
  // doesn't apply to the other three roles.
  studentNumber: z.string().optional(),
});

// Admin "Edit user" form — same ar/en pairing + optional-studentNumber
// convention as createUserSchema above (studentNumber only meaningful when
// role === "student").
export const updateUserProfileSchema = z.object({
  userId: z.string().uuid(),
  email: z.string().email(),
  fullName: z.string().min(2),
  fullNameEn: z.string().trim().optional(),
  role: z.enum(["student", "faculty", "specialist", "admin"]),
  studentNumber: z.string().optional(),
});
