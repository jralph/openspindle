import { Inflate } from "fflate"

/**
 * Reads a zip archive's central directory and, entry by entry, its stored or deflated data,
 * without ever decompressing more than a caller-chosen number of bytes. `unzipSync` (from
 * fflate, used elsewhere for writing archives) decompresses fully before a caller can look at
 * the result: an entry whose local data inflates to far more than its central directory states
 * still costs the CPU time of decoding all of it, even into a small output buffer, because
 * fflate's synchronous inflate walks the whole compressed stream regardless of the buffer's
 * size. Reading through `readZipFile` instead feeds fflate's streaming `Inflate` a few kilobytes
 * of compressed input at a time and stops as soon as the decompressed output passes the caller's
 * limit, so a lying entry costs at most a few chunks of wasted work rather than the whole
 * archive.
 */

/** A zip entry as its central directory record describes it. */
export type ZipEntry = {
  readonly name: string
  /** 0 (stored) or 8 (deflate); `ZipFile.read` refuses any other method. */
  readonly method: number
  readonly compressedSize: number
  readonly uncompressedSize: number
  readonly crc32: number
  /** Where this entry's local header begins; only `ZipFile.read` needs this. */
  readonly localHeaderOffset: number
}

/** Thrown by `ZipFile.read` when an entry's real bytes exceed the `maxBytes` it was given. */
export class ZipEntryTooLargeError extends Error {}
/** Thrown by `readZipFile` when the central directory lists more entries than it allows. */
export class ZipTooManyEntriesError extends Error {}

export type ZipFile = {
  readonly entries: readonly ZipEntry[]
  /**
   * Reads and verifies one entry's uncompressed bytes: refused with `ZipEntryTooLargeError`
   * before decompressing anything if `entry.uncompressedSize` exceeds `maxBytes`, and again if
   * decompressing actually produces more than `maxBytes`, so an entry whose real content is
   * larger than it claims cannot force full decompression. The result's length and CRC-32 are
   * checked against the central directory before it is returned.
   */
  read: (entry: ZipEntry, maxBytes: number) => Uint8Array
}

const STORED = 0
const DEFLATE = 8

const EOCD_SIGNATURE = 0x06054b50
const EOCD_SIZE = 22
/** The largest comment an End Of Central Directory record may carry (its length is 16 bits). */
const MAX_EOCD_COMMENT = 0xffff
const ZIP64_LOCATOR_SIGNATURE = 0x07064b50
const ZIP64_LOCATOR_SIZE = 20
const ZIP64_EOCD_SIGNATURE = 0x06064b50
const CENTRAL_HEADER_SIGNATURE = 0x02014b50
const LOCAL_HEADER_SIGNATURE = 0x04034b50
/** The ZIP64 extended information extra field's id (APPNOTE.TXT 4.5.3). */
const ZIP64_EXTRA_ID = 1
const U32_MAX = 0xffffffff

function corrupt(reason: string): never {
  throw new Error(`the archive is corrupt: ${reason}.`)
}

function u16(bytes: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 2 > bytes.length)
    corrupt("a header runs past the end of the file")
  return bytes[offset] | (bytes[offset + 1] << 8)
}
function u32(bytes: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 4 > bytes.length)
    corrupt("a header runs past the end of the file")
  return (
    (bytes[offset] |
      (bytes[offset + 1] << 8) |
      (bytes[offset + 2] << 16) |
      (bytes[offset + 3] << 24)) >>>
    0
  )
}
/** A 64-bit little-endian unsigned integer, refused only if it cannot be a safe integer. */
function u64Count(bytes: Uint8Array, offset: number): number {
  const low = u32(bytes, offset)
  const high = u32(bytes, offset + 4)
  const value = high * 4294967296 + low
  if (!Number.isSafeInteger(value))
    corrupt("an entry count is too large to use")
  return value
}
/**
 * A 64-bit little-endian unsigned integer that is a size or an offset into the file, refused
 * unless it actually fits within the file's bytes: a ZIP64 field is not otherwise bounded, and a
 * crafted one can claim a value up to 2^64 - 1.
 */
