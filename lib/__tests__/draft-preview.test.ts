import { describe, expect, it } from "vitest";
import { prepareDraftPreview } from "../draft-preview.ts";

describe("prepareDraftPreview", () => {
  it("preserves a short response", () => {
    expect(prepareDraftPreview("  hello world  ")).toBe("hello world");
  });
  it("retains the latest output when the preview is too long", () => {
    expect(prepareDraftPreview("abcDEF", 3)).toBe("DEF");
  });
  it("never splits UTF-8 code points or exceeds the byte limit", () => {
    const preview = prepareDraftPreview("🙂".repeat(1500), 4096);
    expect(Buffer.byteLength(preview, "utf8")).toBeLessThanOrEqual(4096);
    expect(preview).toBe("🙂".repeat(1024));
  });
  it("handles empty and invalid limits", () => {
    expect(prepareDraftPreview("  ")).toBe("");
    expect(prepareDraftPreview("text", 0)).toBe("");
  });
});
