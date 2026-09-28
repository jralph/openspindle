/** A chosen photo's longest side, in pixels: plenty for the editor and the Job tab. */
const PHOTO_SIZE = 480

/**
 * A picture file as a WebP data URL scaled to at most PHOTO_SIZE pixels on its longest side,
 * small enough to keep in the tool.
 */
export async function photoDataUrl(file: Blob): Promise<string> {
  const bitmap = await createImageBitmap(file)
  try {
    const scale = Math.min(
      1,
      PHOTO_SIZE / Math.max(bitmap.width, bitmap.height)
    )
    const canvas = document.createElement("canvas")
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const context = canvas.getContext("2d")
    if (!context) throw new Error("The photo could not be drawn.")
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL("image/webp", 0.85)
  } finally {
    bitmap.close()
  }
}
