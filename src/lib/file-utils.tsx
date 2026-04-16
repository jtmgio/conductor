import { FileText, Image, File } from "lucide-react";

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileIcon({ mimeType }: { mimeType: string }) {
  if (mimeType.startsWith("image/")) return <Image className="h-4 w-4 text-purple-400" />;
  if (mimeType.includes("pdf")) return <FileText className="h-4 w-4 text-red-400" />;
  if (mimeType.includes("word") || mimeType.includes("document")) return <FileText className="h-4 w-4 text-blue-400" />;
  return <File className="h-4 w-4 text-[var(--text-tertiary)]" />;
}
