import { ALL_FORMATS, BlobSource, Input, VideoSampleSink } from 'mediabunny'
import { waitForFilmTask } from './filmFrameReady.js'

function position(value, space) {
  if (value?.endsWith('%')) return parseFloat(value) / 100 * space
  if (value?.endsWith('px')) return parseFloat(value)
  if (value === 'left' || value === 'top') return 0
  if (value === 'right' || value === 'bottom') return space
  return space / 2
}

// Mirrors object-fit before HTML capture; never asks <video> to play or decode.
export function drawFittedVideo(sample, canvas, style, pixelRatio = 1) {
  const width = canvas.width / pixelRatio, height = canvas.height / pixelRatio
  const sw = sample.displayWidth, sh = sample.displayHeight
  const fit = style.objectFit
  let dw = width, dh = height
  if (fit !== 'fill') {
    const scale = fit === 'cover' ? Math.max(width / sw, height / sh)
      : fit === 'none' ? 1 : fit === 'scale-down' ? Math.min(1, width / sw, height / sh) : Math.min(width / sw, height / sh)
    dw = sw * scale; dh = sh * scale
  }
  const offsets = (style.objectPosition || '50% 50%').split(/\s+/)
  sample.draw(canvas.getContext('2d'), position(offsets[0], width - dw) * pixelRatio,
    position(offsets[1] || '50%', height - dh) * pixelRatio, dw * pixelRatio, dh * pixelRatio)
}

export function createFilmVideoFrames(options = {}) {
  const sources = new Map()
  const pixelRatio = options.pixelRatio ?? 1
  let disposed = false
  async function sourceFor(video) {
    const url = video.currentSrc || video.src || video.querySelector('source')?.src
    if (!url || video.srcObject) throw new Error('影片中的视频需要可读取的内联或本地文件。')
    if (!sources.has(url)) {
      const record = { input: null }
      record.ready = (async () => {
        const response = await fetch(url, { signal: options.signal })
        if (!response.ok) throw new Error('影片中的视频文件读取失败。')
        if (disposed) throw new DOMException('已取消影片导出。', 'AbortError')
        const blob = await response.blob()
        if (disposed) throw new DOMException('已取消影片导出。', 'AbortError')
        record.input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS })
        const track = await record.input.getPrimaryVideoTrack()
        if (!track || !await track.canDecode()) throw new Error('当前环境无法解码影片中的视频。')
        return { sink: new VideoSampleSink(track), duration: await track.computeDuration() }
      })()
      sources.set(url, record)
    }
    return waitForFilmTask(sources.get(url).ready, { ...options, label: '嵌入视频准备' })
  }
  return {
    async render(doc) {
      const frames = new Map()
      try {
        for (const video of doc.querySelectorAll('video')) {
          const style = doc.defaultView.getComputedStyle(video)
          if (style.display === 'none' || style.visibility === 'hidden') continue
          const { sink, duration } = await sourceFor(video)
          if (disposed) throw new DOMException('已取消影片导出。', 'AbortError')
          const seconds = video.loop ? video.currentTime % duration : video.currentTime
          const decoding = sink.getSample(Math.max(0, Math.min(seconds, duration - 0.000001))).then((sample) => {
            if (disposed || options.signal?.aborted) {
              sample?.close()
              throw new DOMException('已取消影片导出。', 'AbortError')
            }
            return sample
          })
          const sample = await waitForFilmTask(decoding,
            { ...options, label: '嵌入视频帧解码' })
          if (!sample) throw new Error('嵌入视频缺少指定时间的帧。')
          try {
            // Mediabunny checks the context's realm. Decode/draw in the host
            // realm, then copy the bitmap into the iframe capture clone.
            const canvas = document.createElement('canvas')
            canvas.width = Math.max(1, Math.round((video.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)) * pixelRatio))
            canvas.height = Math.max(1, Math.round((video.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom)) * pixelRatio))
            drawFittedVideo(sample, canvas, style, pixelRatio)
            frames.set(video, canvas)
          } finally { sample.close() }
        }
        return frames
      } catch (error) {
        for (const canvas of frames.values()) canvas.width = canvas.height = 0
        throw error
      }
    },
    dispose() {
      disposed = true
      for (const record of sources.values()) record.input?.dispose()
      sources.clear()
    }
  }
}
