export const COWART_FILM_FPS = 30

// Shared by preview scrubbing and export, including sub-frame rounding and end.
export function quantizeFilmTime(value, duration = Infinity) {
  if (!Number.isFinite(value)) throw new Error('影片时间必须为有限数字。')
  return Math.min(duration, Math.max(0, Math.round(value * COWART_FILM_FPS) / COWART_FILM_FPS))
}
