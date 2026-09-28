import type { UpdateInfo } from "electron-updater"

const ENTITIES: Readonly<Record<string, string>> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
}

function decodeEntity(entity: string, name: string): string {
  if (name.startsWith("#x") || name.startsWith("#X"))
    return String.fromCodePoint(Number.parseInt(name.slice(2), 16))
  if (name.startsWith("#"))
    return String.fromCodePoint(Number.parseInt(name.slice(1), 10))
  return ENTITIES[name.toLowerCase()] ?? entity
}

/**
 * A release's notes as plain text for a native dialog. GitHub gives them as the release
 * page's HTML: list items become bullets, runs of blank lines one, and notes longer than
 * maxLines end with an ellipsis (the release page has the rest).
 */
export function releaseNotesText(
  notes: UpdateInfo["releaseNotes"],
  maxLines = 12
): string {
  const html =
    typeof notes === "string"
      ? notes
      : (notes ?? []).map((release) => release.note ?? "").join("\n")
  const lines = html
    // Line breaks between tags lay out the HTML; they are not text.
    .replace(/>\s*\n\s*</g, "> <")
    .replace(/<(?:ul|ol)\b[^>]*>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "• ")
    .replace(/<br\s*\/?>|<\/(?:li|tr)>/gi, "\n")
    .replace(/<\/(?:p|div|h[1-6]|ul|ol|pre|blockquote|table)>/gi, "\n\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, decodeEntity)
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line, index, all) => line !== "" || all[index - 1] !== "")
  while (lines.at(0) === "") lines.shift()
  while (lines.at(-1) === "") lines.pop()
  return lines.length > maxLines
    ? [...lines.slice(0, maxLines), "…"].join("\n")
    : lines.join("\n")
}
