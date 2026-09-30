import assert from 'node:assert/strict'
import { getEventListeners } from 'node:events'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { setImmediate as flush } from 'node:timers/promises'
import vm from 'node:vm'
import test from 'node:test'
import { build } from 'esbuild'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const root = fileURLToPath(new URL('../', import.meta.url))
const { version } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const client = new Client({ name: 'cowart-startup-probe', version: '1.0.0' })
let html
try {
  await client.connect(new StdioClientTransport({
    command: process.execPath,
    args: ['./scripts/start-mcp.mjs'],
    cwd: root,
    env: { ...process.env, COWART_PLUGIN_ROOT: root }
  }))
  const resource = await client.readResource({ uri: 'ui://widget/cowart/canvas.html' })
  html = resource.contents[0].text
} finally {
  await client.close()
}

// Exercise the bootstrap/bridge served by the release bundle, not a copied script.
const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
for (const [, , source] of scripts) new vm.Script(source)
assert.match(scripts[0][1], /cowartStartupDiagnostics/)
const script = (id) => {
  const match = scripts.find(([, attrs]) => attrs.includes(`id="${id}"`))
  assert.ok(match, `Missing widget script: ${id}`)
  return new vm.Script(match[2])
}
const bootstrap = script('cowartStartupDiagnostics')
const bridge = script('cowartMcpHostBridge')
const clientBundle = await build({
  absWorkingDir: root,
  entryPoints: ['src/cowartClient.js'],
  bundle: true,
  format: 'iife',
  globalName: 'cowartClient',
  write: false,
  logLevel: 'silent'
})
const clientScript = new vm.Script(clientBundle.outputFiles[0].text)

function harness({ missingSdk = false, constructorError = false, toolError = false } = {}) {
  const window = new EventTarget()
  const calls = []
  const logs = []
  const timers = new Map()
  let now = 0
  let nextTimer = 0
  const setTimeout = (callback, ms) => {
    const id = ++nextTimer
    timers.set(id, { callback, at: now + ms })
    return id
  }
  const clearTimeout = (id) => timers.delete(id)
  Object.assign(window, { setTimeout, clearTimeout, openai: {}, innerWidth: 800 })
  let resolveConnect, rejectConnect
  const connection = new Promise((resolve, reject) => {
    resolveConnect = resolve
    rejectConnect = reject
  })
  class FakeApp {
    handlers = new Map()
    constructor() {
      if (constructorError) throw new Error('private constructor details')
    }
    addEventListener(event, handler) { this.handlers.set(event, handler) }
    connect() { return connection }
    getHostCapabilities() { return { serverTools: {} } }
    getHostVersion() { return { name: 'test-host', version: '1' } }
    getHostContext() { return { theme: 'light', displayMode: 'inline' } }
    sendSizeChanged() {}
    async callServerTool(request) {
      calls.push(request)
      if (toolError) return { isError: true, content: [{ type: 'text', text: 'private tool failure' }] }
      return { structuredContent: { snapshot: null, viewState: null, storage: 'empty' } }
    }
  }
  const context = vm.createContext({
    window, setTimeout, clearTimeout, CustomEvent, DOMException,
    document: { documentElement: { scrollHeight: 600, offsetHeight: 600 }, body: null },
    console: {
      warn: (line) => logs.push({ level: 'warn', line }),
      error: (line) => logs.push({ level: 'error', line })
    }
  })
  bootstrap.runInContext(context)
  if (!missingSdk) context.__COWART_MCP_APPS__ = { App: FakeApp }
  bridge.runInContext(context)
  clientScript.runInContext(context)

  return {
    window, calls, logs, timers, context,
    stages: () => Array.from(context.__COWART_STARTUP__.events, ({ stage }) => stage),
    load: (signal) => context.cowartClient.loadCowartCanvasState(signal),
    async ready() {
      resolveConnect()
      await context.__COWART_MCP_APP__.ready
    },
    async failConnection() {
      rejectConnect(new Error('private connection details'))
      await context.__COWART_MCP_APP__.ready
    },
    result(payload) {
      context.__COWART_MCP_APP__.handlers.get('toolresult')({ structuredContent: payload })
    },
    globals() {
      context.__COWART_MCP_APP__.handlers.get('hostcontextchanged')({ theme: 'dark' })
    },
    async advance(ms) {
      await flush()
      now += ms
      for (const [id, timer] of [...timers]) {
        if (timer.at <= now) {
          timers.delete(id)
          timer.callback()
        }
      }
      await flush()
    },
    assertClean() {
      assert.equal(getEventListeners(window, 'openai:set_globals').length, 0)
      assert.equal(timers.size, 0)
    }
  }
}

test('host readiness and unrelated globals before the project still load the canvas', async () => {
  const h = harness()
  const loaded = h.load()
  const result = loaded.then((value) => ({ value }), (error) => ({ error }))
  await h.ready()
  h.globals()
  h.result({ title: 'Still waiting for the storage target' })
  assert.equal(h.calls.length, 0)
  const projectDir = 'C:\\Cowart startup probe\\project'
  h.result({ projectDir })
  await h.advance(5000)
  const outcome = await result
  assert.equal(outcome.error, undefined)
  assert.equal(outcome.value.storage, 'empty')
  assert.equal(h.calls.length, 1)
  assert.equal(h.calls[0].name, 'get_cowart_canvas_state')
  assert.equal(h.calls[0].arguments.projectDir, projectDir)
  assert.equal(h.calls[0].arguments.hydrateAssets, false)
  assert.ok(h.stages().includes('canvas_state_loaded'))
  assert.ok(!h.stages().includes('storage_target_timeout'))
  h.assertClean()
})

