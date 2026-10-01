import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { setImmediate as flush } from 'node:timers/promises'
import test from 'node:test'
import vm from 'node:vm'

// Run the real mount callback with a controlled editor, bridge and clock. This
// covers background work over long sessions without launching a development UI.
const source = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8')
const marker = '  const handleMount = useCallback('
const start = source.indexOf(marker) + marker.length
const end = source.indexOf('  }, [viewState])', start)
assert.ok(start >= marker.length && end > start, 'Cannot find the canvas mount callback')
const mount = new vm.Script(`(${source.slice(start, end)}  })`)

function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

function fixture() {
  let now = 0, nextId = 0
  const timers = new Map(), ownedTimers = new Set()
  const calls = { selection: [], view: [], refresh: [], dom: [], applied: [], errors: [] }
  const state = {
    selection: { selectedShapes: [] },
    view: { version: 1, currentPageId: 'page:one', camera: { x: 0, y: 0, z: 1 } },
    saveSelection: async () => {}, saveView: async () => {}, refresh: async () => ({ store: {} })
  }
  const noOp = () => {}
  function timer(callback, delay, interval = 0) {
    const id = ++nextId
    timers.set(id, { callback, at: now + delay, interval })
    return id
  }
  const window = {
    setTimeout: (callback, delay) => timer(callback, delay), clearTimeout: (id) => timers.delete(id),
    setInterval: (callback, delay) => timer(callback, delay, delay), clearInterval: (id) => timers.delete(id)
  }
  const doc = { addEventListener: noOp, removeEventListener: noOp, getElementById: () => ({ remove: noOp }) }
  const editor = {
    timers: {
      requestAnimationFrame: noOp,
      setTimeout(callback, delay) { const id = timer(callback, delay); ownedTimers.add(id); return id }
    },
    inputs: { getIsDragging: () => false }, run: (callback) => callback(),
    on: noOp, off: noOp, getContainerDocument: () => doc,
    sideEffects: { registerBeforeCreateHandler: () => noOp, registerOperationCompleteHandler: () => noOp },
    store: { listen: () => noOp, getStoreSnapshot: () => ({ store: {} }) }
  }
  class ClockDate extends Date { constructor() { super(now) } }
  const disposeMount = mount.runInNewContext({
    window, document: doc, Date: ClockDate, AbortController, viewState: null,
    console: { error: (error) => calls.errors.push(error), warn: noOp },
    SELECTION_STATE_ELEMENT_ID: 'selection-state',
    reportCowartStartup: noOp, trackCanvasOpened: noOp, restoreCowartViewState: noOp,
    getCowartSelectionSnapshot: () => structuredClone(state.selection),
    getCowartViewState: () => structuredClone(state.view),
    writeCowartSelectionState: (snapshot) => calls.dom.push(snapshot),
    saveCowartSelectionState: (snapshot) => { calls.selection.push(snapshot); return state.saveSelection(snapshot) },
    saveCowartViewState: (snapshot) => { calls.view.push(snapshot); return state.saveView(snapshot) },
    refreshCowartCanvasSnapshot: (signal) => { calls.refresh.push(signal); return state.refresh(signal) },
    applyRemoteCanvasSnapshot: (_editor, snapshot) => { calls.applied.push(snapshot); return { changedRecords: 0 } },
    storeChangedSinceSnapshot: () => false, hasCowartWidgetBridge: () => true,
    normalizeAiDraftHolderLabels: noOp, adoptGeneratedAiSlidesItems: noOp, layoutAllAiSlides: noOp
  })(editor)
  return {
    state, calls,
    async advance(ms) {
      const target = now + ms
      await flush()
      for (;;) {
        const next = [...timers].filter(([, task]) => task.at <= target).sort((a, b) => a[1].at - b[1].at)[0]
        if (!next) break
        const [id, task] = next
        now = task.at
        if (task.interval) task.at += task.interval
        else timers.delete(id)
        task.callback()
        await flush()
      }
      now = target
    },
    dispose() { disposeMount(); for (const id of ownedTimers) timers.delete(id) },
    get pendingTimers() { return timers.size }
  }
}

