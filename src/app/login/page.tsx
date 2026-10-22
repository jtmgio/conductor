"use client";

import { useEffect } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

// No password — this page just mints the session and moves on.
export default function LoginPage() {
  const router = useRouter();

  useEffect(() => {
    fetch("/api/setup").then((r) => r.json()).then(async (data) => {
      if (data.needsSetup) return router.replace("/setup");
      await signIn("credentials", { redirect: false });
      router.replace("/");
    }).catch(() => {});
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--surface)]">
      <Loader2 className="h-6 w-6 animate-spin text-[var(--text-tertiary)]" />
    </div>
  );
}