test('a project already supplied before loading does not wait for another notification', async () => {
  const h = harness()
  h.result({ projectDir: '/startup-probe/project' })
  await h.ready()
  await h.load()
  assert.equal(h.calls.length, 1)
  assert.ok(!h.stages().includes('storage_waiting'))
  h.assertClean()
})

test('a late canvasDir alone is a valid storage target', async () => {
  const h = harness()
  await h.ready()
  const loaded = h.load()
  h.globals()
  h.result({ canvasDir: '/startup-probe/custom-canvas' })
  await loaded
  assert.equal(h.calls[0].arguments.canvasDir, '/startup-probe/custom-canvas')
  assert.equal(h.calls[0].arguments.projectDir, undefined)
  h.assertClean()
})

test('missing targets time out without making tool calls and remove listeners', async () => {
  const h = harness()
  await h.ready()
  const rejected = assert.rejects(h.load(), /storage target was not ready/)
  h.globals()
  await h.advance(5000)
  await rejected
  h.result({ projectDir: '/too-late' })
  assert.equal(h.calls.length, 0)
  assert.ok(h.stages().includes('storage_target_timeout'))
  assert.ok(h.stages().includes('canvas_load_failed'))
  h.assertClean()
})

test('aborting one pending mount does not break the next mount', async () => {
  const h = harness()
  await h.ready()
  const controller = new AbortController()
  const rejected = assert.rejects(h.load(controller.signal), { name: 'AbortError' })
  const loaded = h.load()
  controller.abort()
  h.globals()
  h.result({ projectDir: '/startup-probe/project' })
  await Promise.all([rejected, loaded])
  assert.equal(getEventListeners(controller.signal, 'abort').length, 0)
  assert.equal(h.calls.length, 1)
  assert.ok(!h.stages().includes('canvas_load_failed'))
  h.assertClean()
})

test('an already aborted load never calls the server', async () => {
  const h = harness()
  await h.ready()
  await assert.rejects(h.load(AbortSignal.abort()), { name: 'AbortError' })
  h.result({ projectDir: '/startup-probe/project' })
  await assert.rejects(h.load(AbortSignal.abort()), { name: 'AbortError' })
  assert.equal(h.calls.length, 0)
  h.assertClean()
})

test('a stalled bridge logs a timeout and can still connect later', async () => {
  const h = harness()
  await h.advance(5000)
  assert.ok(h.stages().includes('bridge_timeout'))
  await h.ready()
  h.result({ projectDir: '/startup-probe/project' })
  await h.load()
  assert.ok(h.stages().includes('bridge_ready'))
  h.assertClean()
})

test('bridge rejection and synchronous initialization failure are logged', async () => {
  const h = harness()
  await h.failConnection()
  h.result({ projectDir: '/startup-probe/project' })
  await assert.rejects(h.load(), /private connection details/)
  assert.ok(h.stages().includes('bridge_failed'))
  assert.equal(h.calls.length, 0)
  assert.ok(h.logs.every(({ line }) => !line.includes('private')))
  h.assertClean()
  const sync = harness({ constructorError: true })
  assert.ok(sync.stages().includes('bridge_failed'))
  sync.assertClean()
})

test('SDK absence, script errors and rejected promises are observable without private details', () => {
  const h = harness({ missingSdk: true })
  assert.deepEqual(h.stages(), ['html_loaded', 'sdk_missing'])
  for (const type of ['error', 'unhandledrejection']) {
    h.window.dispatchEvent(Object.assign(new Event(type), { message: 'private path', reason: 'private token' }))
  }
  assert.ok(h.stages().includes('script_error'))
  assert.ok(h.stages().includes('unhandled_rejection'))
  assert.ok(h.logs.every(({ line }) => !line.includes('private')))
  h.assertClean()
})

test('tool failures log a stage without copying the error payload', async () => {
  const h = harness({ toolError: true })
  await h.ready()
  h.result({ projectDir: '/startup-probe/project' })
  await assert.rejects(h.load(), /private tool failure/)
  assert.ok(h.stages().includes('canvas_load_failed'))
  assert.ok(h.logs.every(({ line }) => !line.includes('private')))
  h.assertClean()
})

test('diagnostics have the release version, deduplicate stages and stop after mounting', async () => {
  const h = harness()
  await h.ready()
  h.result({ projectDir: '/private/project', prompt: 'private prompt' })
  await h.load()
  h.result({ projectDir: '/private/project' })
  h.context.__COWART_REPORT_STARTUP__('private path is not a valid stage')
  assert.equal(h.stages().filter((stage) => stage === 'tool_result_received').length, 1)
  assert.ok(h.logs.every(({ line }) => line.includes(`version=${version} `) && !line.includes('private')))
  h.context.__COWART_REPORT_STARTUP__('canvas_mounted')
  const count = h.logs.length
  h.result({ projectDir: '/private/project' })
  h.window.dispatchEvent(new Event('error'))
  assert.equal(h.logs.length, count)
  assert.equal(getEventListeners(h.window, 'error').length, 0)
  assert.equal(getEventListeners(h.window, 'unhandledrejection').length, 0)
  h.assertClean()
})
