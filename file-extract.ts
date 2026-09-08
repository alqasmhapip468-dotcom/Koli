import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";

export async function extractTextFromFile(input: { fileName: string; mimeType?: string; base64: string }) {
  const buffer = Buffer.from(input.base64, "base64");
  const extension = input.fileName.toLowerCase().split(".").pop();
  const mimeType = input.mimeType || "";

  if (mimeType === "application/pdf" || extension === "pdf") {
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      return result.text.trim();
    } finally {
      await parser.destroy();
    }
  }

  if (mimeType.includes("word") || extension === "docx") {
    const result = await mammoth.extractRawText({ buffer });
    return result.value.trim();
  }

  if (mimeType.startsWith("text/") || extension === "txt" || extension === "md" || extension === "csv") {
    return buffer.toString("utf8").trim();
  }

  throw new Error("نوع الملف غير مدعوم للاستخراج النصي");
}
