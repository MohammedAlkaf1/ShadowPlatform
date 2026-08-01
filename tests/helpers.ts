import "./setup";
import { prisma } from "@/lib/prisma";
import { signAccessToken } from "@/lib/mobile-jwt";
import type { User } from "@prisma/client";

export async function getDemoUser(email: string): Promise<User> {
  const user = await prisma.user.findFirst({ where: { email } });
  if (!user) {
    throw new Error(
      `Demo user ${email} not found — run "npx prisma db seed" against the test database before running tests.`
    );
  }
  return user;
}

export async function tokenFor(email: string): Promise<{ token: string; user: User }> {
  const user = await getDemoUser(email);
  const token = await signAccessToken({ userId: user.id, tenantId: user.tenantId, role: user.role });
  return { token, user };
}

export function authedRequest(url: string, token: string, init: RequestInit = {}): Request {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  return new Request(url, { ...init, headers });
}

/** Exact JSON key names that must never appear anywhere in a student-facing response. */
const FORBIDDEN_KEYS = new Set(["category", "supportLevel", "condition", "conditionId", "categoryId", "supportLevelId"]);

/** Raw values (category codes, Arabic condition/level names) that must never leak, wherever they'd appear. */
const FORBIDDEN_RAW_VALUES = [
  "NEURODEVELOPMENTAL",
  "LEARNING_DIFFICULTIES",
  "MILD_COGNITIVE",
  "COMMUNICATION_LANGUAGE",
  "BEHAVIORAL_EMOTIONAL",
  "التوحد",
  "فرط الحركة",
  "صعوبات القراءة",
  "دعم خفيف",
  "دعم متوسط",
  "دعم مكثف",
];

function collectKeys(value: unknown, keys: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, keys);
  } else if (value && typeof value === "object") {
    for (const [key, val] of Object.entries(value)) {
      keys.add(key);
      collectKeys(val, keys);
    }
  }
}

/**
 * Asserts a student-facing API response body contains neither a forbidden
 * key (category/supportLevel/condition/...) anywhere in its object tree, nor
 * any raw category code / Arabic condition / support-level name as a
 * substring anywhere in the serialized body. Deliberately does NOT just grep
 * for the substring "categor" — that would false-positive on legitimate
 * directive field names like `categoryLayer`.
 */
export function assertNoRawClassificationLeak(body: unknown): void {
  const keys = new Set<string>();
  collectKeys(body, keys);
  for (const forbidden of FORBIDDEN_KEYS) {
    if (keys.has(forbidden)) {
      throw new Error(`Response leaks forbidden key "${forbidden}": ${JSON.stringify(body)}`);
    }
  }
  const serialized = JSON.stringify(body);
  for (const rawValue of FORBIDDEN_RAW_VALUES) {
    if (serialized.includes(rawValue)) {
      throw new Error(`Response leaks forbidden raw value "${rawValue}": ${serialized}`);
    }
  }
}
