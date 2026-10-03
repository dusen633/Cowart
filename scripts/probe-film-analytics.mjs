import assert from 'node:assert/strict'
import { filmAnalyticsContext, filmAnalyticsParameters, withFilmExportAnalytics } from '../src/filmAnalytics.js'

const shape = {
  id: 'private-shape-id',
  meta: { cowartFilmStyle: 'kinetic-type', cowartFilmDuration: 24, cowartFilmMuted: true },
  props: { w: 640, h: 360, html: 'private HTML' }
}
const parameters = filmAnalyticsContext(shape)
assert.deepEqual(filmAnalyticsParameters({ ...parameters, prompt: 'private prompt', shapeId: shape.id }), {
  film_style: 'kinetic-type', film_duration: 24, film_muted: 'yes', film_width: 640, film_height: 360
})
assert.deepEqual(filmAnalyticsParameters({ filmStyle: 'private text', filmDuration: Infinity, filmWidth: -1,
  filmHeight: 20000, filmMuted: 'true' }), {})

// Rendering can finish before an asynchronous host download does. Do not count
// an export until the full exporter promise (including download) succeeds.
const events = []
let finishDownload
const download = new Promise((resolve) => { finishDownload = resolve })
const result = withFilmExportAnalytics(() => download, parameters, (event) => events.push(event.stage))
await Promise.resolve()
assert.deepEqual(events, ['started'])
finishDownload({ fileName: 'private-file.mp4' })
assert.deepEqual(await result, { fileName: 'private-file.mp4' })
assert.deepEqual(events, ['started', 'succeeded'])

for (const cancel of [false, true]) {
  events.length = 0
  const controller = new AbortController()
  const failure = new Error('private file path and error details')
  await assert.rejects(withFilmExportAnalytics(async () => {
    if (cancel) controller.abort()
    throw failure
  }, parameters, (event) => events.push(event.stage), controller.signal), (error) => error === failure)
  assert.deepEqual(events, ['started', cancel ? 'cancelled' : 'failed'])
}
assert.equal(await withFilmExportAnalytics(() => 'downloaded', parameters, () => { throw new Error('offline') }), 'downloaded')

console.log('Cowart film metadata, download completion, failure and cancellation analytics probe OK')

// Native insertion uses the same anonymous client as that canvas's widget.
const { createFilmInsertionAnalytics } = await import('../mcp/lib/film-analytics.mjs')
const ga4 = [], posthog = []
const insertion = createFilmInsertionAnalytics({
  sendGa4(event) { ga4.push(event); throw new Error('GA4 unavailable') },
  sendPosthog(event) { posthog.push(event); return { delivered: true } }
})
const savedFilm = { isFilm: true, dryRun: false, film: shape.meta, bounds: { w: 640, h: 360 },
  shapeId: 'private-shape', assetFile: '/private/film.html' }
assert.equal(await insertion.track('/canvas/A', savedFilm), false)
insertion.remember('/canvas/A', { clientId: '1.2', appVersion: 'test-version' })
insertion.remember('/canvas/B', { clientId: '3.4', appVersion: 'test-version' })
assert.equal(await insertion.track('/canvas/A', { ...savedFilm, dryRun: true }), false)
assert.equal(await insertion.track('/canvas/A', { ...savedFilm, isFilm: false }), false)
assert.equal(await insertion.track('/canvas/A', savedFilm), true)
assert.equal(posthog[0].clientId, '1.2')
assert.equal(posthog[0].eventName, 'ai_film_inserted')
assert.equal(posthog[0].eventId, ga4[0].eventId)
assert.equal(posthog[0].parameters.completion_status, 'local_saved')
assert.equal(JSON.stringify(posthog[0]).includes('private'), false)
assert.equal(await insertion.track('/canvas/B', savedFilm), true)
assert.equal(posthog[1].clientId, '3.4')
assert.notEqual(posthog[0].eventId, posthog[1].eventId)
console.log('Cowart native film insertion attribution, dry run and provider isolation probe OK')
