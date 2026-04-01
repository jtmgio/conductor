"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { InboxProcessor } from "@/components/InboxProcessor";

interface Role { id: string; name: string; color: string; }

export function InboxPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/roles").then((r) => r.json()).then((data) => { setRoles(Array.isArray(data) ? data : []); setLoaded(true); }).catch(() => setLoaded(true));
  }, []);

  return (
    <AppShell>
      <div className="py-6">
        <h1 className="text-[32px] font-semibold text-[var(--text-primary)] mb-6">Inbox</h1>
        {!loaded ? (
          <div className="py-20 flex justify-center"><div className="w-5 h-5 border-2 border-[var(--border-default)] border-t-[var(--accent-blue)] rounded-full animate-spin" /></div>
        ) : roles.length > 0 ? <InboxProcessor roles={roles} /> : null}
      </div>
    </AppShell>
  );
}
