"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { DollarSign } from "lucide-react";

interface UsageData {
  totalCostCents: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCalls: number;
  todayCents: number;
  weekCents: number;
  monthCents: number;
  byDay: Record<string, { costCents: number; calls: number }>;
  byEndpoint: Record<string, { costCents: number; calls: number; inputTokens: number; outputTokens: number }>;
  byRole: Record<string, { costCents: number; calls: number }>;
  recent: Array<{
    id: string;
    endpoint: string;
    roleId: string | null;
    model: string;
    inputTokens: number;
    outputTokens: number;
    costCents: number;
    createdAt: string;
  }>;
}

// Role names and colors fetched dynamically — no hardcoded mapping

const ENDPOINT_LABELS: Record<string, string> = {
  chat: "Chat",
  extract: "Extract",
  draft: "Draft",
  summarize: "Summarize",
};

function formatCost(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

export function CostsContent() {
  const [data, setData] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [roleNames, setRoleNames] = useState<Record<string, string>>({});
  const [roleColors, setRoleColors] = useState<Record<string, string>>({});

  useEffect(() => {
    Promise.all([
      fetch("/api/ai/usage?days=30").then((r) => r.json()),
      fetch("/api/roles").then((r) => r.json()),
    ]).then(([usage, roles]) => {
      setData(usage);
      if (Array.isArray(roles)) {
        setRoleNames(Object.fromEntries(roles.map((r: { id: string; name: string }) => [r.id, r.name])));
        setRoleColors(Object.fromEntries(roles.map((r: { id: string; color: string }) => [r.id, r.color])));
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="py-20 flex justify-center">
        <div className="w-5 h-5 border-2 border-[var(--border-default)] border-t-[var(--accent-blue)] rounded-full animate-spin" />
      </div>
    );
  }

  if (!data) {
    return (
      <div>
        <h1 className="text-[32px] font-semibold text-[var(--text-primary)] mb-6">AI Costs</h1>
        <p className="text-[var(--text-tertiary)]">Failed to load usage data.</p>
      </div>
    );
  }

  // Build daily chart data (last 14 days)
  const dailyKeys: string[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    dailyKeys.push(d.toISOString().slice(0, 10));
  }
  const dailyData = dailyKeys.map((key) => ({
    date: key,
    costCents: data.byDay[key]?.costCents || 0,
    calls: data.byDay[key]?.calls || 0,
  }));
  const maxDailyCost = Math.max(...dailyData.map((d) => d.costCents), 1);

  // Sort endpoints by cost
  const endpointEntries = Object.entries(data.byEndpoint).sort((a, b) => b[1].costCents - a[1].costCents);
  const maxEndpointCost = Math.max(...endpointEntries.map(([, v]) => v.costCents), 1);

  // Sort roles by cost
  const roleEntries = Object.entries(data.byRole).sort((a, b) => b[1].costCents - a[1].costCents);
  const maxRoleCost = Math.max(...roleEntries.map(([, v]) => v.costCents), 1);

  return (
    <div>
      <div className="flex items-center gap-2.5 mb-8">
        <DollarSign className="h-6 w-6 text-[var(--text-tertiary)]" />
        <h1 className="text-[32px] font-semibold text-[var(--text-primary)]">AI Costs</h1>
      </div>

        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-3 mb-8">
          {[
            { label: "Today", value: data.todayCents },
            { label: "This week", value: data.weekCents },
            { label: "This month", value: data.monthCents },
          ].map((card) => (
            <div key={card.label} className="bg-[var(--surface-raised)] border border-[var(--border-subtle)] rounded-xl p-4">
              <p className="text-[13px] text-[var(--text-tertiary)] mb-1">{card.label}</p>
              <p className="text-2xl font-bold text-[var(--text-primary)]">{formatCost(card.value)}</p>
            </div>
          ))}
        </div>

        {/* Totals row */}
        <div className="grid grid-cols-3 gap-3 mb-8">
          <div className="bg-[var(--surface-raised)] border border-[var(--border-subtle)] rounded-xl p-4">
            <p className="text-[13px] text-[var(--text-tertiary)] mb-1">Total calls</p>
            <p className="text-xl font-semibold text-[var(--text-primary)]">{data.totalCalls}</p>
          </div>
          <div className="bg-[var(--surface-raised)] border border-[var(--border-subtle)] rounded-xl p-4">
            <p className="text-[13px] text-[var(--text-tertiary)] mb-1">Input tokens</p>
            <p className="text-xl font-semibold text-[var(--text-primary)]">{formatTokens(data.totalInputTokens)}</p>
          </div>
          <div className="bg-[var(--surface-raised)] border border-[var(--border-subtle)] rounded-xl p-4">
            <p className="text-[13px] text-[var(--text-tertiary)] mb-1">Output tokens</p>
            <p className="text-xl font-semibold text-[var(--text-primary)]">{formatTokens(data.totalOutputTokens)}</p>
          </div>
        </div>

        {/* Daily chart */}
        <div className="mb-8">
          <p className="text-[13px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium mb-3">Daily cost (14 days)</p>
          <div className="bg-[var(--surface-raised)] border border-[var(--border-subtle)] rounded-xl p-4">
            <div className="flex items-end gap-1 h-[120px]">
              {dailyData.map((day) => {
                const height = day.costCents > 0 ? Math.max((day.costCents / maxDailyCost) * 100, 4) : 0;
                const isToday = day.date === new Date().toISOString().slice(0, 10);
                return (
                  <div key={day.date} className="flex-1 flex flex-col items-center gap-1 group relative">
                    <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-zinc-800 text-white text-[11px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">
                      {day.date.slice(5)}: {formatCost(day.costCents)} ({day.calls} calls)
                    </div>
                    <div
                      className="w-full rounded-sm transition-all"
                      style={{
                        height: `${height}%`,
                        backgroundColor: isToday ? "var(--accent-blue)" : "var(--text-tertiary)",
                        opacity: isToday ? 1 : 0.4,
                        minHeight: day.costCents > 0 ? "4px" : "0px",
                      }}
                    />
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between mt-2">
              <span className="text-[11px] text-[var(--text-tertiary)]">{dailyData[0]?.date.slice(5)}</span>
              <span className="text-[11px] text-[var(--text-tertiary)]">Today</span>
            </div>
          </div>
        </div>

        {/* By endpoint */}
        <div className="mb-8">
          <p className="text-[13px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium mb-3">By endpoint</p>
          <div className="space-y-2">
            {endpointEntries.map(([endpoint, stats]) => (
              <div key={endpoint} className="bg-[var(--surface-raised)] border border-[var(--border-subtle)] rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[15px] font-medium text-[var(--text-primary)]">{ENDPOINT_LABELS[endpoint] || endpoint}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-[13px] text-[var(--text-tertiary)]">{stats.calls} calls</span>
                    <span className="text-[15px] font-semibold text-[var(--text-primary)]">{formatCost(stats.costCents)}</span>
                  </div>
                </div>
                <div className="h-1.5 bg-[var(--border-subtle)] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[var(--accent-blue)] transition-all"
                    style={{ width: `${(stats.costCents / maxEndpointCost) * 100}%` }}
                  />
                </div>
                <div className="flex gap-4 mt-2">
                  <span className="text-[12px] text-[var(--text-tertiary)]">In: {formatTokens(stats.inputTokens)}</span>
                  <span className="text-[12px] text-[var(--text-tertiary)]">Out: {formatTokens(stats.outputTokens)}</span>
                </div>
              </div>
            ))}
            {endpointEntries.length === 0 && (
              <p className="text-[var(--text-tertiary)] text-sm py-4 text-center">No API calls yet</p>
            )}
          </div>
        </div>

        {/* By role */}
        <div className="mb-8">
          <p className="text-[13px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium mb-3">By role</p>
          <div className="space-y-2">
            {roleEntries.map(([roleId, stats]) => (
              <div key={roleId} className="bg-[var(--surface-raised)] border border-[var(--border-subtle)] rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: roleColors[roleId] || "#706c65" }} />
                    <span className="text-[15px] font-medium text-[var(--text-primary)]">{roleNames[roleId] || roleId}</span>
                  </span>
                  <div className="flex items-center gap-3">
                    <span className="text-[13px] text-[var(--text-tertiary)]">{stats.calls} calls</span>
                    <span className="text-[15px] font-semibold text-[var(--text-primary)]">{formatCost(stats.costCents)}</span>
                  </div>
                </div>
                <div className="h-1.5 bg-[var(--border-subtle)] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${(stats.costCents / maxRoleCost) * 100}%`,
                      backgroundColor: roleColors[roleId] || "#706c65",
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent calls */}
        <div>
          <p className="text-[13px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium mb-3">Recent calls</p>
          <div className="bg-[var(--surface-raised)] border border-[var(--border-subtle)] rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-[14px]">
                <thead>
                  <tr className="border-b border-[var(--border-subtle)]">
                    <th className="text-left px-4 py-2.5 text-[var(--text-tertiary)] font-medium">Time</th>
                    <th className="text-left px-4 py-2.5 text-[var(--text-tertiary)] font-medium">Type</th>
                    <th className="text-left px-4 py-2.5 text-[var(--text-tertiary)] font-medium">Role</th>
                    <th className="text-right px-4 py-2.5 text-[var(--text-tertiary)] font-medium">Tokens</th>
                    <th className="text-right px-4 py-2.5 text-[var(--text-tertiary)] font-medium">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recent.map((r) => (
                    <tr key={r.id} className="border-b border-[var(--border-subtle)] last:border-0">
                      <td className="px-4 py-2.5 text-[var(--text-secondary)] whitespace-nowrap">
                        {new Date(r.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                      </td>
                      <td className="px-4 py-2.5 text-[var(--text-primary)]">{ENDPOINT_LABELS[r.endpoint] || r.endpoint}</td>
                      <td className="px-4 py-2.5">
                        {r.roleId ? (
                          <span className="flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: roleColors[r.roleId] || "#706c65" }} />
                            <span className="text-[var(--text-secondary)]">{roleNames[r.roleId] || r.roleId}</span>
                          </span>
                        ) : (
                          <span className="text-[var(--text-tertiary)]">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right text-[var(--text-tertiary)] whitespace-nowrap">
                        {formatTokens(r.inputTokens + r.outputTokens)}
                      </td>
                      <td className="px-4 py-2.5 text-right text-[var(--text-primary)] font-medium">
                        {formatCost(r.costCents)}
                      </td>
                    </tr>
                  ))}
                  {data.recent.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-[var(--text-tertiary)]">No API calls recorded yet</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
    </div>
  );
}

export function CostsPage() {
  return (
    <AppShell>
      <div className="py-6">
        <CostsContent />
      </div>
    </AppShell>
  );
}
