import { describe, expect, it } from "vitest";
import { contentToRenderParts } from "../renderer.ts";
import { RENDER_LEVELS } from "../types.ts";

describe("Venom live progress rendering", () => {
  it("offers progress as a rendering level", () => {
    expect(RENDER_LEVELS).toContain("progress");
  });

  it("suppresses per-tool inline messages while preserving assistant text", () => {
    const content = [
      { type: "text", text: "Checking the renderer." },
      { type: "toolCall", name: "read", arguments: { path: "lib/renderer.ts" } },
      { type: "text", text: "Verifying results." },
    ];
    expect(contentToRenderParts(content, "hidden", "progress")).toEqual({
      body: "Checking the renderer.\n\nVerifying results.",
      inlineEvents: [],
    });
  });

  it("does not alter existing detailed tool mode", () => {
    const content = [{ type: "toolCall", name: "read", arguments: { path: "lib/renderer.ts" } }];
    expect(contentToRenderParts(content, "hidden", "brief").inlineEvents[0]).toContain("lib/renderer.ts");
  });
});
