/** Lowercase hex SHA-256; hosts inject their fastest implementation. */
export type Sha256 = (bytes: Uint8Array) => Promise<string>

const hex = (buffer: ArrayBuffer) =>
  Array.from(new Uint8Array(buffer), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("")

/** Web Crypto is available in browsers, Node and Electron alike. */
export const webCryptoSha256: Sha256 = async (bytes) =>
  hex(await globalThis.crypto.subtle.digest("SHA-256", new Uint8Array(bytes)))
