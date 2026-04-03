"use client";

import { useState, useMemo } from "react";
import { AppShell } from "@/components/AppShell";
import { categories, articles, type Article, type Category } from "@/lib/docs-content";
import { Search, BookOpen, Rocket, Clock, Sparkles, Link2, Layout, ChevronRight, Home } from "lucide-react";
import { cn } from "@/lib/utils";

const CATEGORY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Rocket, Clock, Sparkles, Link2, Layout, BookOpen,
};

function renderContent(content: string) {
  return content.split("\n\n").map((block, i) => {
    // Section headers (bold-only lines)
    if (block.startsWith("**") && block.endsWith("**") && !block.includes("\n")) {
      return (
        <h3 key={i} className="text-[18px] font-semibold text-[var(--text-primary)] mt-8 mb-3 tracking-tight">
          {block.replace(/\*\*/g, "")}
        </h3>
      );
    }

    // Bullet lists
    if (block.includes("\n- ") || block.startsWith("- ")) {
      const lines = block.split("\n");
      const title = !lines[0].startsWith("- ") ? lines.shift() : null;
      return (
        <div key={i} className="mb-5">
          {title && <p className="text-[16px] text-[var(--text-primary)] mb-2.5 leading-relaxed">{renderInline(title)}</p>}
          <ul className="space-y-2 ml-0.5">
            {lines.filter(l => l.startsWith("- ")).map((line, j) => (
              <li key={j} className="flex items-start gap-3 text-[16px] text-[var(--text-secondary)] leading-[1.7]">
                <span className="text-[var(--accent-blue)] mt-2.5 shrink-0 w-1.5 h-1.5 rounded-full bg-[var(--accent-blue)] opacity-50" />
                <span>{renderInline(line.replace(/^- /, ""))}</span>
              </li>
            ))}
          </ul>
        </div>
      );
    }

    // Numbered lists
    if (/^\d+\./.test(block)) {
      const lines = block.split("\n").filter(l => /^\d+\./.test(l));
      return (
        <ol key={i} className="space-y-2.5 mb-5">
          {lines.map((line, j) => (
            <li key={j} className="flex items-start gap-3 text-[16px] text-[var(--text-secondary)] leading-[1.7]">
              <span className="text-[var(--accent-blue)] font-bold shrink-0 w-6 text-right mt-px">{j + 1}.</span>
              <span>{renderInline(line.replace(/^\d+\.\s*/, ""))}</span>
            </li>
          ))}
        </ol>
      );
    }

    // Regular paragraph
    return (
      <p key={i} className="text-[16px] text-[var(--text-secondary)] leading-[1.8] mb-5">
        {renderInline(block)}
      </p>
    );
  });
}

