import { AudioBufferSource, BufferTarget, CanvasSource, Mp4OutputFormat, Output, Quality, canEncodeAudio, canEncodeVideo } from 'mediabunny'
import { renderHtmlDraftDocument } from './htmlDraftCapture.js'
import { COWART_FILM_FPS } from './filmTimeline.js'
import { prepareFilmAssets, seekFilmFrame, waitForFilmAPI, waitForFilmTask } from './filmFrameReady.js'
import { createFilmVideoFrames } from './filmVideoFrames.js'

export function filmExportDimensions(width, height) {
  if (![width, height].every((n) => Number.isFinite(n) && n > 0)) throw new Error('影片尺寸无效。')
  const scale = Math.min(1, 1920 / Math.max(width, height))
  return { width: Math.max(2, Math.round(width * scale / 2) * 2), height: Math.max(2, Math.round(height * scale / 2) * 2) }
}

// Runs only in an isolated export iframe. Existing score-based films can export
// their Web Audio graph without recording the desktop or playing audible sound.
function installLegacyAudioExport(duration) {
  const contexts = []
  const NativeOffline = window.OfflineAudioContext || window.webkitOfflineAudioContext
  const rate = 48000
  const length = Math.ceil(duration * rate)
  let audioError
  if (NativeOffline) {
    window.AudioContext = window.webkitAudioContext = function () {
      const context = new NativeOffline(2, length, rate)
      contexts.push(context)
      return new Proxy(context, {
        get(target, key) {
          if (key === 'state') return 'running'
          if (key === 'resume' || key === 'suspend' || key === 'close') return () => Promise.resolve()
          const value = Reflect.get(target, key, target)
          return typeof value === 'function' ? value.bind(target) : value
        }
      })
    }
  }
  window.addEventListener('unhandledrejection', (event) => { audioError = event.reason })
  // Let font/image/library initialization finish on the real browser clock.
  // Freeze only after readiness; each seek supplies the requested frame time.
  const nativeNow = window.performance.now.bind(window.performance)
  const pending = new Map()
  const channel = new MessageChannel()
  let nextId = 0
  let frozen = false, frameTime = 0
  // Message tasks yield to initialization/audio work, without background RAF
  // throttling or microtask starvation from legacy playback loops.
  channel.port1.onmessage = (event) => {
    const callback = pending.get(event.data)
    pending.delete(event.data)
    callback?.(frozen ? frameTime * 1000 : nativeNow())
  }
  window.requestAnimationFrame = (callback) => {
    const id = ++nextId
    pending.set(id, callback)
    channel.port2.postMessage(id)
    return id
  }
  window.cancelAnimationFrame = (id) => pending.delete(id)
  Object.defineProperty(window.performance, 'now', { value: () => frozen ? frameTime * 1000 : nativeNow(), configurable: true })
  window.__cowartSetExportTime = (time) => {
    frozen = true
    frameTime = time
    pending.clear()
  }
  window.__cowartExportPaint = () => new Promise((resolve) => window.requestAnimationFrame(() => {
    document.documentElement.getBoundingClientRect()
    resolve()
  }))
  window.__cowartDisposeExport = () => { pending.clear(); channel.port1.close(); channel.port2.close() }
  window.__cowartRenderLegacyAudio = async (film) => {
    if (!NativeOffline) throw new Error('当前环境不支持离线音频渲染。')
    await film.pause()
    await film.seek(0)
    await film.setMuted(false)
    await film.play()
    await new Promise((resolve) => setTimeout(resolve, 0))
    if (audioError) throw audioError
    if (!contexts.length) throw new Error('影片没有可导出的音轨，请重新生成包含 renderAudio 接口的影片。')
    const buffers = await Promise.all(contexts.map((context) => context.startRendering()))
    await film.pause()
    const result = new AudioBuffer({ numberOfChannels: 2, length, sampleRate: rate })
    for (const buffer of buffers) {
      for (let channel = 0; channel < 2; channel++) {
        const source = buffer.getChannelData(Math.min(channel, buffer.numberOfChannels - 1))
        const target = result.getChannelData(channel)
        for (let i = 0; i < length; i++) target[i] += source[i] || 0
      }
    }
    return result
  }
}

export function withFilmExportBootstrap(html, duration) {
  const script = `<script>(${installLegacyAudioExport.toString()})(${JSON.stringify(duration)});<\/script>`
  // DOM parsing places the hook before any film script, including head scripts.
  const doc = new DOMParser().parseFromString(html, 'text/html')
  doc.head.insertAdjacentHTML('afterbegin', script)
  return '<!doctype html>\n' + doc.documentElement.outerHTML
}

async function createExportFrame(html, width, height, duration, options) {
  const iframe = document.createElement('iframe')
  iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.style.cssText = `position:fixed;left:-100000px;top:0;width:${width}px;height:${height}px;border:0;pointer-events:none;`
  try {
    await waitForFilmTask(() => new Promise((resolve) => {
      iframe.onload = resolve
      iframe.srcdoc = withFilmExportBootstrap(html, duration)
      document.body.append(iframe)
    }), { ...options, label: '影片加载' })
    await prepareFilmAssets(iframe.contentDocument, options)
    return iframe
  } catch (error) {
    iframe.contentWindow.__cowartDisposeExport?.()
    iframe.remove()
    throw error
  }
}

