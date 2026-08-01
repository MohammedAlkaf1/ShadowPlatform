"use client";

import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";

export function SignOutButton() {
  return (
    <Button
      variant="ghost"
      size="sm"
      className="text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
      onClick={() => signOut({ callbackUrl: "/login" })}
    >
      <LogOut className="size-4 ms-2" />
      تسجيل الخروج
    </Button>
  );
}
