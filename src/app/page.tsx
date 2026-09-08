import { redirect } from "next/navigation";
import { getRequestContext } from "@/lib/session";

const ROLE_HOME: Record<string, string> = {
  student: "/student/status",
  faculty: "/faculty/students",
  specialist: "/specialist/queue",
  admin: "/admin",
};

export default async function Home() {
  const ctx = await getRequestContext();
  if (!ctx) {
    redirect("/login");
  }
  redirect(ROLE_HOME[ctx.role] ?? "/login");
}
