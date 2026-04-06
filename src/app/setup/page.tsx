"use client";

import { useRouter } from "next/navigation";
import { SetupWizard } from "@/components/SetupWizard";

export default function SetupPage() {
  const router = useRouter();

  const handleComplete = async () => {
    // After setup, sign in with the password they just set
    // Then redirect to home
    router.push("/login");
  };

  return <SetupWizard onComplete={handleComplete} />;
}
