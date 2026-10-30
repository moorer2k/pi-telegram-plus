import { describe, expect, it } from "vitest";
import { appendProgressMessage } from "../renderer.ts";

describe("Venom progress history", () => {
  it("preserves intermediate information rather than replacing it", () => {
    let messages: string[] = [];
    messages = appendProgressMessage(messages, "Located a GitHub repository");
    messages = appendProgressMessage(messages, "Checking the renderer");
    messages = appendProgressMessage(messages, "Completed");
    expect(messages.join("\n\n")).toContain("Located a GitHub repository");
    expect(messages.join("\n\n")).toContain("Completed");
    expect(messages).toHaveLength(3);
  });

  it("skips empty and repeated consecutive replies", () => {
    let messages = appendProgressMessage([], "First message");
    messages = appendProgressMessage(messages, " First message ");
    messages = appendProgressMessage(messages, "  ");
    expect(messages).toEqual(["First message"]);
  });
});
