import assert from 'node:assert/strict'
import { attachCowartFilmController } from '../src/filmPlayback.js'
import { getFilmOptions } from '../src/filmConfig.js'

assert.equal(getFilmOptions().muted, false, 'new films default to sound enabled')
assert.equal(getFilmOptions({ meta: { cowartFilmMuted: true } }).muted, true, 'explicit mute preferences are preserved')

function createEventTarget() {
  const listeners = new Map()
  return {
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, new Set())
      listeners.get(type).add(listener)
    },
    removeEventListener(type, listener) { listeners.get(type)?.delete(listener) },
    dispatch(type, event = {}) { for (const listener of [...(listeners.get(type) || [])]) listener(event) },
    listenerCount(type) { return listeners.get(type)?.size || 0 },
  }
}

function createFixture({ apiFactory, media = [], animations = [], inaccessible = false } = {}) {
  let time = 0
  let nextId = 1
  const pendingFrames = new Map()
  const pendingTimers = new Map()
  const host = {
    ...createEventTarget(),
    performance: { now: () => time },
    requestAnimationFrame(callback) { const id = nextId++; pendingFrames.set(id, callback); return id },
    cancelAnimationFrame(id) { pendingFrames.delete(id) },
    setTimeout(callback, delay) { const id = nextId++; pendingTimers.set(id, { callback, due: time + delay }); return id },
    clearTimeout(id) { pendingTimers.delete(id) },
  }
  const posts = []
  const frame = { ...createEventTarget(), postMessage(message) { posts.push(message) } }
  if (apiFactory) frame.CowartFilm = apiFactory(host)
  const iframe = {
    ownerDocument: { defaultView: host },
    contentWindow: frame,
    get contentDocument() {
      if (inaccessible) throw new Error('Cross-origin document')
      return { querySelectorAll: () => media, getAnimations: () => animations }
    },
  }
  const statuses = []
  const controller = attachCowartFilmController(iframe, { duration: 5, onStatus: (status) => statuses.push(status) })
  return {
    controller, frame, host, posts, statuses,
    get status() { return statuses.at(-1) },
    advance(milliseconds) {
      time += milliseconds
      for (const [id, timer] of [...pendingTimers]) {
        if (timer.due <= time) { pendingTimers.delete(id); timer.callback() }
      }
      const frames = [...pendingFrames.values()]
      pendingFrames.clear()
      for (const callback of frames) callback(time)
    },
    get pendingWork() { return pendingFrames.size + pendingTimers.size },
    message(data, source = frame) { host.dispatch('message', { source, data }) },
  }
}

function apiFactory(host) {
  let playing = true
  let currentTime = 3
  let muted = false
  let playClock = host.performance.now()
  const calls = []
  return {
    duration: 5, calls,
    seek(seconds) { calls.push(['seek', seconds]); currentTime = seconds; playClock = host.performance.now() },
    play() { calls.push(['play']); playing = true; playClock = host.performance.now() },
    pause() {
      calls.push(['pause'])
      if (playing) currentTime += (host.performance.now() - playClock) / 1000
      playing = false
    },
    setMuted(value) { calls.push(['mute', value]); muted = value },
    getState() { return { duration: 5, currentTime: currentTime + (playing ? (host.performance.now() - playClock) / 1000 : 0), playing, muted } },
  }
}

const api = createFixture({ apiFactory })
assert.deepEqual(api.frame.CowartFilm.calls, [['pause'], ['mute', false], ['seek', 0]])
assert.deepEqual(api.status, { duration: 5, currentTime: 0, playing: false, muted: false, ready: true })
assert.equal(api.controller.command('play'), true)
assert.deepEqual(api.frame.CowartFilm.calls.at(-1), ['play'], 'play calls API synchronously, preserving the audio user gesture')
api.advance(1000)
assert.equal(api.status.currentTime, 1)
api.controller.command('pause')
api.advance(1000)
assert.equal(api.status.currentTime, 1, 'paused time must remain stable')
assert.equal(api.status.playing, false)
api.controller.command('seek', 0.0333333)
const firstQuantizedSeek = api.status.currentTime
api.controller.command('seek', 0.0333334)
assert.equal(api.status.currentTime, firstQuantizedSeek, 'equivalent preview timestamps must resolve to the same export frame')
api.controller.command('seek', 4)
assert.equal(api.status.currentTime, 4)
assert.equal(api.status.playing, false, 'a paused seek cannot start playback')
api.controller.command('mute', true)
assert.equal(api.status.muted, true)
api.controller.command('mute', false)
assert.equal(api.status.muted, false)
assert.deepEqual(api.frame.CowartFilm.calls.at(-1), ['mute', false])
assert.equal(api.controller.command('seek', NaN), false)
assert.equal(api.controller.command('arbitrary'), false)
api.controller.command('play')
api.advance(1100)
assert.equal(api.status.currentTime, 5)
assert.equal(api.status.playing, false, 'natural end must pause at the final frame')
assert.deepEqual(api.frame.CowartFilm.calls.slice(-2), [['pause'], ['seek', 5]])
api.controller.command('play')
assert.deepEqual(api.frame.CowartFilm.calls.slice(-2), [['seek', 0], ['play']], 'replay seeks before playing')
assert.equal(api.status.currentTime, 0)
api.controller.command('seek', 99)
assert.equal(api.status.currentTime, 5)
assert.equal(api.status.playing, false)
api.controller.dispose()
assert.equal(api.host.listenerCount('message'), 0)
assert.equal(api.frame.listenerCount('pagehide'), 0)
assert.equal(api.pendingWork, 0)
assert.equal(api.controller.command('play'), false)
api.controller.dispose()

