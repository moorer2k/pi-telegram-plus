/** Telegram draft previews must be nonempty UTF-8 and at most 4096 bytes. */
export function prepareDraftPreview(text: string, maxBytes = 4096): string {
  const clean = text.trim();
  if (!clean || !Number.isSafeInteger(maxBytes) || maxBytes < 1) return "";
  if (Buffer.byteLength(clean, "utf8") <= maxBytes) return clean;
  const suffix: string[] = [];
  let used = 0;
  for (const char of Array.from(clean).reverse()) {
    const bytes = Buffer.byteLength(char, "utf8");
    if (used + bytes > maxBytes) break;
    suffix.push(char);
    used += bytes;
  }
  return suffix.reverse().join("");
}
