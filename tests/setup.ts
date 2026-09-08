import dotenv from "dotenv";
import path from "path";
import { vi } from "vitest";
import arMessages from "../messages/ar.json";

// Vitest doesn't read Next.js's .env.local/.env convention automatically —
// load the same files the app itself uses, in the same precedence order
// (.env first, .env.local overrides), so tests exercise the real local
// Postgres + MinIO + secrets this project already uses for `npm run dev`.
dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env.local"), override: true });

// next-intl's server APIs (getTranslations/getLocale) read from Next's
// request-scoped AsyncLocalStorage context, which only exists inside a real
// Next.js request lifecycle — these tests call route handlers as plain
// functions, so that context is never established and next-intl throws
// "not supported in Client Components". Route handlers started calling
// getTranslations for locale-aware error messages partway through this
// project's localization work; this mock keeps those routes directly
// unit-testable by resolving real strings from messages/ar.json (the
// app's own DEFAULT_LOCALE — see src/i18n/request.ts) instead of going
// through next-intl's request-context machinery. Tests that care about
// message *content* would need updating regardless of locale; tests here
// only assert on status codes / response shape / forbidden-value absence.
function resolveNamespace(namespace?: string): Record<string, unknown> {
  if (!namespace) return arMessages as unknown as Record<string, unknown>;
  return namespace
    .split(".")
    .reduce<Record<string, unknown>>((obj, key) => (obj?.[key] as Record<string, unknown>) ?? {}, arMessages as unknown as Record<string, unknown>);
}

function makeTranslator(namespace?: string) {
  const dict = resolveNamespace(namespace);
  const t = (key: string, params?: Record<string, unknown>) => {
    const raw = dict[key];
    let value = typeof raw === "string" ? raw : key;
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        value = value.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
      }
    }
    return value;
  };
  t.has = (key: string) => typeof dict[key] === "string";
  return t;
}

vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace?: string) => makeTranslator(namespace),
  getLocale: async () => "ar",
  getMessages: async () => arMessages,
}));
