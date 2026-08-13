import { z } from "zod";

export const studentRegisterSchema = z.object({
  email: z.string().email("بريد إلكتروني غير صالح"),
  password: z.string().min(8, "كلمة المرور يجب ألا تقل عن 8 أحرف"),
  studentNumber: z.string().min(3, "الرقم الجامعي مطلوب"),
  major: z.string().min(2, "التخصص مطلوب"),
  academicStage: z.string().min(1, "المرحلة الدراسية مطلوبة"),
  phone: z.string().min(8, "رقم الجوال مطلوب"),
});

export type StudentRegisterInput = z.infer<typeof studentRegisterSchema>;

export const assessmentSchema = z.object({
  studentProfileId: z.string().uuid(),
  conditionId: z.string().uuid(),
  supportLevelId: z.string().uuid(),
  notes: z.string().min(5, "الرجاء إدخال ملاحظات كافية"),
});

export const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(["student", "faculty", "specialist", "admin"]),
  // Only meaningful when role === "student" - optional here since the field
  // doesn't apply to the other three roles.
  studentNumber: z.string().optional(),
});

export const updateUserSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(["student", "faculty", "specialist", "admin"]).optional(),
  active: z.boolean().optional(),
});
