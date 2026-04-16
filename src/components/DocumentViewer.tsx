"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Download, Loader2 } from "lucide-react";
import { FileIcon, formatFileSize } from "@/lib/file-utils";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export interface ViewerFile {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  createdAt: string;
}

interface DocumentViewerProps {
  file: ViewerFile | null;
  onClose: () => void;
}

function isTextRenderable(mimeType: string, filename: string): boolean {
  if (mimeType.startsWith("text/")) return true;
  if (mimeType.includes("word") || mimeType.includes("document")) return true;
  if (mimeType === "application/json") return true;
  const ext = filename.split(".").pop()?.toLowerCase();
  return ext === "md" || ext === "csv" || ext === "txt" || ext === "json";
}

function isMarkdown(filename: string): boolean {
  return filename.toLowerCase().endsWith(".md");
}

function isWordDoc(mimeType: string, filename: string): boolean {
  if (mimeType.includes("word") || mimeType.includes("document")) return true;
  const ext = filename.split(".").pop()?.toLowerCase();
  return ext === "doc" || ext === "docx";
}

function isCodeOrData(filename: string): boolean {
  const ext = filename.split(".").pop()?.toLowerCase();
  return ext === "csv" || ext === "json" || ext === "log";
}

export function DocumentViewer({ file, onClose }: DocumentViewerProps) {
  const [extractedText, setExtractedText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch extractedText for text-renderable types
  useEffect(() => {
    if (!file) {
      setExtractedText(null);
      setError(null);
      return;
    }

    if (!isTextRenderable(file.mimeType, file.filename)) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/documents/${file.id}/preview`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load preview");
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        if (data.extractedText) {
          setExtractedText(data.extractedText);
        } else {
          setError("No text content available for this file");
        }
      })
      .catch(() => {
        if (!cancelled) setError("Failed to load preview");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [file]);

  // Escape key closes viewer
  useEffect(() => {
    if (!file) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [file, onClose]);

  const inlineUrl = file ? `/api/documents/download?fileId=${file.id}&inline=1` : "";
  const downloadUrl = file ? `/api/documents/download?fileId=${file.id}` : "";

  return (
    <AnimatePresence>
      {file && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[80] bg-black/70"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="fixed inset-4 md:inset-8 z-[80] flex flex-col rounded-2xl overflow-hidden bg-[var(--surface)] border border-[var(--border-subtle)] shadow-2xl"
          >
            {/* Header */}
            <div className="shrink-0 flex items-center gap-3 px-5 py-3.5 border-b border-[var(--border-subtle)]">
              <FileIcon mimeType={file.mimeType} />
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-medium text-[var(--text-primary)] truncate">{file.filename}</p>
                <p className="text-[11px] text-[var(--text-tertiary)]">{formatFileSize(file.size)}</p>
              </div>
              <a
                href={downloadUrl}
                className="p-2 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--accent-blue)] hover:bg-[var(--surface-raised)] transition-colors"
                title="Download"
              >
                <Download className="h-4 w-4" />
              </a>
              <button
                onClick={onClose}
                className="p-2 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-raised)] transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 min-h-0 overflow-hidden">
              {/* Image */}
              {file.mimeType.startsWith("image/") && (
                <div className="w-full h-full flex items-center justify-center p-4 bg-[var(--surface-raised)]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={inlineUrl}
                    alt={file.filename}
                    className="max-w-full max-h-full object-contain rounded"
                  />
                </div>
              )}

              {/* PDF */}
              {file.mimeType === "application/pdf" && (
                <iframe
                  src={inlineUrl}
                  className="w-full h-full border-0"
                  title={file.filename}
                />
              )}

              {/* Text-renderable */}
              {isTextRenderable(file.mimeType, file.filename) && (
                <div className="w-full h-full overflow-y-auto">
                  <div className="max-w-3xl mx-auto px-8 py-6">
                  {loading && (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="h-5 w-5 animate-spin text-[var(--text-tertiary)]" />
                    </div>
                  )}
                  {error && (
                    <div className="text-center py-12">
                      <p className="text-[14px] text-[var(--text-tertiary)]">{error}</p>
                      <a
                        href={downloadUrl}
                        className="inline-flex items-center gap-2 mt-4 px-4 py-2 text-[13px] font-medium text-[var(--accent-blue)] bg-[var(--accent-blue)]/10 rounded-lg hover:bg-[var(--accent-blue)]/20 transition-colors"
                      >
                        <Download className="h-3.5 w-3.5" /> Download file
                      </a>
                    </div>
                  )}
                  {!loading && !error && extractedText && (
                    isMarkdown(file.filename) ? (
                      <div className="prose-sm max-w-none text-[var(--text-secondary)] leading-relaxed [&_h1]:font-semibold [&_h1]:text-[var(--text-primary)] [&_h1]:text-[20px] [&_h1]:mt-6 [&_h1]:mb-2 [&_h2]:font-semibold [&_h2]:text-[var(--text-primary)] [&_h2]:text-[17px] [&_h2]:mt-5 [&_h2]:mb-2 [&_h3]:font-semibold [&_h3]:text-[var(--text-primary)] [&_h3]:text-[15px] [&_h3]:mt-4 [&_h3]:mb-1.5 [&_ul]:ml-4 [&_ul]:list-disc [&_ol]:ml-4 [&_ol]:list-decimal [&_p]:mb-3 [&_strong]:text-[var(--text-primary)] [&_code]:bg-[var(--surface-raised)] [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-[13px] [&_hr]:border-[var(--border-subtle)] [&_hr]:my-4">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{extractedText}</ReactMarkdown>
                      </div>
                    ) : isCodeOrData(file.filename) ? (
                      <pre className="text-[13px] text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap break-words font-mono bg-[var(--surface-raised)] rounded-xl p-4">
                        {extractedText}
                      </pre>
                    ) : (
                      <div className="text-[15px] text-[var(--text-secondary)] leading-[1.7]">
                        {extractedText.split(/\n\n+/).map((block, i) => {
                          const trimmed = block.trim();
                          if (!trimmed) return null;
                          // Detect headings: short lines (under 80 chars) that are standalone
                          const lines = trimmed.split("\n");
                          if (lines.length === 1 && trimmed.length < 80 && !trimmed.endsWith(".") && !trimmed.endsWith(",")) {
                            return (
                              <h3 key={i} className="text-[17px] font-semibold text-[var(--text-primary)] mt-6 mb-2 first:mt-0">
                                {trimmed}
                              </h3>
                            );
                          }
                          return (
                            <p key={i} className="mb-3">
                              {lines.map((line, j) => (
                                <span key={j}>
                                  {j > 0 && <br />}
                                  {line}
                                </span>
                              ))}
                            </p>
                          );
                        })}
                      </div>
                    )
                  )}
                  </div>
                </div>
              )}

              {/* Fallback — unsupported type */}
              {!file.mimeType.startsWith("image/") &&
               file.mimeType !== "application/pdf" &&
               !isTextRenderable(file.mimeType, file.filename) && (
                <div className="w-full h-full flex items-center justify-center">
                  <div className="text-center">
                    <div className="mx-auto mb-4 w-16 h-16 rounded-2xl bg-[var(--surface-raised)] flex items-center justify-center">
                      <FileIcon mimeType={file.mimeType} />
                    </div>
                    <p className="text-[16px] font-medium text-[var(--text-primary)] mb-1">{file.filename}</p>
                    <p className="text-[13px] text-[var(--text-tertiary)] mb-4">{formatFileSize(file.size)}</p>
                    <a
                      href={downloadUrl}
                      className="inline-flex items-center gap-2 px-5 py-2.5 text-[13px] font-medium text-white bg-[var(--accent-blue)] rounded-lg hover:bg-[var(--accent-blue)]/80 transition-colors"
                    >
                      <Download className="h-4 w-4" /> Download
                    </a>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
