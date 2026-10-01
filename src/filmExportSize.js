export const COWART_FILM_EXPORT_PIXEL_RATIO = 2

export function filmExportDimensions(width, height) {
  if (![width, height].every((n) => Number.isFinite(n) && n > 0)) throw new Error('影片尺寸无效。')
  // Keep the composition's CSS size. Only rasterize at 2x; H.264 needs even pixels.
  return { width: Math.max(2, Math.round(width) * 2), height: Math.max(2, Math.round(height) * 2) }
}
