import fs from "fs/promises";
import path from "path";

const UPLOAD_DIR = process.env.UPLOAD_DIR || (
  process.env.NODE_ENV === "production"
    ? "/opt/conductor/uploads"
    : "./uploads"
);

export function getUploadDir(): string {
  return UPLOAD_DIR;
}

export async function processFile(
  filePath: string,
  mimeType: string
): Promise<{ text: string | null; base64: string | null }> {
  if (mimeType.startsWith("image/")) {
    const buffer = await fs.readFile(filePath);
    return { text: null, base64: buffer.toString("base64") };
  }

  if (mimeType === "application/pdf") {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require("pdf-parse");
    const buffer = await fs.readFile(filePath);
    const data = await pdfParse(buffer);
    return { text: data.text, base64: null };
  }

  if (
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    mimeType === "application/msword"
  ) {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ path: filePath });
    return { text: result.value, base64: null };
  }

  if (
    mimeType.startsWith("text/") ||
    mimeType === "application/json" ||
    mimeType === "text/csv"
  ) {
    const text = await fs.readFile(filePath, "utf-8");
    return { text, base64: null };
  }

  return { text: null, base64: null };
}

export function getStoragePath(filename: string): string {
  const timestamp = Date.now();
  const ext = path.extname(filename);
  const base = path.basename(filename, ext);
  const safeName = base.replace(/[^a-zA-Z0-9-_]/g, "_");
  return path.join(UPLOAD_DIR, `${safeName}-${timestamp}${ext}`);
}

export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
