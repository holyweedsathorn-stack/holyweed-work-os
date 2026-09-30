/**
 * Resize + re-encode a photo client-side before it goes over the wire.
 *
 * Guest check-in uploads 1-8 passport photos plus a room key photo, taken
 * straight from a staff phone's camera -- routinely 5-20MB each raw. A
 * couple of those together blow past the server action's body size limit
 * (next.config.mjs, currently 20mb across the whole app), and that failure
 * happens before the request reaches checkInGuest at all: no FormData ever
 * arrives, so there's no error message to show, just a hard page-load
 * failure. Compressed to a sensible max dimension and JPEG quality, a
 * passport photo stays fully legible at well under 1MB.
 */
export async function compressImage(
  file: File,
  opts: { maxDimension?: number; quality?: number } = {}
): Promise<File> {
  const { maxDimension = 1800, quality = 0.82 } = opts;

  // Not a raster image the canvas can decode (came through as something
  // else), or already small enough that compressing isn't worth the delay.
  if (!file.type.startsWith("image/") || file.size < 400 * 1024) return file;

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();

    const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (!blob || blob.size >= file.size) return file; // never make it bigger

    const newName = file.name.replace(/\.[a-zA-Z0-9]+$/, "") + ".jpg";
    return new File([blob], newName, { type: "image/jpeg", lastModified: Date.now() });
  } catch {
    // Unsupported format, memory pressure, an older browser without
    // createImageBitmap -- fall back to the original file rather than
    // blocking check-in over a compression failure.
    return file;
  }
}
