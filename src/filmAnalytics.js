import { FILM_STYLES, getFilmOptions } from './filmConfig.js'

// Only bounded product metadata belongs in analytics, never HTML or shape ids.
export function filmAnalyticsParameters(options = {}) {
  const parameters = {}
  if (FILM_STYLES.some((style) => style.id === options.filmStyle)) parameters.film_style = options.filmStyle
  for (const [key, value, maximum] of [
    ['film_duration', options.filmDuration, 120],
    ['film_width', options.filmWidth, 16384],
    ['film_height', options.filmHeight, 16384]
  ]) {
    if (typeof value === 'number' && Number.isFinite(value) && value >= 1 && value <= maximum) {
      parameters[key] = value
    }
  }
  if (typeof options.filmMuted === 'boolean') parameters.film_muted = options.filmMuted ? 'yes' : 'no'
  return parameters
}

export function filmAnalyticsContext(shape) {
  const { style, duration, muted } = getFilmOptions(shape)
  return {
    filmStyle: style.id,
    filmDuration: duration,
    filmMuted: muted,
    filmWidth: Number(shape?.props?.w),
    filmHeight: Number(shape?.props?.h)
  }
}

export async function withFilmExportAnalytics(exporter, parameters, trackExport, signal) {
  // Analytics must never fail or delay rendering or the actual download.
  const track = (stage) => {
    try { trackExport({ ...parameters, stage }) } catch (_error) { /* Keep exporting. */ }
  }
  track('started')
  try {
    const result = await exporter()
    signal?.throwIfAborted()
    track('succeeded')
    return result
  } catch (error) {
    track(signal?.aborted || error?.name === 'AbortError' ? 'cancelled' : 'failed')
    throw error
  }
}
