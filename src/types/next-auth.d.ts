import type { UserRole } from "@prisma/client";
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface User {
    id: string;
    tenantId: string;
    role: UserRole;
    email: string;
    tenantName: string;
  }

  interface Session {
    user: {
      id: string;
      tenantId: string;
      role: UserRole;
      tenantName: string;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId: string;
    tenantId: string;
    role: UserRole;
    tenantName: string;
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    userId: string;
    tenantId: string;
    role: UserRole;
    tenantName: string;
  }
}