export async function renderCowartFilmMp4({ html, width, height, duration, onProgress = () => {}, signal, taskTimeout = 15000 }) {
  if (!Number.isFinite(duration) || duration <= 0 || duration > 120) throw new Error('影片时长必须为 1–120 秒。')
  const size = filmExportDimensions(width, height)
  const videoQuality = new Quality({ bitrate: 5_000_000 })
  const audioQuality = new Quality({ bitrate: 192_000 })
  const options = { signal, timeout: taskTimeout }
  if (!await waitForFilmTask(() => canEncodeVideo('avc', { ...size, frameRate: COWART_FILM_FPS, quality: videoQuality }), options)) {
    throw new Error('当前 Widget 环境不支持 H.264 MP4 编码，请在支持 WebCodecs 的新版 Codex 中导出。')
  }
  if (!await waitForFilmTask(() => canEncodeAudio('aac', { numberOfChannels: 2, sampleRate: 48000, quality: audioQuality }), options)) {
    throw new Error('当前 Widget 环境不支持 AAC 音频编码，无法导出带音乐的 MP4。')
  }
  const checkCanceled = () => { if (signal?.aborted) throw new DOMException('已取消影片导出。', 'AbortError') }
  let iframe, output, videos
  try {
    checkCanceled()
    onProgress(0)
    iframe = await createExportFrame(html, width, height, duration, options)
    const film = await waitForFilmAPI(iframe.contentWindow, options)
    if (!Number.isFinite(film.duration) || Math.abs(film.duration - duration) > 0.000001) {
      throw new Error('影片接口时长与画布设置不一致，请更新影片后导出。')
    }
    await waitForFilmTask(() => film.pause(), options)
    iframe.contentWindow.__cowartSetExportTime(0)
    const audio = await waitForFilmTask(() => typeof film.renderAudio === 'function'
      ? film.renderAudio({ sampleRate: 48000, numberOfChannels: 2 })
      : iframe.contentWindow.__cowartRenderLegacyAudio(film), { ...options, label: '影片音轨渲染' })
    if (!audio?.getChannelData || Math.abs(audio.duration - duration) > 0.05) throw new Error('影片音轨无效或时长不匹配。')
    // Normalize to the encoder configuration, including mono/custom-rate scores.
    const offline = new OfflineAudioContext(2, Math.ceil(duration * 48000), 48000)
    const source = offline.createBufferSource()
    source.buffer = audio
    source.connect(offline.destination)
    source.start(0)
    const soundtrack = await waitForFilmTask(() => offline.startRendering(), { ...options, label: '影片音轨混音' })
    let audible = false
    for (let channel = 0; channel < soundtrack.numberOfChannels && !audible; channel++) {
      audible = soundtrack.getChannelData(channel).some((sample) => Math.abs(sample) > 0.0001)
    }
    if (!audible) throw new Error('未获得影片音乐或音效，请重新生成包含完整 renderAudio 音轨的影片。')
    checkCanceled()
    await waitForFilmTask(() => film.pause(), options)
    await waitForFilmTask(() => film.setMuted(true), options)
    videos = createFilmVideoFrames(options)
    const canvas = document.createElement('canvas')
    Object.assign(canvas, size)
    const context = canvas.getContext('2d')
    output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target: new BufferTarget() })
    const videoSource = new CanvasSource(canvas, { codec: 'avc', quality: videoQuality })
    const audioSource = new AudioBufferSource({ codec: 'aac', quality: audioQuality })
    output.addVideoTrack(videoSource, { frameRate: COWART_FILM_FPS })
    output.addAudioTrack(audioSource)
    await waitForFilmTask(() => output.start(), { ...options, label: '影片编码启动' })
    await waitForFilmTask(() => audioSource.add(soundtrack), { ...options, label: '影片音频编码' })
    audioSource.close()
    const frames = Math.ceil(duration * COWART_FILM_FPS)
    for (let index = 0; index < frames; index++) {
      checkCanceled()
      const time = await seekFilmFrame(iframe, film, index / COWART_FILM_FPS, options)
      const videoFrames = await videos.render(iframe.contentDocument)
      let frame
      try {
        frame = await waitForFilmTask(() => renderHtmlDraftDocument(iframe.contentDocument, {
          width, height, pixelRatio: Math.min(size.width / width, size.height / height), freezeAtCurrentFrame: true, videoFrames
        }), { ...options, label: '影片帧截图' })
        context.fillStyle = '#fff'
        context.fillRect(0, 0, size.width, size.height)
        context.drawImage(frame, 0, 0, size.width, size.height)
        await waitForFilmTask(() => videoSource.add(time, Math.min(1 / COWART_FILM_FPS, duration - time), {
          keyFrame: index % (COWART_FILM_FPS * 2) === 0
        }), { ...options, label: '影片帧编码' })
      } finally {
        if (frame) frame.width = frame.height = 0
        for (const canvas of videoFrames.values()) canvas.width = canvas.height = 0
      }
      onProgress((index + 1) / frames * 0.95)
    }
    videoSource.close()
    await waitForFilmTask(() => output.finalize(), { ...options, label: 'MP4 封装' })
    checkCanceled()
    onProgress(1)
    return new Blob([output.target.buffer], { type: 'video/mp4' })
  } catch (error) {
    if (output && output.state !== 'finalized') await output.cancel().catch(() => {})
    throw error
  } finally {
    videos?.dispose()
    try { iframe?.contentWindow.CowartFilm?.pause() } catch { /* Unloaded iframe. */ }
    iframe?.contentWindow.__cowartDisposeExport?.()
    iframe?.remove()
  }
}
