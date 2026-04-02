"use client";

import { useEffect, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { AppShell } from "@/components/AppShell";
import { FollowUpCard } from "@/components/FollowUpCard";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";

interface FollowUp { id: string; title: string; waitingOn: string; roleId: string; createdAt: string; staleDays: number; role: { id: string; name: string; color: string }; }
interface Role { id: string; name: string; color: string; }

export function TrackerPage() {
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const { toast } = useToast();

  useEffect(() => {
    async function load() {
      try {
        const [fuRes, rolesRes] = await Promise.all([fetch("/api/followups?status=waiting"), fetch("/api/roles")]);
        const fuData = await fuRes.json(); const rolesData = await rolesRes.json();
        setFollowUps(Array.isArray(fuData) ? fuData : []);
        setRoles(Array.isArray(rolesData) ? rolesData : []);
      } catch {}
    }
    load();
  }, []);

  const handleResolve = async (id: string) => {
    try {
      const res = await fetch(`/api/followups/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "resolved" }) });
      if (!res.ok) throw new Error();
      setFollowUps((prev) => prev.filter((fu) => fu.id !== id));
    } catch {
      toast("Failed to resolve follow-up", "error");
    }
  };

  const handleNudge = (id: string) => {
    const fu = followUps.find((f) => f.id === id);
    if (fu) window.location.href = `/ai?draft=true&roleId=${fu.roleId}&topic=Follow up on: ${fu.title}&recipient=${fu.waitingOn}`;
  };

  const getDaysSince = (createdAt: string) => Math.floor((Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24));

  const filtered = followUps.filter((fu) => {
    if (filter === "all") return true;
    if (filter === "stale") return getDaysSince(fu.createdAt) >= fu.staleDays;
    return fu.roleId === filter;
  });

  const grouped = filtered.reduce<Record<string, FollowUp[]>>((acc, fu) => { if (!acc[fu.roleId]) acc[fu.roleId] = []; acc[fu.roleId].push(fu); return acc; }, {});
  const orderedGroups = roles.filter((r) => grouped[r.id]).map((r) => ({ role: r, items: grouped[r.id] }));

  return (
    <AppShell>
      <div className="py-6">
        <h1 className="text-[32px] font-semibold text-[var(--text-primary)] mb-6">Tracker</h1>
        <div className="flex gap-2 overflow-x-auto hide-scrollbar py-1 mb-8">
          {["all", "stale"].map((key) => (
            <button key={key} onClick={() => setFilter(key)}
              className={cn("px-4 py-1.5 rounded-full text-[15px] font-medium whitespace-nowrap transition-colors shrink-0",
                filter === key ? "bg-[var(--accent-blue)] text-white" : "border border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--sidebar-hover)]"
              )}
            >{key === "all" ? "All" : "Stale"}</button>
          ))}
          {roles.map((role) => (
            <button key={role.id} onClick={() => setFilter(role.id)}
              className={cn("px-4 py-1.5 rounded-full text-[15px] font-medium whitespace-nowrap transition-colors shrink-0 flex items-center gap-1.5",
                filter === role.id ? "bg-[var(--accent-blue)] text-white" : "border border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--sidebar-hover)]"
              )}
            >
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: filter === role.id ? "white" : role.color }} />
              {role.name}
            </button>
          ))}
        </div>

        {filtered.length === 0 && <div className="py-16 text-center"><p className="text-[var(--text-tertiary)] text-sm">No active follow-ups</p></div>}

        <div className="space-y-8">
          {orderedGroups.map(({ role, items }) => (
            <div key={role.id}>
              <div className="mb-3">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[13px] font-semibold" style={{ backgroundColor: `${role.color}1a`, color: role.color }}>
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: role.color }} />{role.name}
                </span>
              </div>
              <div className="space-y-2.5">
                <AnimatePresence>
                  {items.map((fu) => <FollowUpCard key={fu.id} id={fu.id} title={fu.title} waitingOn={fu.waitingOn} roleColor={fu.role.color} createdAt={fu.createdAt} staleDays={fu.staleDays} onResolve={handleResolve} onNudge={handleNudge} />)}
                </AnimatePresence>
              </div>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
