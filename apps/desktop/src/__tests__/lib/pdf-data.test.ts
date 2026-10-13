import { describe, expect, it } from "vitest";
import { getPdfArrayBuffer } from "@/lib/mupdf/pdf-data";

describe("PDF component data", () => {
  it("keeps large PDFs opaque to prop enumeration without copying", () => {
    const bytes = new Uint8Array(6 * 1024 * 1024);
    const buffer = getPdfArrayBuffer(bytes);
    expect(buffer).toBe(bytes.buffer);
    expect(Object.keys(buffer)).toEqual([]);
    expect(getPdfArrayBuffer(bytes)).toBe(buffer);
  });

  it("preserves only the PDF's byte range and gives it a stable identity", () => {
    const bytes = new Uint8Array([0, 37, 80, 68, 70, 45, 0]);
    const pdf = bytes.subarray(1, 6);
    const buffer = getPdfArrayBuffer(pdf);
    expect(Array.from(new Uint8Array(buffer))).toEqual([37, 80, 68, 70, 45]);
    expect(getPdfArrayBuffer(pdf)).toBe(buffer);
    expect(getPdfArrayBuffer(bytes.subarray(2, 6))).not.toBe(buffer);
  });

  it("changes identity when a compilation replaces the PDF", () => {
    const first = new Uint8Array([37, 80, 68, 70, 45, 1]);
    const next = new Uint8Array([37, 80, 68, 70, 45, 2]);
    expect(getPdfArrayBuffer(next)).not.toBe(getPdfArrayBuffer(first));
    expect(new Uint8Array(getPdfArrayBuffer(next))[5]).toBe(2);
  });
});
