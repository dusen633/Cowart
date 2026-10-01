import { quantizeFilmTime } from './filmTimeline.js'

const CHANNEL = 'cowart-film'
const UNSUPPORTED_MESSAGE = '影片缺少 CowartFilm 播放接口，且没有可控制的 HTML 媒体或 CSS 动画。请重新生成带播放接口的影片。'

function positiveDuration(value, fallback) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : fallback
}

/**
 * Controls a film without adding nodes or attributes to its HTML document.
 * CowartFilm is the preferred API; message-only films and native media / WAAPI
 * animations are supported too. Call after the iframe's load event.
 */
export function attachCowartFilmController(iframe, { duration = 15, muted = false, onStatus = () => {} } = {}) {
  const host = iframe.ownerDocument?.defaultView || globalThis.window
  if (!host) throw new Error('Cowart film playback requires a browser window.')
  const frame = iframe.contentWindow
  const now = () => host.performance?.now?.() ?? Date.now()
  const requestFrame = host.requestAnimationFrame?.bind(host) || ((callback) => host.setTimeout(() => callback(now()), 16))
  const cancelFrame = host.cancelAnimationFrame?.bind(host) || host.clearTimeout.bind(host)
  const state = { duration: positiveDuration(duration, 15), currentTime: 0, playing: false, muted: Boolean(muted), ready: false }
  let disposed = false
  let backend = null
  let animationFrame = null
  let supportTimer = null
  let anchorTime = 0
  let anchorClock = now()
  let lastPublishedAt = -Infinity
  let lastPublished = ''
  let initializing = false

  function publish(force = false) {
    if (disposed) return
    const signature = JSON.stringify(state)
    if (force || (signature !== lastPublished && now() - lastPublishedAt >= 100)) {
      lastPublished = signature
      lastPublishedAt = now()
      onStatus({ ...state })
    }
  }

  function fail(error) {
    if (disposed) return
    // Audio initialization may reject after visual playback has already begun.
    // Stop the actual film too, otherwise disabled controls leave it running.
    try {
      if (backend?.kind === 'api') backend.api.pause()
      else if (backend?.kind === 'native') {
        for (const media of backend.media) media.pause()
        for (const animation of backend.animations) animation.pause()
      } else if (backend?.kind === 'message') post('pause')
    } catch { /* Preserve the original playback error. */ }
    state.playing = false
    state.ready = false
    state.error = error instanceof Error ? error.message : String(error)
    stopTick()
    publish(true)
  }

  function clampTime(value) {
    const number = Number(value)
    return Number.isFinite(number) ? Math.max(0, Math.min(number, state.duration)) : state.currentTime
  }

  function resetClock() {
    anchorTime = state.currentTime
    anchorClock = now()
  }

  function post(command, value) {
    frame?.postMessage({ channel: CHANNEL, type: 'command', command, value }, '*')
  }

  function settleResult(result) {
    if (result && typeof result.then === 'function') result.catch(fail)
  }

  function call(command, value) {
    try {
      if (backend?.kind === 'api') {
        const method = command === 'mute' ? 'setMuted' : command
        settleResult(backend.api[method](value))
      } else if (backend?.kind === 'native') {
        for (const media of backend.media) {
          if (command === 'mute') media.muted = value
          if (command === 'seek') media.currentTime = Number.isFinite(media.duration) && media.duration > 0 ? Math.min(value, media.duration) : value
          if (command === 'play') settleResult(media.play())
          if (command === 'pause') media.pause()
        }
        for (const animation of backend.animations) {
          if (command === 'seek') animation.currentTime = value * 1000
          if (command === 'play') animation.play()
          if (command === 'pause') animation.pause()
        }
      } else {
        post(command, value)
      }
      return true
    } catch (error) {
      fail(error)
      return false
    }
  }

  function stopTick() {
    if (animationFrame !== null) cancelFrame(animationFrame)
    animationFrame = null
  }

  function readBackendState() {
    try {
      if (backend?.kind === 'api') {
        const apiState = typeof backend.api.getState === 'function' ? backend.api.getState() : backend.api
        if (apiState && typeof apiState === 'object') {
          const nextDuration = positiveDuration(apiState.duration ?? backend.api.duration, state.duration)
          state.duration = nextDuration
          if (Number.isFinite(apiState.currentTime)) state.currentTime = clampTime(apiState.currentTime)
          else state.currentTime = clampTime(anchorTime + (now() - anchorClock) / 1000)
          if (typeof apiState.playing === 'boolean') state.playing = apiState.playing
          if (typeof apiState.muted === 'boolean') state.muted = apiState.muted
        }
      } else if (backend?.kind === 'native') {
        // Audio can be shorter than the visuals or loop; it must not determine
        // the film's timeline. Native fallback uses the declared film duration.
        state.currentTime = clampTime(anchorTime + (now() - anchorClock) / 1000)
      } else {
        state.currentTime = clampTime(anchorTime + (now() - anchorClock) / 1000)
      }
    } catch (error) {
      fail(error)
    }
  }

  function tick() {
    animationFrame = null
    if (disposed || !state.playing) return
    readBackendState()
    if (state.currentTime >= state.duration) {
      state.currentTime = state.duration
      state.playing = false
      call('pause')
      call('seek', state.duration)
      resetClock()
      publish(true)
    } else if (!state.playing) publish(true)
    else {
      publish()
      animationFrame = requestFrame(tick)
    }
  }

  function startTick() {
    if (animationFrame === null && state.playing && !disposed) animationFrame = requestFrame(tick)
  }

  function initializeBackend(nextBackend) {
    if (disposed) return
    backend = nextBackend
    if (supportTimer !== null) host.clearTimeout(supportTimer)
    supportTimer = null
    delete state.error
    state.ready = true
    state.playing = false
    state.currentTime = 0
    state.duration = positiveDuration(nextBackend.api?.duration, state.duration)
    initializing = true
    // Pause before seeking, and apply the sound preference before user initiated play.
    const success = call('pause') && call('mute', state.muted) && call('seek', 0)
    initializing = false
    resetClock()
    if (success) publish(true)
  }

  function discoverBackend() {
    try {
      const api = frame?.CowartFilm
      if (api) {
        if (!['seek', 'play', 'pause', 'setMuted'].every((method) => typeof api[method] === 'function')) {
          fail('CowartFilm 播放接口不完整，需要 seek、play、pause 和 setMuted 方法。')
          return true
        }
        initializeBackend({ kind: 'api', api })
        return true
      }
      const document = iframe.contentDocument
      const media = Array.from(document?.querySelectorAll('video, audio') || [])
      const animations = Array.from(document?.getAnimations?.() || [])
      if (media.length || animations.length) {
        initializeBackend({ kind: 'native', media, animations })
        return true
      }
    } catch {
      // A message API can also control an iframe whose document is inaccessible.
    }
    return false
  }

  function handleMessage(event) {
    if (disposed || event.source !== frame || event.data?.channel !== CHANNEL || event.data?.type !== 'status') return
    const data = event.data
    if (![data.duration, data.currentTime].every((value) => typeof value === 'number' && Number.isFinite(value)) ||
      data.duration <= 0 || typeof data.playing !== 'boolean' || typeof data.muted !== 'boolean') return
    if (!backend) {
      initializeBackend({ kind: 'message' })
      return
    }
    if (initializing) return
    state.duration = positiveDuration(data.duration, state.duration)
    state.currentTime = clampTime(data.currentTime)
    state.playing = data.playing && state.currentTime < state.duration
    state.muted = data.muted
    state.ready = true
    delete state.error
    resetClock()
    if (state.playing) startTick()
    else stopTick()
    publish(true)
  }

  function handleUnload() {
    dispose()
  }

  function command(name, value) {
    if (disposed || !state.ready) return false
    if (!['play', 'pause', 'seek', 'mute'].includes(name)) return false
    if (name === 'seek') {
      if (!Number.isFinite(Number(value))) return false
      state.currentTime = quantizeFilmTime(Number(value), state.duration)
      if (!call('seek', state.currentTime)) return false
      // Seeking never implicitly plays. Reaching the end pauses every backend.
      if (state.currentTime >= state.duration) {
        state.playing = false
        call('pause')
        stopTick()
      }
    } else if (name === 'play') {
      if (state.currentTime >= state.duration) {
        state.currentTime = 0
        if (!call('seek', 0)) return false
      }
      state.playing = true
      if (!call('play')) return false
    } else if (name === 'pause') {
      if (state.playing) readBackendState()
      state.playing = false
      if (!call('pause')) return false
      stopTick()
    } else {
      state.muted = Boolean(value)
      if (!call('mute', state.muted)) return false
    }
    resetClock()
    startTick()
    publish(true)
    return true
  }

  function dispose() {
    if (disposed) return
    // Prevent detached frames from keeping audio or their own RAF loop alive.
    call('pause')
    disposed = true
    stopTick()
    if (supportTimer !== null) host.clearTimeout(supportTimer)
    host.removeEventListener('message', handleMessage)
    try { frame?.removeEventListener('pagehide', handleUnload) } catch { /* Cross-origin message films. */ }
    backend = null
  }

  host.addEventListener('message', handleMessage)
  try { frame?.addEventListener('pagehide', handleUnload) } catch { /* Cross-origin message films. */ }
  if (!discoverBackend()) {
    publish(true)
    // Some generated films expose their API asynchronously after the load event.
    const startedAt = now()
    const retry = () => {
      supportTimer = null
      if (disposed || backend || discoverBackend()) return
      if (now() - startedAt >= 1500) fail(UNSUPPORTED_MESSAGE)
      else supportTimer = host.setTimeout(retry, 100)
    }
    supportTimer = host.setTimeout(retry, 100)
    post('pause')
    post('mute', state.muted)
    post('seek', 0)
  }
  return { command, dispose }
}
