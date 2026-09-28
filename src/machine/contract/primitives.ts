import { z } from "zod"

/** Machine coordinates and heights are bounded to ±10 m. */
export const COORDINATE_LIMIT = 10000

/** True when the text contains an ASCII control character. */
export const hasControlCharacter = (text: string) =>
  [...text].some((character) => {
    const code = character.charCodeAt(0)
    return code < 32 || code === 127
  })

/**
 * The UTF-8 bytes TextEncoder would write for the text (a lone surrogate becomes U+FFFD),
 * counted without encoding it. Byte limits on stored and exchanged text all use this measure.
 */
export function utf8ByteLength(text: string): number {
  let bytes = text.length
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index)
    if (code < 0x80) continue
    if (code < 0x800) {
      bytes += 1
      continue
    }
    // Three bytes; a surrogate pair is four bytes for its two code units.
    bytes += 2
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = text.charCodeAt(index + 1)
      if (next >= 0xdc00 && next <= 0xdfff) index++
    }
  }
  return bytes
}

/** Private, loopback or link-local IPv4 in dotted-decimal form without leading zeros. */
export function isLocalIPv4(value: string): boolean {
  const parts = value.split(".")
  if (
    parts.length !== 4 ||
    parts.some(
      (part) => !/^(?:0|[1-9]\d{0,2})$/.test(part) || Number(part) > 255
    )
  )
    return false
  const [a, b] = parts.map(Number) as [number, number]
  return (
    a === 10 ||
    a === 127 ||
    (a === 192 && b === 168) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 169 && b === 254)
  )
}

export const LocalIPv4Schema = z
  .string()
  .refine(isLocalIPv4, "Use a private, link-local, or loopback IPv4 address.")

export const PortSchema = z
  .number()
  .int()
  .min(1, "Enter a port from 1 to 65535.")
  .max(65535, "Enter a port from 1 to 65535.")

export const DisplayNameSchema = z
  .string()
  .trim()
  .min(1, "Enter a name.")
  .max(128, "Use at most 128 characters.")
  .refine((name) => !hasControlCharacter(name), "Remove control characters.")

/** Fits any label to DisplayNameSchema: control characters become spaces, then truncate. */
export function toDisplayName(label: string, fallback: string): string {
  let result = ""
  for (const character of label) {
    const code = character.charCodeAt(0)
    const next = code < 32 || code === 127 ? " " : character
    if (result.length + next.length > 128) break
    result += next
  }
  return result.trim() || fallback
}
