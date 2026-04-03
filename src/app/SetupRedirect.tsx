"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function SetupRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/setup"); }, [router]);
  return null;
}
