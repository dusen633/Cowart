import assert from 'node:assert/strict'
import test from 'node:test'
import { quantizeFilmTime } from '../src/filmTimeline.js'
import { waitForFilmTask, waitForFilmAPI, seekFilmFrame } from '../src/filmFrameReady.js'
import { drawFittedVideo } from '../src/filmVideoFrames.js'

test('preview/export timestamps share one frame grid and preserve a partial end', () => {
  assert.equal(quantizeFilmTime(0.0333333), quantizeFilmTime(0.0333334))
  assert.equal(quantizeFilmTime(-1, 1), 0)
  assert.equal(quantizeFilmTime(0.06, 0.05), 0.05)
  assert.throws(() => quantizeFilmTime(NaN))
})

test('async seek completes before paint/assets and receives a quantized timestamp', async () => {
  const calls = []
  const film = { duration: 1, async seek(time) {
    calls.push(['seek', time])
    await new Promise((resolve) => setTimeout(resolve, 10))
    calls.push('ready')
  } }
  const frame = {
    contentWindow: { __cowartSetExportTime: (time) => calls.push(['clock', time]), __cowartExportPaint: () => calls.push('paint') },
    contentDocument: { images: [], documentElement: { getBoundingClientRect: () => calls.push('layout') }, querySelectorAll: () => [] }
  }
  assert.equal(await seekFilmFrame(frame, film, 0.0999999), 0.1)
  assert.deepEqual(calls, [['clock', 0.1], ['seek', 0.1], 'ready', 'paint', 'layout'])
})

test('delayed API and readiness are awaited without relying on iframe RAF', async () => {
  const frame = {}
  let ready = false
  const api = { seek() {}, play() {}, pause() {}, setMuted() {}, ready: new Promise((resolve) => {
    setTimeout(() => { ready = true; resolve() }, 40)
  }) }
  setTimeout(() => { frame.CowartFilm = api }, 10)
  assert.equal(await waitForFilmAPI(frame), api)
  assert.equal(ready, true)
})

test('waiting assets/runtime can be canceled and hangs have a bounded deadline', async () => {
  const controller = new AbortController()
  const pending = waitForFilmTask(new Promise(() => {}), { signal: controller.signal })
  controller.abort()
  await assert.rejects(pending, { name: 'AbortError' })
  await assert.rejects(waitForFilmTask(new Promise(() => {}), { timeout: 10, label: '测试帧定位' }), /测试帧定位超时/)
  await assert.rejects(waitForFilmTask(() => { throw new Error('seek failure') }), /seek failure/)
})

test('embedded frame fitting retains contain/cover dimensions and crop position', () => {
  const calls = []
  const context = {}
  const sample = { displayWidth: 200, displayHeight: 100, draw: (...args) => calls.push(args) }
  const canvas = { width: 100, height: 100, getContext: () => context }
  drawFittedVideo(sample, canvas, { objectFit: 'contain', objectPosition: '50% 50%' })
  assert.deepEqual(calls.pop(), [context, 0, 25, 100, 50])
  drawFittedVideo(sample, canvas, { objectFit: 'cover', objectPosition: '100% 50%' })
  assert.deepEqual(calls.pop(), [context, -100, 0, 200, 100])
})
