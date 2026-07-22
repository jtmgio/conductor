"use client";

import { useRouter } from "next/navigation";
import { SetupWizard } from "@/components/SetupWizard";

export function SetupClient() {
  const router = useRouter();
  const handleComplete = async () => {
    router.push("/login");
  };
  return <SetupWizard onComplete={handleComplete} />;
}