test('30 minutes idle saves each state once and leaves selection DOM untouched', async () => {
  const f = fixture()
  await f.advance(30 * 60 * 1000)
  assert.equal(f.calls.view.length, 1, 'Timestamps must not make an unchanged camera dirty')
  assert.equal(f.calls.selection.length, 1)
  assert.equal(f.calls.dom.length, 1, 'Unchanged selection must not rewrite the DOM every 250ms')
  assert.equal(f.calls.refresh.length, 1125, 'Remote updates must continue to reach an idle canvas')
  assert.equal(f.calls.errors.length, 0)
  f.dispose()
  await f.advance(10000)
  assert.equal(f.pendingTimers, 0)
  assert.equal(f.calls.view.length, 1)
  assert.equal(f.calls.refresh.length, 1125)
})

test('page, camera and selection changes save their new values exactly once', async () => {
  const f = fixture()
  await f.advance(500)
  f.state.view.camera.x = 100
  f.state.selection.selectedShapes = [{ id: 'shape:one' }]
  await f.advance(1000)
  assert.equal(f.calls.view.length, 2)
  assert.equal(f.calls.view.at(-1).camera.x, 100)
  assert.equal(f.calls.selection.length, 2)
  assert.equal(f.calls.dom.length, 2)
  f.state.view.currentPageId = 'page:two'
  await f.advance(1000)
  assert.equal(f.calls.view.length, 3)
  assert.equal(f.calls.view.at(-1).currentPageId, 'page:two')
  assert.ok(f.calls.view.every((call) => typeof call.updatedAt === 'string'))
  f.dispose()
})

test('slow saves coalesce rapid edits and persist the latest state', async () => {
  const f = fixture()
  await f.advance(500)
  const view = deferred(), selection = deferred()
  f.state.saveView = () => view.promise
  f.state.saveSelection = () => selection.promise
  f.state.view.camera.x = 1
  f.state.selection.selectedShapes = [{ id: 'shape:first' }]
  await f.advance(500)
  f.state.view.camera.x = 2
  f.state.selection.selectedShapes = [{ id: 'shape:latest' }]
  await f.advance(1000)
  assert.equal(f.calls.view.length, 2)
  assert.equal(f.calls.selection.length, 2)
  f.state.saveView = f.state.saveSelection = async () => {}
  view.resolve(); selection.resolve()
  await flush()
  assert.equal(f.calls.view.length, 3)
  assert.equal(f.calls.view.at(-1).camera.x, 2)
  assert.equal(f.calls.selection.length, 3)
  assert.equal(f.calls.selection.at(-1).selectedShapes[0].id, 'shape:latest')
  await f.advance(1000)
  assert.equal(f.calls.view.length, 3)
  assert.equal(f.calls.selection.length, 3)
  f.dispose()
})

test('failed saves remain dirty and retry on the next tick', async () => {
  const f = fixture()
  await f.advance(500)
  f.state.view.camera.x = 5
  f.state.selection.selectedShapes = [{ id: 'shape:retry' }]
  f.state.saveView = f.state.saveSelection = async () => { throw new Error('Temporary bridge failure') }
  await f.advance(500)
  assert.equal(f.calls.errors.length, 3)
  f.state.saveView = f.state.saveSelection = async () => {}
  await f.advance(1000)
  assert.equal(f.calls.view.length, 3)
  assert.equal(f.calls.selection.length, 4)
  assert.equal(f.calls.dom.length, 2, 'Retries must not churn selection DOM')
  f.dispose()
})

test('slow canvas refresh stays single flight and resumes after completion', async () => {
  const f = fixture(), refresh = deferred()
  f.state.refresh = () => refresh.promise
  await f.advance(10000)
  assert.equal(f.calls.refresh.length, 1)
  assert.equal(f.calls.refresh[0].aborted, false)
  f.state.refresh = async () => ({ store: {} })
  refresh.resolve({ store: {} })
  await flush()
  await f.advance(1200)
  assert.equal(f.calls.refresh.length, 2)
  assert.equal(f.calls.applied.length, 2)
  f.dispose()
})

test('unmount aborts a pending refresh and discards a late response', async () => {
  const f = fixture(), refresh = deferred()
  f.state.refresh = () => refresh.promise
  await f.advance(2000)
  f.dispose()
  assert.equal(f.calls.refresh[0].aborted, true)
  refresh.resolve({ store: {} })
  await flush()
  await f.advance(10000)
  assert.equal(f.calls.applied.length, 0)
  assert.equal(f.calls.refresh.length, 1)
  assert.equal(f.pendingTimers, 0)
})
