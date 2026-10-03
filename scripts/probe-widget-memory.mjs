import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { setImmediate as flush } from 'node:timers/promises'
import test from 'node:test'
import vm from 'node:vm'
import { cowartBlobFromBase64, createCowartAssetObjectUrlCache } from '../src/cowartAssetCache.js'

const source = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8')
function appFunctions(startMarker, endMarker, context) {
  const start = source.indexOf(startMarker), end = source.indexOf(endMarker, start)
  assert.ok(start >= 0 && end > start, `Missing App helper: ${startMarker}`)
  return new vm.Script(source.slice(start, end)).runInNewContext(context)
}
function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
function asset(name, fileSize = 12) {
  return { id: `asset:${name}`, typeName: 'asset', props: {
    src: `/page-assets/page/${name}.png`, name: `${name}.png`, fileSize, mimeType: 'image/png'
  } }
}
function fixture(load = async () => new Blob(['image'])) {
  const loaded = [], created = [], revoked = [], live = new Set()
  const cache = createCowartAssetObjectUrlCache({
    load(record, signal) { loaded.push({ record, signal }); return load(record, signal) },
    createObjectURL(blob) {
      const url = `blob:cowart-${created.length}`
      created.push({ url, blob }); live.add(url); return url
    },
    revokeObjectURL(url) { revoked.push(url); live.delete(url) }
  })
  return { cache, loaded, created, revoked, live }
}

test('concurrent shapes and exports share one pending asset read and Blob URL', async () => {
  const reading = deferred(), f = fixture(() => reading.promise), image = asset('shared')
  const requests = Array.from({ length: 64 }, () => f.cache.resolve(image))
  await flush()
  assert.equal(f.loaded.length, 1)
  reading.resolve(new Blob(['image']))
  const urls = await Promise.all(requests)
  assert.equal(new Set(urls).size, 1)
  assert.equal(f.created.length, 1)
  assert.equal(await f.cache.resolve(structuredClone(image)), urls[0])
  assert.equal(f.loaded.length, 1)
  f.cache.clear()
  assert.equal(f.live.size, 0)
  assert.deepEqual(f.revoked, urls.slice(0, 1))
})

test('many images keep at most two full MCP asset reads in flight', async () => {
  const pending = [], f = fixture(() => {
    const reading = deferred(); pending.push(reading); return reading.promise
  })
  const requests = Array.from({ length: 12 }, (_, index) => f.cache.resolve(asset(`image-${index}`)))
  await flush()
  assert.equal(f.loaded.length, 2)
  for (let completed = 0; completed < requests.length; completed += 2) {
    assert.equal(f.loaded.length, Math.min(completed + 2, requests.length))
    pending[completed].resolve(new Blob(['one']))
    pending[completed + 1].resolve(new Blob(['two']))
    await flush()
  }
  await Promise.all(requests)
  f.cache.clear()
  assert.equal(f.live.size, 0)
})

test('page removal cancels pending work and a late response never creates a URL', async () => {
  const reading = deferred(), f = fixture(() => reading.promise)
  const stale = f.cache.resolve(asset('removed'))
  await flush()
  f.cache.retain([])
  assert.equal(f.loaded[0].signal.aborted, true)
  assert.equal(await stale, null)
  reading.resolve(new Blob(['old page']))
  await flush()
  assert.equal(f.created.length, 0)
  assert.equal(f.live.size, 0)
})

test('updated file wins over a late read of the same source', async () => {
  const old = deferred(), current = deferred()
  const f = fixture((record) => record.props.fileSize === 12 ? old.promise : current.promise)
  const stale = f.cache.resolve(asset('replaced', 12))
  await flush()
  const latest = f.cache.resolve(asset('replaced', 24))
  await flush()
  assert.equal(await stale, null)
  assert.equal(f.loaded[0].signal.aborted, true)
  old.resolve(new Blob(['old']))
  current.resolve(new Blob(['new']))
  assert.equal(await latest, 'blob:cowart-0')
  await flush()
  assert.equal(f.created.length, 1)
  f.cache.clear()
  assert.equal(f.live.size, 0)
})

test('repeated page visits retain only assets in the current page and teardown releases all', async () => {
  const f = fixture()
  const context = { cowartAssetObjectUrlCache: f.cache }
  appFunctions('function retainCowartEditorAssets(', 'function cowartAssetReferencesChanged(', context)
  let pageAssets = []
  const editor = {
    getCurrentPageShapes: () => pageAssets.map((record) => ({ props: { assetId: record.id } })),
    getAsset: (id) => pageAssets.find((record) => record.id === id)
  }
  for (let page = 0; page < 60; page++) {
    pageAssets = Array.from({ length: 3 }, (_, index) => asset(`page-${page}-${index}`))
    context.retainCowartEditorAssets(editor)
    await Promise.all(pageAssets.map((record) => f.cache.resolve(record)))
    assert.equal(f.live.size, 3, 'Leaving a page must release its retained file payloads')
  }
  f.cache.clear()
  assert.equal(f.live.size, 0)
  assert.equal(f.revoked.length, f.created.length)
})