function renderInline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i} className="text-[var(--text-primary)] font-semibold">{part.slice(2, -2)}</strong>;
    }
    const codeParts = part.split(/(`[^`]+`)/g);
    return codeParts.map((cp, j) => {
      if (cp.startsWith("`") && cp.endsWith("`")) {
        return (
          <code key={`${i}-${j}`} className="text-[14px] font-mono bg-[var(--surface-raised)] border border-[var(--border-subtle)] rounded-md px-1.5 py-0.5 text-[var(--accent-blue)]">
            {cp.slice(1, -1)}
          </code>
        );
      }
      return <span key={`${i}-${j}`}>{cp}</span>;
    });
  });
}

export function DocsPage() {
  const [search, setSearch] = useState("");
  const [activeArticle, setActiveArticle] = useState<Article | null>(null);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

  const filteredArticles = useMemo(() => {
    if (!search.trim()) return articles;
    const q = search.toLowerCase();
    return articles.filter(
      (a) => a.title.toLowerCase().includes(q) || a.summary.toLowerCase().includes(q) || a.content.toLowerCase().includes(q)
    );
  }, [search]);

  const articlesByCategory = useMemo(() => {
    const map: Record<string, Article[]> = {};
    for (const cat of categories) map[cat.id] = [];
    for (const article of filteredArticles) {
      if (map[article.category]) map[article.category].push(article);
    }
    return map;
  }, [filteredArticles]);

  const activeCat = activeArticle ? categories.find(c => c.id === activeArticle.category) : null;

  return (
    <AppShell>
      <div className="py-6 flex gap-0 min-h-[calc(100vh-120px)]">

        {/* Sidebar */}
        <div className="w-[240px] shrink-0 pr-6 border-r border-[var(--border-subtle)] overflow-y-auto hide-scrollbar">
          {/* Search */}
          <div className="relative mb-5">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]" />
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); if (e.target.value) setActiveArticle(null); }}
              placeholder="Search docs..."
              className="w-full h-9 pl-9 pr-3 rounded-lg bg-[var(--surface-raised)] border border-[var(--border-subtle)] text-[14px] text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--accent-blue)]/20 placeholder:text-[var(--text-tertiary)]"
            />
          </div>

          {/* Home link */}
          <button
            onClick={() => { setActiveArticle(null); setSearch(""); }}
            className={cn(
              "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[14px] font-medium transition-colors mb-3",
              !activeArticle && !search
                ? "bg-[var(--sidebar-active)] text-[var(--text-primary)]"
                : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--sidebar-hover)]"
            )}
          >
            <Home className="h-4 w-4" />
            All Topics
          </button>

          {/* Category nav */}
          <div className="space-y-0.5">
            {categories.map((cat) => {
              const Icon = CATEGORY_ICONS[cat.icon] || BookOpen;
              const catArticles = articlesByCategory[cat.id] || [];
              const isExpanded = expandedCategory === cat.id || activeArticle?.category === cat.id;
              const hasResults = catArticles.length > 0;

              if (search && !hasResults) return null;

              return (
                <div key={cat.id}>
                  <button
                    onClick={() => setExpandedCategory(isExpanded ? null : cat.id)}
                    className={cn(
                      "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[14px] font-medium transition-colors",
                      isExpanded
                        ? "text-[var(--text-primary)] bg-[var(--surface-raised)]"
                        : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--sidebar-hover)]"
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="flex-1 text-left">{cat.label}</span>
                    <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", isExpanded && "rotate-90")} />
                  </button>
                  {isExpanded && (
                    <div className="ml-4 pl-3 border-l border-[var(--border-subtle)] mt-0.5 mb-1 space-y-0.5">
                      {catArticles.map((article) => (
                        <button
                          key={article.slug}
                          onClick={() => { setActiveArticle(article); setSearch(""); }}
                          className={cn(
                            "w-full text-left px-2.5 py-1.5 rounded-md text-[13px] transition-colors leading-snug",
                            activeArticle?.slug === article.slug
                              ? "text-[var(--accent-blue)] font-medium bg-[var(--accent-blue)]/5"
                              : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
                          )}
                        >
                          {article.title}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1 pl-8 min-w-0 overflow-y-auto">

          {/* Search results */}
          {search.trim() && (
            <div>
              <p className="text-[13px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium mb-4">
                {filteredArticles.length} result{filteredArticles.length !== 1 ? "s" : ""} for &ldquo;{search}&rdquo;
              </p>
              <div className="space-y-2">
                {filteredArticles.map((article) => (
                  <button
                    key={article.slug}
                    onClick={() => { setActiveArticle(article); setSearch(""); }}
                    className="w-full flex items-center gap-4 p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] hover:bg-[var(--sidebar-hover)] transition-colors text-left group"
                  >
                    <div className="flex-1 min-w-0">
                      <span className="text-[11px] uppercase tracking-wider text-[var(--accent-blue)] font-semibold">
                        {categories.find(c => c.id === article.category)?.label}
                      </span>
                      <p className="text-[16px] font-medium text-[var(--text-primary)] mt-0.5">{article.title}</p>
                      <p className="text-[14px] text-[var(--text-tertiary)] mt-1 line-clamp-1">{article.summary}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-[var(--text-tertiary)] shrink-0 group-hover:text-[var(--accent-blue)]" />
                  </button>
                ))}
                {filteredArticles.length === 0 && (
                  <p className="text-[15px] text-[var(--text-tertiary)] py-8 text-center">No articles match your search.</p>
                )}
              </div>
            </div>
          )}

          {/* Article view */}
          {activeArticle && !search.trim() && (
            <div>
              {/* Breadcrumb */}
              <div className="flex items-center gap-2 text-[13px] text-[var(--text-tertiary)] mb-6">
                <button onClick={() => setActiveArticle(null)} className="hover:text-[var(--text-secondary)] transition-colors">Docs</button>
                <ChevronRight className="h-3 w-3" />
                <button onClick={() => setActiveArticle(null)} className="hover:text-[var(--text-secondary)] transition-colors">{activeCat?.label}</button>
                <ChevronRight className="h-3 w-3" />
                <span className="text-[var(--text-secondary)]">{activeArticle.title}</span>
              </div>

              {/* Article header */}
              <h1 className="text-[32px] font-bold text-[var(--text-primary)] tracking-tight leading-tight mb-3">
                {activeArticle.title}
              </h1>
              <p className="text-[17px] text-[var(--text-tertiary)] leading-relaxed mb-8 max-w-[640px]">
                {activeArticle.summary}
              </p>

              {/* Article body */}
              <div className="border-t border-[var(--border-subtle)] pt-8 max-w-[680px]">
                {renderContent(activeArticle.content)}
              </div>

              {/* Prev / Next */}
              <div className="border-t border-[var(--border-subtle)] mt-10 pt-6 flex justify-between max-w-[680px]">
                {(() => {
                  const idx = articles.findIndex(a => a.slug === activeArticle.slug);
                  const prev = idx > 0 ? articles[idx - 1] : null;
                  const next = idx < articles.length - 1 ? articles[idx + 1] : null;
                  return (
                    <>
                      {prev ? (
                        <button onClick={() => setActiveArticle(prev)} className="text-left group">
                          <span className="text-[12px] text-[var(--text-tertiary)]">Previous</span>
                          <p className="text-[15px] text-[var(--accent-blue)] font-medium group-hover:underline">{prev.title}</p>
                        </button>
                      ) : <div />}
                      {next ? (
                        <button onClick={() => setActiveArticle(next)} className="text-right group">
                          <span className="text-[12px] text-[var(--text-tertiary)]">Next</span>
                          <p className="text-[15px] text-[var(--accent-blue)] font-medium group-hover:underline">{next.title}</p>
                        </button>
                      ) : <div />}
                    </>
                  );
                })()}
              </div>
            </div>
          )}

          {/* Home: category cards */}
          {!activeArticle && !search.trim() && (
            <div>
              <div className="mb-10">
                <h1 className="text-[32px] font-bold text-[var(--text-primary)] tracking-tight mb-2">Knowledge Base</h1>
                <p className="text-[17px] text-[var(--text-tertiary)] leading-relaxed">Everything you need to know about using Conductor.</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {categories.map((cat) => {
                  const Icon = CATEGORY_ICONS[cat.icon] || BookOpen;
                  const count = articlesByCategory[cat.id]?.length || 0;
                  return (
                    <button
                      key={cat.id}
                      onClick={() => {
                        setExpandedCategory(cat.id);
                        const first = articlesByCategory[cat.id]?.[0];
                        if (first) setActiveArticle(first);
                      }}
                      className="flex flex-col items-start p-6 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] hover:bg-[var(--sidebar-hover)] hover:border-[var(--border-default)] transition-all text-left group"
                    >
                      <div className="w-11 h-11 rounded-xl bg-[var(--accent-blue)]/10 flex items-center justify-center mb-4">
                        <Icon className="h-5 w-5 text-[var(--accent-blue)]" />
                      </div>
                      <p className="text-[17px] font-semibold text-[var(--text-primary)] group-hover:text-[var(--accent-blue)] transition-colors tracking-tight">
                        {cat.label}
                      </p>
                      <p className="text-[14px] text-[var(--text-tertiary)] mt-1.5 leading-relaxed">
                        {cat.description}
                      </p>
                      <span className="text-[13px] text-[var(--text-tertiary)] mt-3 font-medium">
                        {count} article{count !== 1 ? "s" : ""} <ChevronRight className="inline h-3 w-3 ml-0.5" />
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Quick links */}
              <div className="mt-10 pt-8 border-t border-[var(--border-subtle)]">
                <p className="text-[13px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium mb-4">Popular articles</p>
                <div className="grid grid-cols-2 gap-2">
                  {["slash-commands", "focus-mode", "granola-integration", "keyboard-shortcuts", "neurodivergent-design", "schedule"].map((slug) => {
                    const article = articles.find(a => a.slug === slug);
                    if (!article) return null;
                    return (
                      <button
                        key={slug}
                        onClick={() => { setActiveArticle(article); setExpandedCategory(article.category); }}
                        className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-[var(--sidebar-hover)] transition-colors text-left group"
                      >
                        <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent-blue)] shrink-0" />
                        <span className="text-[15px] text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition-colors">{article.title}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
