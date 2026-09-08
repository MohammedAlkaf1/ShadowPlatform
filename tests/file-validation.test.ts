import "./setup";
import { describe, it, expect } from "vitest";
import { verifyFileContent } from "@/lib/file-validation";

describe("verifyFileContent — magic-byte content verification", () => {
  it("accepts a real PDF signature declared as application/pdf", async () => {
    const realPdf = Buffer.from("%PDF-1.4\n%test content\n%%EOF");
    expect(await verifyFileContent(realPdf, "application/pdf")).toBe(true);
  });

  it("rejects plain text content declared as application/pdf (fake MIME)", async () => {
    const fakePdf = Buffer.from("this is just a plain text file pretending to be a PDF");
    expect(await verifyFileContent(fakePdf, "application/pdf")).toBe(false);
  });

  it("rejects a real PNG renamed/declared as application/pdf (extension/MIME mismatch)", async () => {
    // A real, complete 1x1 transparent PNG (signature + IHDR + IDAT + IEND) —
    // file-type needs the full chunk structure, not just the 8-byte magic
    // number, to positively confirm a PNG.
    const realPng = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64"
    );
    expect(await verifyFileContent(realPng, "application/pdf")).toBe(false);
    expect(await verifyFileContent(realPng, "image/png")).toBe(true);
  });

  it("rejects an executable (ELF/PE-style byte prefix) declared as any allowed type", async () => {
    // "MZ" DOS/PE executable header.
    const fakeExe = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);
    expect(await verifyFileContent(fakeExe, "application/pdf")).toBe(false);
    expect(await verifyFileContent(fakeExe, "image/png")).toBe(false);
    expect(await verifyFileContent(fakeExe, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")).toBe(false);
  });

  it("rejects a declared MIME type this helper doesn't recognize (fail closed)", async () => {
    const anything = Buffer.from("irrelevant content");
    expect(await verifyFileContent(anything, "application/x-totally-unknown")).toBe(false);
  });

  it("tolerates an empty/undetectable buffer for the CFB-only legacy .doc type", async () => {
    // file-type can't fingerprint a near-empty buffer at all — this
    // declared type is deliberately lenient on "no signature found" (see
    // file-validation.ts's own comment) rather than rejecting every
    // legitimate small/legacy .doc file.
    const tiny = Buffer.from([0, 1, 2, 3]);
    expect(await verifyFileContent(tiny, "application/msword")).toBe(true);
  });

  it("rejects a real PDF declared as legacy .doc (positively-detected mismatch)", async () => {
    const realPdf = Buffer.from("%PDF-1.4\n%test content\n%%EOF");
    expect(await verifyFileContent(realPdf, "application/msword")).toBe(false);
  });
});
