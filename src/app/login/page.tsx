"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    const result = await signIn("credentials", { password, redirect: false });
    if (result?.error) { setError("Invalid password"); setLoading(false); }
    else router.push("/");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--surface)]">
      <div className="w-full max-w-[380px] px-8 py-10">
        <div className="text-center">
          <h1 className="text-[40px] font-bold text-[var(--text-primary)]">Conductor</h1>
          <p className="text-[16px] text-[var(--text-tertiary)] mt-2">Personal productivity OS</p>
          <div className="w-10 h-px bg-[var(--border-default)] mx-auto mt-4 mb-8" />
        </div>
        <form onSubmit={handleSubmit}>
          <input type="password" placeholder="Enter password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus
            className="w-full h-12 px-4 rounded-xl bg-[var(--surface-raised)] border border-[var(--border-subtle)] text-[16px] text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--accent-blue)]/20 transition-all placeholder:text-[var(--text-tertiary)]"
          />
          {error && <p className="text-sm text-red-400 mt-2">{error}</p>}
          <button type="submit" disabled={loading}
            className="w-full h-12 mt-4 bg-[var(--accent-blue)] text-white text-[17px] font-semibold rounded-xl hover:opacity-90 transition-opacity active:scale-[0.98] disabled:opacity-50 flex items-center justify-center"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
