import assert from 'node:assert/strict'
import test from 'node:test'
import { quantizeFilmTime } from '../src/filmTimeline.js'
import { waitForFilmTask, waitForFilmAPI, seekFilmFrame } from '../src/filmFrameReady.js'
import { drawFittedVideo } from '../src/filmVideoFrames.js'
import { filmExportDimensions } from '../src/filmExportSize.js'

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

test('MP4 export doubles landscape, portrait and odd dimensions without a 1920 cap', () => {
  assert.deepEqual(filmExportDimensions(1024, 576), { width: 2048, height: 1152 })
  assert.deepEqual(filmExportDimensions(576, 1024), { width: 1152, height: 2048 })
  assert.deepEqual(filmExportDimensions(1023, 575), { width: 2046, height: 1150 })
  assert.deepEqual(filmExportDimensions(4000, 2000), { width: 8000, height: 4000 })
  assert.deepEqual(filmExportDimensions(320.25, 180.75), { width: 640, height: 362 })
  for (const size of [[0, 100], [-1, 100], [NaN, 100], [100, Infinity]]) {
    assert.throws(() => filmExportDimensions(...size), /影片尺寸无效/)
  }
})

test('2x embedded video preserves CSS object-fit and pixel offsets', () => {
  const calls = [], context = {}
  const sample = { displayWidth: 100, displayHeight: 50, draw: (...args) => calls.push(args) }
  const canvas = { width: 400, height: 200, getContext: () => context }
  drawFittedVideo(sample, canvas, { objectFit: 'none', objectPosition: '10px 5px' }, 2)
  assert.deepEqual(calls.pop(), [context, 20, 10, 200, 100])
  drawFittedVideo(sample, canvas, { objectFit: 'scale-down', objectPosition: '50% 50%' }, 2)
  assert.deepEqual(calls.pop(), [context, 100, 50, 200, 100])
  drawFittedVideo(sample, canvas, { objectFit: 'contain', objectPosition: '50% 50%' }, 2)
  assert.deepEqual(calls.pop(), [context, 0, 0, 400, 200])
})