function u64(bytes: Uint8Array, offset: number): number {
  const value = u64Count(bytes, offset)
  if (value > bytes.length) corrupt("a size or offset is larger than the file")
  return value
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

/**
 * The zip format's CRC-32 (ISO 3309, the polynomial gzip and PNG also use) of `bytes`. fflate
 * computes this itself when it writes a zip but does not export the function, so entries read
 * back through this module are checked against a copy of it.
 */
export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

/**
 * Corrects a central directory record's sizes and local header offset from its ZIP64 extra
 * field, when any of them is the 32-bit placeholder 0xFFFFFFFF. The overriding 8-byte fields
 * appear in a fixed order — uncompressed size, compressed size, local header offset — and only
 * for the fields that are placeholders (APPNOTE.TXT 4.5.3).
 */
function zip64Fields(
  bytes: Uint8Array,
  extraStart: number,
  extraLength: number,
  compressedSize: number,
  uncompressedSize: number,
  localHeaderOffset: number
): {
  compressedSize: number
  uncompressedSize: number
  localHeaderOffset: number
} {
  const needsUncompressed = uncompressedSize === U32_MAX
  const needsCompressed = compressedSize === U32_MAX
  const needsOffset = localHeaderOffset === U32_MAX
  if (!needsUncompressed && !needsCompressed && !needsOffset)
    return { compressedSize, uncompressedSize, localHeaderOffset }
  const end = extraStart + extraLength
  for (let offset = extraStart; offset + 4 <= end;) {
    const id = u16(bytes, offset)
    const size = u16(bytes, offset + 2)
    if (id === ZIP64_EXTRA_ID) {
      let field = offset + 4
      const next = () => {
        const value = u64(bytes, field)
        field += 8
        return value
      }
      const resolvedUncompressed = needsUncompressed ? next() : uncompressedSize
      const resolvedCompressed = needsCompressed ? next() : compressedSize
      const resolvedOffset = needsOffset ? next() : localHeaderOffset
      return {
        compressedSize: resolvedCompressed,
        uncompressedSize: resolvedUncompressed,
        localHeaderOffset: resolvedOffset,
      }
    }
    offset += 4 + size
  }
  corrupt("an entry needs a ZIP64 extra field it does not have")
}

/** Scans backward for the End Of Central Directory record, bounded by the largest legal comment. */
function findEndOfCentralDirectory(bytes: Uint8Array): number {
  if (bytes.length < EOCD_SIZE)
    corrupt("it is smaller than a zip file's fixed header")
  const earliest = Math.max(0, bytes.length - EOCD_SIZE - MAX_EOCD_COMMENT)
  for (let offset = bytes.length - EOCD_SIZE; offset >= earliest; offset--)
    if (u32(bytes, offset) === EOCD_SIGNATURE) return offset
  corrupt("it has no end-of-central-directory record")
}

/** The total entry count and central directory offset, from the EOCD or, in ZIP64, past it. */
function endOfCentralDirectoryFields(bytes: Uint8Array, eocd: number) {
  const entries16 = u16(bytes, eocd + 10)
  const offset16 = u32(bytes, eocd + 16)
  const locatorOffset = eocd - ZIP64_LOCATOR_SIZE
  const hasLocator =
    locatorOffset >= 0 && u32(bytes, locatorOffset) === ZIP64_LOCATOR_SIGNATURE
  if (!hasLocator) {
    if (entries16 === 0xffff || offset16 === U32_MAX)
      corrupt("it marks ZIP64 fields but has no ZIP64 locator")
    return { totalEntries: entries16, centralDirectoryOffset: offset16 }
  }
  const zip64Eocd = u64(bytes, locatorOffset + 8)
  if (u32(bytes, zip64Eocd) !== ZIP64_EOCD_SIGNATURE)
    corrupt("its ZIP64 end-of-central-directory record has the wrong signature")
  return {
    totalEntries: u64Count(bytes, zip64Eocd + 32),
    centralDirectoryOffset: u64(bytes, zip64Eocd + 48),
  }
}

/**
 * Reads a zip archive's central directory, refusing with `ZipTooManyEntriesError` before
 * looking at a single record if it lists more than `maxEntries` (checked from the EOCD's own
 * entry count, so a ZIP64 record claiming billions of entries costs one comparison, not a
 * billion loop iterations).
 */
export function readZipFile(bytes: Uint8Array, maxEntries: number): ZipFile {
  const eocd = findEndOfCentralDirectory(bytes)
  const { totalEntries, centralDirectoryOffset } = endOfCentralDirectoryFields(
    bytes,
    eocd
  )
  if (totalEntries > maxEntries)
    throw new ZipTooManyEntriesError(
      `the archive lists more than ${maxEntries} entries.`
    )
  const entries: ZipEntry[] = []
  let offset = centralDirectoryOffset
  for (let index = 0; index < totalEntries; index++) {
    if (u32(bytes, offset) !== CENTRAL_HEADER_SIGNATURE)
      corrupt("a central directory record has the wrong signature")
    const method = u16(bytes, offset + 10)
    const crc = u32(bytes, offset + 16)
    const nameLength = u16(bytes, offset + 28)
    const extraLength = u16(bytes, offset + 30)
    const commentLength = u16(bytes, offset + 32)
    const nameStart = offset + 46
    const nameEnd = nameStart + nameLength
    if (nameEnd > bytes.length)
      corrupt("a file name runs past the end of the file")
    const name = new TextDecoder().decode(bytes.subarray(nameStart, nameEnd))
    const fields = zip64Fields(
      bytes,
      nameEnd,
      extraLength,
      u32(bytes, offset + 20),
      u32(bytes, offset + 24),
      u32(bytes, offset + 42)
    )
    entries.push({ name, method, crc32: crc, ...fields })
    offset = nameEnd + extraLength + commentLength
  }
  return {
    entries,
    read: (entry, maxBytes) => readEntry(bytes, entry, maxBytes),
  }
}

/** Where a local file header (which may repeat the name and an extra field) says its data starts. */
function localFileDataOffset(bytes: Uint8Array, entry: ZipEntry): number {
  const offset = entry.localHeaderOffset
  if (u32(bytes, offset) !== LOCAL_HEADER_SIGNATURE)
    corrupt(`${entry.name}'s local file header has the wrong signature`)
  const nameLength = u16(bytes, offset + 26)
  const extraLength = u16(bytes, offset + 28)
  return offset + 30 + nameLength + extraLength
}

function readStored(compressed: Uint8Array, entry: ZipEntry): Uint8Array {
  if (compressed.length !== entry.uncompressedSize)
    throw new Error(
      `${entry.name}'s stored size does not match its declared size.`
    )
  if (crc32(compressed) !== entry.crc32)
    throw new Error(`${entry.name} failed its CRC-32 check.`)
  // Copied out of the archive's bytes so the whole file need not stay in memory for this alone.
  return compressed.slice()
}

/**
 * Compressed input is fed to fflate's streaming `Inflate` this many bytes at a time. Since
 * DEFLATE cannot expand input by more than about 1032x, a chunk this size bounds the output a
 * single `push` can produce to a few megabytes even in the worst case, so an entry whose real
 * content exceeds `maxBytes` is caught within a handful of chunks rather than after decoding
 * everything.
 */
const CHUNK_BYTES = 16 * 1024

function readDeflated(
  compressed: Uint8Array,
  entry: ZipEntry,
  maxBytes: number
): Uint8Array {
  const chunks: Uint8Array[] = []
  let total = 0
  const inflater = new Inflate((chunk) => {
    if (total > maxBytes) return
    total += chunk.length
    if (total <= maxBytes) chunks.push(chunk)
  })
  let offset = 0
  do {
    const end = Math.min(offset + CHUNK_BYTES, compressed.length)
    try {
      inflater.push(compressed.subarray(offset, end), end === compressed.length)
    } catch (error) {
      throw new Error(
        `${entry.name} could not be decompressed: ${error instanceof Error ? error.message : "its data is corrupt"}.`
      )
    }
    if (total > maxBytes)
      throw new ZipEntryTooLargeError(
        `${entry.name} is larger than ${maxBytes} bytes.`
      )
    offset = end
  } while (offset < compressed.length)
  const output = new Uint8Array(total)
  let position = 0
  for (const chunk of chunks) {
    output.set(chunk, position)
    position += chunk.length
  }
  if (output.length !== entry.uncompressedSize)
    throw new Error(
      `${entry.name}'s decompressed size does not match its declared size.`
    )
  if (crc32(output) !== entry.crc32)
    throw new Error(`${entry.name} failed its CRC-32 check.`)
  return output
}

function readEntry(
  bytes: Uint8Array,
  entry: ZipEntry,
  maxBytes: number
): Uint8Array {
  if (entry.uncompressedSize > maxBytes)
    throw new ZipEntryTooLargeError(
      `${entry.name} is larger than ${maxBytes} bytes.`
    )
  const dataStart = localFileDataOffset(bytes, entry)
  const dataEnd = dataStart + entry.compressedSize
  if (dataEnd > bytes.length)
    corrupt(`${entry.name}'s data runs past the end of the file`)
  const compressed = bytes.subarray(dataStart, dataEnd)
  if (entry.method === STORED) return readStored(compressed, entry)
  if (entry.method === DEFLATE) return readDeflated(compressed, entry, maxBytes)
  throw new Error(
    `${entry.name} uses compression method ${entry.method}, not stored or deflate.`
  )
}
