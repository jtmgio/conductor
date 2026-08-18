"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence } from "framer-motion";
import { FollowUpCard } from "@/components/FollowUpCard";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";

interface FollowUp { id: string; title: string; waitingOn: string; roleId: string; createdAt: string; staleDays: number; role: { id: string; name: string; color: string }; }
interface Role { id: string; name: string; color: string; }

export function TrackerPage() {
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const router = useRouter();
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

  // Nudging hands off to the formatter with a starter line in your voice.
  // (This used to deep-link /ai, which no longer exists.)
  const handleNudge = (id: string) => {
    const fu = followUps.find((f) => f.id === id);
    if (!fu) return;
    const days = getDaysSince(fu.createdAt);
    const draft = `Following up with ${fu.waitingOn} on: ${fu.title}${days > 0 ? ` — it's been ${days} day${days === 1 ? "" : "s"}.` : "."}`;
    try {
      sessionStorage.setItem("conductor-format-handoff", JSON.stringify({ text: draft, roleId: fu.roleId }));
    } catch {}
    router.push("/formatter");
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
    <>
      <div className="mx-auto max-w-2xl pt-1">
        <h1 className="text-[26px] font-bold tracking-tight text-[var(--text-primary)]">Waiting on</h1>
        <p className="mt-1 text-[14px] text-[var(--text-tertiary)]">
          Things other people owe you. Stale ones surface on their own — you don&apos;t have to check.
        </p>
        <div className="mt-5 mb-7 flex gap-2 overflow-x-auto hide-scrollbar py-1">
          {["all", "stale"].map((key) => (
            <button key={key} onClick={() => setFilter(key)}
              className={cn("min-h-[36px] px-3.5 rounded-xl text-[13px] font-medium whitespace-nowrap transition-colors shrink-0 border",
                filter === key
                  ? "border-[var(--border-strong)] bg-[var(--surface-raised)] text-[var(--text-primary)]"
                  : "border-[var(--border-subtle)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
              )}
            >{key === "all" ? "All" : "Stale"}</button>
          ))}
          {roles.map((role) => (
            <button key={role.id} onClick={() => setFilter(role.id)}
              className={cn("min-h-[36px] px-3.5 rounded-xl text-[13px] font-medium whitespace-nowrap transition-colors shrink-0 flex items-center gap-1.5 border",
                filter === role.id
                  ? "border-[var(--border-strong)] bg-[var(--surface-raised)] text-[var(--text-primary)]"
                  : "border-[var(--border-subtle)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
              )}
            >
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: role.color }} />
              {role.name}
            </button>
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="py-16 text-center">
            <p className="text-[14px] text-[var(--text-tertiary)]">Nobody owes you anything right now.</p>
          </div>
        )}

        <div className="flex flex-col gap-6">
          {orderedGroups.map(({ role, items }) => (
            <div key={role.id}>
              <div className="mb-2 flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: role.color }} />
                <h2 className="text-[15px] font-semibold" style={{ color: role.color }}>{role.name}</h2>
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
    </>
  );
}
