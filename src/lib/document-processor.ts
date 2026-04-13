import { prisma } from "./prisma";
import { createCompletion } from "./ai-provider";
import { trackUsage } from "./ai-usage";

/**
 * Generate an AI summary of uploaded document text.
 * Runs in the background (fire-and-forget) to avoid blocking the upload response.
 */
export async function summarizeAndSaveToNote(
  noteId: string,
  text: string,
  filename: string,
  roleId: string
): Promise<void> {
  try {
    const response = await createCompletion({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: "You summarize documents concisely. Focus on: key decisions, action items, people mentioned, and important facts. Keep under 500 words.",
      messages: [
        {
          role: "user",
          content: `Summarize this document (${filename}):\n\n${text.slice(0, 30000)}`,
        },
      ],
    });

    if (response.text) {
      await prisma.note.update({
        where: { id: noteId },
        data: { summary: response.text },
      });
    }

    trackUsage("summarize", response.model, response.usage, roleId);
  } catch {
    // Non-critical — note still has raw text
  }
}
