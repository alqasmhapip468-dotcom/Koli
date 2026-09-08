import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { extractTextFromFile } from "./file-extract";

describe("file text extraction", () => {
  it("extracts text from DOCX files", async () => {
    const path = "node_modules/.pnpm/mammoth@1.12.2/node_modules/mammoth/test/test-data/single-paragraph.docx";
    const buffer = await readFile(path);
    const text = await extractTextFromFile({ fileName: "sample.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", base64: buffer.toString("base64") });
    expect(text.length).toBeGreaterThan(0);
  });
});