test('asset deletion, replacement and page switching trigger cache pruning', () => {
  const context = {}
  appFunctions('function cowartAssetReferencesChanged(', 'function blobFromBase64(', context)
  const changed = (added = {}, updated = {}, removed = {}) => context.cowartAssetReferencesChanged({ added, updated, removed })
  assert.equal(changed({}, {}, { image: { typeName: 'shape' } }), true)
  assert.equal(changed({}, { image: [{ typeName: 'shape', props: { assetId: 'a' } }, { typeName: 'shape', props: { assetId: 'b' } }] }), true)
  assert.equal(changed({}, { instance: [{ typeName: 'instance', currentPageId: 'one' }, { typeName: 'instance', currentPageId: 'two' }] }), true)
  assert.equal(changed({}, { shape: [{ typeName: 'shape', x: 1, props: {} }, { typeName: 'shape', x: 2, props: {} }] }), false)
})

test('failed reads can retry and canceled queued reads never reach the bridge', async () => {
  const reading = deferred(), f = fixture((record) => {
    if (record.props.name === 'retry.png' && f.loaded.length === 1) throw new Error('Temporary failure')
    return reading.promise
  })
  await assert.rejects(f.cache.resolve(asset('retry')), /Temporary failure/)
  const retry = f.cache.resolve(asset('retry'))
  const second = f.cache.resolve(asset('second'))
  const queued = f.cache.resolve(asset('queued'))
  await flush()
  assert.equal(f.loaded.length, 3)
  f.cache.clear()
  assert.equal(await queued, null)
  reading.resolve(new Blob(['loaded after close']))
  await Promise.all([retry, second])
  await flush()
  assert.equal(f.loaded.length, 3, 'A canceled queued asset must not make a host call')
  assert.equal(f.created.length, 0)
})

test('large base64 decodes in aligned bounded chunks and preserves exact bytes', async () => {
  const bytes = Buffer.alloc(100_003)
  for (let index = 0; index < bytes.length; index++) bytes[index] = index % 256
  const nativeAtob = globalThis.atob, sizes = []
  try {
    globalThis.atob = (value) => { sizes.push(value.length); return nativeAtob(value) }
    const blob = cowartBlobFromBase64(bytes.toString('base64'), 'image/png')
    assert.equal(blob.type, 'image/png')
    assert.deepEqual(Buffer.from(await blob.arrayBuffer()), bytes)
    assert.ok(sizes.length > 1)
    assert.ok(sizes.every((size) => size <= 32768), 'No complete binary-string allocation for a large payload')
  } finally { globalThis.atob = nativeAtob }
})

test('idle selection compares immutable records without serializing inline payloads', () => {
  const context = { JSON: { stringify() { throw new Error('Unexpected payload serialization') } } }
  appFunctions('function getCowartSelectionRecords(', 'function getCowartViewState(', context)
  let image = { id: 'asset:image', props: { src: 'data:image/png;base64,' + 'a'.repeat(2_000_000) } }
  let shape = { id: 'shape:one', props: { assetId: image.id, url: 'data:text/html;base64,' + 'a'.repeat(2_000_000) } }
  const editor = { getSelectedShapeIds: () => [shape.id], getShape: () => shape, getAsset: () => image }
  const initial = context.getCowartSelectionRecords(editor)
  for (let tick = 0; tick < 7200; tick++) {
    assert.equal(context.cowartSelectionRecordsEqual(initial, context.getCowartSelectionRecords(editor)), true)
  }
  shape = { ...shape, x: 10 }
  assert.equal(context.cowartSelectionRecordsEqual(initial, context.getCowartSelectionRecords(editor)), false)
  const moved = context.getCowartSelectionRecords(editor)
  image = { ...image, props: { ...image.props, name: 'changed.png' } }
  assert.equal(context.cowartSelectionRecordsEqual(moved, context.getCowartSelectionRecords(editor)), false)
})

test('HTML references read each local file once and construct a single hydrated document', async () => {
  const context = {
    hasCowartWidgetBridge: () => true,
    console: { warn() {} },
    readCowartPageAsset: async (url) => {
      calls.push(url)
      return { mimeType: 'image/png', dataBase64: url.includes('one') ? 'b25l' : 'dHdv' }
    }
  }
  const calls = []
  appFunctions('const COWART_HTML_DRAFT_LOCAL_IMAGE_PATTERN =', 'function isCowartHtmlDraftAssetUrl(', context)
  const html = '<img src="/page-assets/page/one.png"><img src="http://cowart.local/page-assets/page/one.png?v=1"><img src="/assets/two.png">'
  const result = await context.hydrateCowartHtmlDraftLocalImages(html)
  assert.deepEqual(calls, ['/page-assets/page/one.png', '/assets/two.png'])
  assert.equal(result, '<img src="data:image/png;base64,b25l"><img src="data:image/png;base64,b25l"><img src="data:image/png;base64,dHdv">')
})
