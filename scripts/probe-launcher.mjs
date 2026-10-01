import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, realpath, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { resolveDocumentsDir } from '../mcp/lib/project-launcher.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const sandbox = await realpath(await mkdtemp(join(tmpdir(), 'cowart-launcher-probe-')))
const projectDir = join(sandbox, '项目 with spaces')
const customCanvasDir = join(sandbox, 'custom-canvas')
const documentsDir = join(sandbox, '文稿 Documents')
const globalTarget = { projectDir: join(documentsDir, 'Cowart'), canvasDir: join(documentsDir, 'Cowart', 'canvas') }
const codexDir = join(sandbox, 'codex')
const pluginCache = join(codexDir, 'plugins', 'cache', 'cowart', 'test')
const client = new Client({ name: 'cowart-launcher-probe', version: '1.0.0' })
const call = (name, args = {}) => client.callTool({ name, arguments: args })
const pages = (snapshot) => Object.values(snapshot.store).filter((record) => record.typeName === 'page')
const openerName = 'render_cowart_canvas_widget'

try {
  assert.equal(await resolveDocumentsDir({ systemPlatform: 'darwin', userHome: '/Users/test', env: {} }), '/Users/test/Documents')
  const redirected = 'D:\\OneDrive - Example\\文档'
  let windowsCalls = 0
  assert.equal(await resolveDocumentsDir({ systemPlatform: 'win32', env: {}, run: async (command, args, options) => {
    windowsCalls++
    assert.equal(command, 'powershell.exe')
    assert.match(args.at(-1), /SpecialFolder\]::MyDocuments/)
    assert.equal(options.encoding, 'utf8')
    return { stdout: `${redirected}\r\n` }
  } }), redirected)
  assert.equal(windowsCalls, 1)
  await assert.rejects(resolveDocumentsDir({ systemPlatform: 'win32', env: {}, run: async () => ({ stdout: '' }) }), /无法读取系统文稿/)
  await assert.rejects(resolveDocumentsDir({ systemPlatform: 'win32', env: {}, run: async () => { throw new Error('unavailable') } }), /无法读取系统文稿/)
  await assert.rejects(resolveDocumentsDir({ env: { COWART_DOCUMENTS_DIR: '.' } }), /absolute path/)

  await mkdir(projectDir)
  await mkdir(pluginCache, { recursive: true })
  await client.connect(new StdioClientTransport({
    command: process.execPath, args: ['./scripts/start-mcp.mjs'], cwd: root,
    env: { ...process.env, COWART_PLUGIN_ROOT: root, COWART_DOCUMENTS_DIR: documentsDir,
      CODEX_HOME: codexDir, COWART_PROJECT_DIR: pluginCache, COWART_CANVAS_DIR: pluginCache }
  }))
  const { tools } = await client.listTools()
  const opener = tools.find((tool) => tool.name === openerName)
  assert.deepEqual(opener._meta['openai/ui'].entrypoints, [{ type: 'global' }])
  assert.equal(opener.title, 'Cowart')
  assert.match(client.getServerVersion().icons[0].src, /^data:image\/svg\+xml;base64,/)
  assert.ok(!tools.some((tool) => tool.name === 'open_cowart_project'), 'No folder picker API remains')

  // Existing project entrypoint neither initializes nor depends on Documents.
  const direct = await call(openerName, { projectDir })
  assert.equal(direct.structuredContent.projectDir, projectDir)
  assert.equal(direct.structuredContent.canvasDir, join(projectDir, 'canvas'))
  assert.equal(direct.structuredContent.globalWorkspace, undefined)
  assert.equal(direct.structuredContent.canvasState.snapshot, null)
  assert.deepEqual(direct.structuredContent.canvasState.viewState.camera, { x: 0, y: 0, z: 1 })
  await assert.rejects(stat(documentsDir), { code: 'ENOENT' })

  await writeFile(documentsDir, 'Documents is unavailable')
  assert.equal((await call(openerName)).isError, true, 'Do not silently fall back to the plugin or chat cwd')
  assert.notEqual((await call(openerName, { projectDir })).isError, true, 'Project route works even when Documents cannot be opened')
  await rm(documentsDir)

  const initial = await call(openerName)
  assert.equal(initial.isError, undefined)
  const payload = initial.structuredContent
  assert.equal(payload.view, 'canvas')
  assert.equal(payload.projectDir, globalTarget.projectDir)
  assert.equal(payload.canvasDir, globalTarget.canvasDir)
  assert.equal(payload.globalWorkspace, true)
  assert.equal(payload.canvasState.storage, 'per-page')
  const initialPages = pages(payload.canvasState.snapshot)
  assert.equal(initialPages.length, 1)
  const manifestPath = join(globalTarget.canvasDir, 'pages', 'manifest.json')
  const originalManifest = await readFile(manifestPath, 'utf8')
  assert.equal(JSON.parse(originalManifest).pages.length, 1, 'The first page is persisted before the UI opens')
  await assert.rejects(stat(join(pluginCache, 'canvas')), { code: 'ENOENT' })
  const reopened = (await call(openerName)).structuredContent
  assert.deepEqual(reopened.canvasState.snapshot, payload.canvasState.snapshot)
  assert.equal(await readFile(manifestPath, 'utf8'), originalManifest)

  // Multiple pages and the selected page/camera survive a global reopen.
  const snapshot = structuredClone(payload.canvasState.snapshot)
  const secondPage = { ...initialPages[0], id: 'page:second', name: 'Second page', index: 'a2' }
  snapshot.store[secondPage.id] = secondPage
  assert.notEqual((await call('save_cowart_canvas_state', { ...globalTarget, snapshot })).isError, true)
  const viewState = { version: 1, currentPageId: secondPage.id, camera: { x: 12, y: 24, z: 2 }, updatedAt: null }
  await call('save_cowart_view_state', { ...globalTarget, viewState })
  const multiPage = (await call(openerName)).structuredContent.canvasState
  assert.equal(pages(multiPage.snapshot).length, 2)
  assert.equal(multiPage.viewState.currentPageId, secondPage.id)
  assert.deepEqual(multiPage.viewState.camera, viewState.camera)

  // Explicit custom paths remain supported by tools, without a picker UI.
  const explicit = await call(openerName, { projectDir, canvasDir: customCanvasDir })
  assert.equal(explicit.structuredContent.canvasDir, customCanvasDir)
  assert.equal(explicit.structuredContent.canvasState.snapshot, null)
  await call('save_cowart_canvas_state', { projectDir, canvasDir: customCanvasDir, snapshot })
  await call('save_cowart_view_state', { projectDir, canvasDir: customCanvasDir, viewState })
  const projectReopen = (await call(openerName, { projectDir, canvasDir: customCanvasDir })).structuredContent
  assert.deepEqual(projectReopen.canvasState.snapshot, multiPage.snapshot)
  assert.deepEqual(projectReopen.canvasState.viewState.camera, viewState.camera)
  assert.deepEqual((await call(openerName)).structuredContent.canvasState, multiPage, 'Project operations do not change the sidebar canvas')

  for (const args of [{ projectDir: '.' }, { projectDir: join(sandbox, 'missing') }, { projectDir: pluginCache }]) {
    assert.equal((await call(openerName, args)).isError, true)
  }
  const linkedProject = join(sandbox, 'linked-cache')
  await symlink(pluginCache, linkedProject, process.platform === 'win32' ? 'junction' : 'dir')
  assert.equal((await call(openerName, { projectDir: linkedProject })).isError, true)
  await symlink(pluginCache, join(projectDir, 'canvas'), process.platform === 'win32' ? 'junction' : 'dir')
  assert.equal((await call(openerName, { projectDir })).isError, true)
  await rm(join(projectDir, 'canvas'))
  await assert.rejects(stat(join(pluginCache, 'cowart-view-state.json')), { code: 'ENOENT' })
  const htmlResource = await client.readResource({ uri: opener._meta.ui.resourceUri })
  assert.deepEqual(htmlResource.contents[0]._meta['openai/ui'], {
    availableDisplayModes: ['fullscreen'], preferredDisplayMode: 'fullscreen'
  })
  assert.ok(!htmlResource.contents[0].text.includes('cowart-project-path'))
  console.log('OK: Documents launch, first-page persistence, multiple pages, project isolation, Windows path resolution, cache protection and fullscreen resource.')
} finally {
  await client.close()
  await rm(sandbox, { recursive: true, force: true })
}
