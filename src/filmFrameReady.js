import { quantizeFilmTime } from './filmTimeline.js'

export function waitForFilmTask(task, { signal, timeout = 15000, label = '影片渲染' } = {}) {
  return new Promise((resolve, reject) => {
    let timer
    const abort = () => finish(new DOMException('已取消影片导出。', 'AbortError'))
    function finish(error, value) {
      clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
      error ? reject(error) : resolve(value)
    }
    if (signal?.aborted) { abort(); return }
    signal?.addEventListener('abort', abort, { once: true })
    timer = setTimeout(() => finish(new Error(`${label}超时。`)), timeout)
    Promise.resolve().then(() => typeof task === 'function' ? task() : task).then((value) => finish(null, value), finish)
  })
}

export async function waitForFilmAPI(frame, options = {}) {
  const deadline = Date.now() + (options.timeout || 15000)
  while (Date.now() < deadline) {
    if (options.signal?.aborted) throw new DOMException('已取消影片导出。', 'AbortError')
    const film = frame.CowartFilm
    if (film) {
      if (!['seek', 'play', 'pause', 'setMuted'].every((key) => typeof film[key] === 'function')) {
        throw new Error('CowartFilm 播放接口不完整。')
      }
      if (film.ready) await waitForFilmTask(film.ready, { ...options, label: '影片初始化' })
      return film
    }
    await waitForFilmTask(new Promise((resolve) => setTimeout(resolve, 25)), options)
  }
  throw new Error('影片缺少 CowartFilm 播放接口或初始化超时。')
}

const decodedAssets = new WeakMap()

export async function prepareFilmAssets(doc, options = {}) {
  let cache = decodedAssets.get(doc)
  if (!cache) { cache = new Map(); decodedAssets.set(doc, cache) }
  const tasks = []
  function decode(url, image) {
    if (!url) return
    if (!cache.has(url)) {
      const promise = (async () => {
        const asset = image || new doc.defaultView.Image()
        if (!image) asset.src = url
        await asset.decode()
        if (!asset.naturalWidth) throw new Error('影片图片解码失败。')
      })().catch(() => { cache.delete(url); throw new Error('影片图片或背景素材加载失败。') })
      cache.set(url, promise)
    }
    tasks.push(cache.get(url))
  }
  for (const image of doc.images) decode(image.currentSrc || image.src, image)
  for (const image of doc.querySelectorAll('svg image')) decode(image.href?.baseVal)
  // Force style/layout before fonts.ready; seek may have revealed new text.
  doc.documentElement.getBoundingClientRect()
  for (const element of doc.querySelectorAll('*')) {
    for (const pseudo of [null, '::before', '::after']) {
      const style = doc.defaultView.getComputedStyle(element, pseudo)
      for (const value of [style.backgroundImage, style.maskImage, style.borderImageSource, style.content]) {
        for (const match of (value || '').matchAll(/url\(\s*(?:"([^"\n]*)"|'([^'\n]*)'|([^)]*))\s*\)/g)) {
          decode((match[1] ?? match[2] ?? match[3]).trim())
        }
      }
    }
  }
  if (doc.fonts) tasks.push(Promise.resolve(doc.fonts.ready).then(() => {
    if (Array.from(doc.fonts).some((font) => font.status === 'error')) throw new Error('影片字体加载失败，请将字体内联后导出。')
  }))
  await waitForFilmTask(Promise.all(tasks), { ...options, label: '影片字体与图片准备' })
}

export async function seekFilmFrame(iframe, film, seconds, options = {}) {
  const time = quantizeFilmTime(seconds, film.duration)
  iframe.contentWindow.__cowartSetExportTime?.(time)
  await waitForFilmTask(() => film.seek(time), { ...options, label: '影片帧定位' })
  // Yield for queued style work, then flush layout before the DOM snapshot.
  if (iframe.contentWindow.__cowartExportPaint) {
    await waitForFilmTask(() => iframe.contentWindow.__cowartExportPaint(), { ...options, label: '影片帧布局' })
  }
  await prepareFilmAssets(iframe.contentDocument, options)
  return time
}
