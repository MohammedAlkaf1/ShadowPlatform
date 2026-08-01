import dotenv from "dotenv";
import path from "path";

// Vitest doesn't read Next.js's .env.local/.env convention automatically —
// load the same files the app itself uses, in the same precedence order
// (.env first, .env.local overrides), so tests exercise the real local
// Postgres + MinIO + secrets this project already uses for `npm run dev`.
dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env.local"), override: true });
