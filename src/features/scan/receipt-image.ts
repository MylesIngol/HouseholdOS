import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

// -----------------------------------------------------------------------------
// Checkpoint D: client-side receipt photo compression only — nothing here
// sends the result anywhere. The shape returned is deliberately already
// what checkpoint E's process-receipt Edge Function will want (base64
// inline in the request body, per plan section 5's "no Storage bucket"
// decision), so that checkpoint only has to call `supabase.functions.invoke`
// with this object, not touch capture/compression code again.
//
// Uses the new context-based ImageManipulator API (`.manipulate(uri)` ->
// chained transforms -> `.renderAsync()` -> `.saveAsync()`) — SDK 54's
// `manipulateAsync` free function still exists but is deprecated in favor
// of this one.
// -----------------------------------------------------------------------------

export type CapturedReceiptImage = {
  uri: string;
  base64: string;
  width: number;
  height: number;
  mimeType: 'image/jpeg';
  /** Approximate encoded size in bytes, derived from the base64 string length — good enough for a dev-log sanity check, not exact. */
  byteSize: number;
};

// Target ~0.8 JPEG quality, longest edge ~2000px (plan sections 5 and 17) —
// small enough for a fast, cheap inline request in checkpoint E, still
// large enough for reliable text extraction.
const MAX_LONGEST_EDGE = 2000;
const JPEG_QUALITY = 0.8;

export async function compressReceiptImage(
  uri: string,
  originalWidth: number,
  originalHeight: number,
): Promise<CapturedReceiptImage> {
  const context = ImageManipulator.manipulate(uri);

  // width/height can come back as 0 if the OS didn't report them (rare,
  // per expo-image-picker's own docs) — skip resizing rather than risk a
  // bogus zero-dimension resize; the compress option below still shrinks
  // the file regardless of whether a resize happened.
  if (
    originalWidth > 0 &&
    originalHeight > 0 &&
    Math.max(originalWidth, originalHeight) > MAX_LONGEST_EDGE
  ) {
    if (originalWidth >= originalHeight) {
      context.resize({ width: MAX_LONGEST_EDGE });
    } else {
      context.resize({ height: MAX_LONGEST_EDGE });
    }
  }

  const rendered = await context.renderAsync();
  const result = await rendered.saveAsync({
    compress: JPEG_QUALITY,
    format: SaveFormat.JPEG,
    base64: true,
  });

  if (!result.base64) {
    // Shouldn't happen given `base64: true` above, but saveAsync's own
    // return type marks it optional — fail loudly rather than silently
    // handing checkpoint E's future caller an image with no data.
    throw new Error('Could not process that photo — try again.');
  }

  return {
    uri: result.uri,
    base64: result.base64,
    width: result.width,
    height: result.height,
    mimeType: 'image/jpeg',
    byteSize: Math.ceil((result.base64.length * 3) / 4),
  };
}