const estimator = createFixture({ apiFactory: () => ({ duration: 5, seek() {}, play() {}, pause() {}, setMuted() {} }) })
estimator.controller.command('play')
estimator.advance(1200)
assert.equal(estimator.status.currentTime, 1.2, 'API without getState still reports elapsed time')
estimator.controller.command('seek', 3)
estimator.advance(500)
assert.equal(estimator.status.currentTime, 3.5, 'playing seek resets the clock anchor')
estimator.frame.dispatch('pagehide')
assert.equal(estimator.pendingWork, 0, 'frame navigation disposes the controller')

const message = createFixture({ inaccessible: true })
assert.equal(message.status.ready, false)
assert.equal(message.posts.length, 3)
const statusMessage = { channel: 'cowart-film', type: 'status', duration: 7, currentTime: 0, playing: false, muted: true }
message.message(statusMessage, {})
assert.equal(message.status.ready, false, 'foreign frame messages cannot claim playback support')
message.message({ ...statusMessage, currentTime: '0' })
assert.equal(message.status.ready, false, 'malformed messages are ignored')
message.message(statusMessage)
assert.equal(message.status.ready, true)
message.message({ ...statusMessage, currentTime: 2 })
assert.equal(message.status.currentTime, 2)
assert.equal(message.status.duration, 7)
message.controller.command('play')
assert.equal(message.posts.at(-1).command, 'play')
message.controller.command('mute', false)
assert.equal(message.posts.at(-1).value, false)
message.message({ ...statusMessage, currentTime: 7 })
assert.equal(message.status.playing, false)
message.controller.dispose()
assert.equal(message.pendingWork, 0)

const mediaCalls = []
const media = { duration: 1, currentTime: 0, muted: false, play() { mediaCalls.push('play'); return Promise.resolve() }, pause() { mediaCalls.push('pause') } }
const animationCalls = []
const animation = { currentTime: 1000, play() { animationCalls.push('play') }, pause() { animationCalls.push('pause') } }
const native = createFixture({ media: [media], animations: [animation] })
assert.equal(media.muted, false)
assert.equal(media.currentTime, 0)
assert.equal(animation.currentTime, 0)
native.controller.command('seek', 2)
assert.equal(media.currentTime, 1, 'short audio is clamped to its native duration')
assert.equal(animation.currentTime, 2000)
native.controller.command('play')
native.advance(1200)
assert.equal(native.status.currentTime, 3.2, 'short or looping audio does not shorten the visual timeline')
native.controller.command('pause')
assert.equal(mediaCalls.at(-1), 'pause')
assert.equal(animationCalls.at(-1), 'pause')
native.controller.dispose()

const broken = createFixture({ apiFactory: () => ({ seek() {} }) })
assert.match(broken.status.error, /播放接口不完整/)
assert.equal(broken.status.ready, false)
broken.controller.dispose()
const unsupported = createFixture()
unsupported.advance(1500)
assert.match(unsupported.status.error, /缺少 CowartFilm/)
assert.equal(unsupported.status.ready, false, 'unsupported JavaScript films must show a useful failure')
unsupported.controller.dispose()
let rejectedPlaybackRunning = false
const rejection = createFixture({ apiFactory: () => ({ seek() {}, play() { rejectedPlaybackRunning = true; return Promise.reject(new Error('Audio gesture denied')) }, pause() { rejectedPlaybackRunning = false }, setMuted() {} }) })
rejection.controller.command('play')
await Promise.resolve()
assert.equal(rejection.status.playing, false)
assert.equal(rejection.status.error, 'Audio gesture denied')
assert.equal(rejectedPlaybackRunning, false, 'audio rejection must stop the film itself, not only its toolbar clock')
rejection.controller.dispose()

console.log('OK: Film API, gestures, timeline, seek/replay/mute, message isolation, native fallback and lifecycle probes passed.')
