import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { withCowartCanvasTransaction } from '../mcp/lib/canvas-storage.mjs'

// Synthetic temporary fixtures only. Exercise the same MCP protocol as the
// widget, including separate server processes sharing one project directory.
const root = fileURLToPath(new URL('../', import.meta.url))
const fixtureRoot = await mkdtemp(join(tmpdir(), 'cowart-integrity-'))
const projectDir = join(fixtureRoot, 'project')
const canvasDir = join(projectDir, 'canvas')
const clients = []
const args = { projectDir }
const server = process.argv.includes('--source') ? './mcp/server.mjs' : './scripts/start-mcp.mjs'

async function openClient() {
  const client = new Client({ name: 'cowart-integrity-probe', version: '1.0.0' })
  clients.push(client)
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [server], cwd: root,
    env: { ...process.env, COWART_PLUGIN_ROOT: root, COWART_DOCUMENTS_DIR: fixtureRoot } }))
  return client
}

async function call(client, name, extra = {}) {
  const result = await client.callTool({ name, arguments: { ...args, ...extra } })
  assert.equal(result.isError, undefined, result.content?.find((item) => item.type === 'text')?.text)
  return result.structuredContent
}

function drafts(state) {
  return Object.values(state.snapshot.store).filter((record) => record.typeName === 'shape' && record.meta?.cowartHtmlDraft)
}

try {
  const first = await openClient()
  const second = await openClient()
  const initialSnapshot = (await first.callTool({ name: 'render_cowart_canvas_widget', arguments: {} })).structuredContent.canvasState.snapshot
  const pageId = Object.values(initialSnapshot.store).find((record) => record.typeName === 'page').id
  await call(first, 'save_cowart_canvas_state', { snapshot: initialSnapshot })

  const many = await Promise.all(Array.from({ length: 6 }, () => openClient()))
  const rounds = [
    [1, Array(8).fill(first)],
    [2, Array.from({ length: 8 }, (_, index) => index % 2 ? first : second)],
    [3, [first, second, ...many]],
  ]
  for (const [round, targetClients] of rounds) {
    const results = await Promise.all(targetClients.map((client, index) => call(client, 'insert_cowart_html_draft', {
      pageId, fileName: 'concurrent.html', htmlContent: `<html><body>round ${round}, item ${index}</body></html>`,
      displayWidth: 320, displayHeight: 180,
    })))
    const state = await call(first, 'get_cowart_canvas_state')
    assert.equal(drafts(state).length, round * 8)
    assert.equal(new Set(results.map((result) => result.shapeId)).size, 8)
    assert.equal(new Set(results.map((result) => result.assetUrl)).size, 8)
    for (const [index, result] of results.entries()) {
      assert.ok(state.snapshot.store[result.shapeId], 'Each successful insertion must remain stored')
      const asset = await call(second, 'read_cowart_page_asset', { assetUrl: result.assetUrl })
      assert.match(Buffer.from(asset.dataBase64, 'base64').toString(), new RegExp(`round ${round}, item ${index}`))
    }
    console.log(`OK: round ${round}: all 8 concurrent HTML insertions retained (${round === 3 ? 'eight MCP processes' : round === 2 ? 'two MCP processes' : 'one MCP process'}).`)
  }

  const stale = await call(first, 'get_cowart_canvas_state')
  const inserted = await call(second, 'insert_cowart_html_draft', { pageId, fileName: 'after-stale-read.html', htmlContent: '<html>keep new content</html>' })
  const rejected = await first.callTool({ name: 'save_cowart_canvas_state', arguments: {
    ...args, snapshot: stale.snapshot, expectedRevision: stale.revision,
  } })
  assert.equal(rejected.isError, true)
  assert.equal(rejected.structuredContent.storage, 'revision-conflict')
  const current = await call(first, 'get_cowart_canvas_state')
  assert.ok(current.snapshot.store[inserted.shapeId])
  const saved = await call(first, 'save_cowart_canvas_state', { snapshot: current.snapshot, expectedRevision: current.revision })
  assert.equal(saved.revision, current.revision, 'A successful no-op save should preserve its content revision')
  const opened = await call(first, 'render_cowart_canvas_widget')
  assert.equal(opened.canvasState.revision, current.revision, 'The opener must supply the initial CAS baseline')
  console.log('OK: stale widget snapshots are refused, current snapshots save, and opener includes a revision.')

  // HTML DOM edits and full widget autosaves share a conditional write queue.
  // A queued save must capture the editor after the persisted HTML delta is
  // applied; unseen MCP changes must still invalidate both forms of write.
  const editable = await call(first, 'insert_cowart_html_draft', {
    pageId, fileName: 'dom-edit.html', htmlContent: '<html><body>before DOM edit</body></html>',
  })
  const browserWindow = globalThis.window
  let delayedHtml, releaseHtml, htmlStarted
  let htmlStart = Promise.resolve()
  const delayNextHtml = () => {
    delayedHtml = new Promise((resolveDelay) => { releaseHtml = resolveDelay })
    htmlStart = new Promise((resolveStart) => { htmlStarted = resolveStart })
  }
  try {
    const domInitial = await call(first, 'get_cowart_canvas_state')
    globalThis.window = {
      openai: { toolOutput: { ...args, canvasState: domInitial } },
      cowartMcp: { async callServerTool(request) {
        if (request.name === 'insert_cowart_html_draft' && delayedHtml) {
          const waiting = delayedHtml
          delayedHtml = null
          htmlStarted()
          await waiting
        }
        return first.callTool(request)
      } },
    }
    const frontend = await import('../src/cowartClient.js')
    await frontend.loadCowartCanvasState()
    let local = structuredClone(domInitial.snapshot)
    local.store[editable.shapeId] = { ...local.store[editable.shapeId], x: 123 }
    const applyResult = (result) => {
      const record = local.store[editable.shapeId]
      local.store[editable.shapeId] = {
        ...record, meta: { ...record.meta, cowartHtmlDraftAssetUrl: result.assetUrl, cowartHtmlDraftContentHash: result.contentHash },
        props: { ...record.props, url: result.virtualUrl },
      }
      return true
    }
    delayNextHtml()
    const editing = frontend.updateCowartHtmlDraft({ draftShapeId: editable.shapeId, htmlContent: '<html><body>after DOM edit</body></html>' }, { applyResult })
    await htmlStart
    let captures = 0
    const autosaving = frontend.saveCowartCanvasSnapshot(() => { captures++; return local })
    assert.equal(captures, 0, 'A save behind an HTML edit must defer editor snapshot capture')
    releaseHtml()
    const edited = await editing
    assert.equal(edited.previousRevision, domInitial.revision)
    assert.equal(edited.shapeRecord.meta.cowartHtmlDraftContentHash, edited.contentHash)
    assert.equal((await autosaving).ok, true)
    assert.equal(captures, 1)
    let domState = await call(first, 'get_cowart_canvas_state')
    assert.equal(domState.snapshot.store[editable.shapeId].x, 123, 'Unrelated local movement survives HTML persistence')
    assert.equal(domState.snapshot.store[editable.shapeId].meta.cowartHtmlDraftContentHash, edited.contentHash)
    assert.equal(await readFile(editable.assetFile, 'utf8'), '<html><body>after DOM edit</body></html>')

    delayNextHtml()
    let appliedStale = false
    const staleEditing = frontend.updateCowartHtmlDraft({ draftShapeId: editable.shapeId, htmlContent: '<html>stale DOM content</html>' }, {
      applyResult() { appliedStale = true; return true },
    })
    await htmlStart
    const beforeDomSave = await call(second, 'insert_cowart_html_draft', { pageId, fileName: 'before-dom-save.html', htmlContent: '<html>keep concurrent insertion</html>' })
    const staleRejection = assert.rejects(staleEditing, (error) => error.storage === 'revision-conflict')
    releaseHtml()
    await staleRejection
    assert.equal(appliedStale, false)
    assert.equal(await readFile(editable.assetFile, 'utf8'), '<html><body>after DOM edit</body></html>', 'A stale HTML edit must fail before rewriting its file')
    await assert.rejects(frontend.saveCowartCanvasSnapshot(() => local), (error) => error.storage === 'revision-conflict')
    const accepted = await frontend.refreshCowartCanvasSnapshot()
    frontend.acceptCowartCanvasSnapshot(accepted)
    local = structuredClone(accepted)
    assert.equal((await frontend.saveCowartCanvasSnapshot(() => local)).ok, true, 'Rejected HTML and snapshot writes must not poison the queue')

    await frontend.updateCowartHtmlDraft({ draftShapeId: editable.shapeId, htmlContent: '<html><body>second DOM edit</body></html>' }, { applyResult })
    const afterDomSave = await call(second, 'insert_cowart_html_draft', { pageId, fileName: 'after-dom-save.html', htmlContent: '<html>keep later insertion</html>' })
    await assert.rejects(frontend.saveCowartCanvasSnapshot(() => local), (error) => error.storage === 'revision-conflict')
    domState = await call(first, 'get_cowart_canvas_state')
    assert.ok(domState.snapshot.store[beforeDomSave.shapeId])
    assert.ok(domState.snapshot.store[afterDomSave.shapeId], 'Accepting a known HTML delta must not authorize overwriting an unseen later insertion')
    assert.equal(await readFile(editable.assetFile, 'utf8'), '<html><body>second DOM edit</body></html>')
    console.log('OK: DOM edits + queued autosaves succeed; local edits persist; stale HTML writes preserve files; concurrent MCP inserts stay protected; write queue recovers after conflicts.')
  } finally {
    if (browserWindow === undefined) delete globalThis.window
    else globalThis.window = browserWindow
  }

  // A saved HTML document can contain megabytes of embedded image data. Keep
  // it in the lazy asset response rather than every full-document poll/save.
  const largeHtml = `<!doctype html><html><body>完整保留源文件<!--${'x'.repeat(2 * 1024 * 1024)}--></body></html>`
  const largeDraft = await call(first, 'insert_cowart_html_draft', { pageId, fileName: 'large.html', htmlContent: largeHtml })
  let largeState = await call(first, 'get_cowart_canvas_state')
  assert.equal(largeState.snapshot.store[largeDraft.shapeId].props.url, largeDraft.virtualUrl)
  assert.ok(Buffer.byteLength(JSON.stringify(largeState)) < 100_000, 'Large saved HTML must not inflate snapshot responses')
  const largeAsset = await call(second, 'read_cowart_page_asset', { assetUrl: largeDraft.assetUrl })
  assert.equal(Buffer.from(largeAsset.dataBase64, 'base64').toString(), largeHtml, 'Lazy asset loading preserves the complete HTML')
  const pageFile = join(canvasDir, 'pages', encodeURIComponent(pageId.replace(/^page:/, '')), 'cowart-canvas.json')
  const legacyUrl = `data:text/html;base64,${Buffer.from(largeHtml).toString('base64')}`
  const legacyPage = JSON.parse(await readFile(pageFile, 'utf8'))
  legacyPage.store[largeDraft.shapeId].props.url = legacyUrl
  const legacyText = JSON.stringify(legacyPage, null, 2)
  await writeFile(pageFile, legacyText)
  largeState = await call(first, 'get_cowart_canvas_state')
  assert.equal(largeState.snapshot.store[largeDraft.shapeId].props.url, largeDraft.virtualUrl)
  assert.equal(await readFile(pageFile, 'utf8'), legacyText, 'Reading a matching legacy draft must not rewrite canvas data')
  const compactLegacyState = largeState
  const migratedLegacy = await call(first, 'save_cowart_canvas_state', { snapshot: largeState.snapshot, expectedRevision: largeState.revision })
  assert.equal(migratedLegacy.revision, compactLegacyState.revision, 'A legacy no-op migration retains its canonical revision')
  assert.equal(JSON.parse(await readFile(pageFile, 'utf8')).store[largeDraft.shapeId].props.url, largeDraft.virtualUrl)

  // Inline HTML remains the authoritative fallback when the file is different,
  // absent, or malformed. Never discard unique legacy content during migration.
  await writeFile(pageFile, legacyText)
  await writeFile(largeDraft.assetFile, `${largeHtml}\nchanged local file`)
  largeState = await call(first, 'get_cowart_canvas_state', { ifRevision: compactLegacyState.revision })
  assert.equal(largeState.unchanged, undefined, 'A changed backing file must invalidate conditional compacted reads')
  assert.equal(largeState.snapshot.store[largeDraft.shapeId].props.url, legacyUrl, 'A changed file must retain the inline fallback')
  const staleLegacy = await first.callTool({ name: 'save_cowart_canvas_state', arguments: {
    ...args, snapshot: compactLegacyState.snapshot, expectedRevision: compactLegacyState.revision,
  } })
  assert.equal(staleLegacy.structuredContent.storage, 'revision-conflict', 'A stale compacted response cannot discard a fallback after the file changes')
  await call(first, 'save_cowart_canvas_state', { snapshot: largeState.snapshot, expectedRevision: largeState.revision })
  assert.equal(JSON.parse(await readFile(pageFile, 'utf8')).store[largeDraft.shapeId].props.url, legacyUrl)
  await writeFile(largeDraft.assetFile, largeHtml)
  const matchingAgain = await call(first, 'get_cowart_canvas_state')
  await rm(largeDraft.assetFile)
  largeState = await call(first, 'get_cowart_canvas_state', { ifRevision: matchingAgain.revision })
  assert.equal(largeState.unchanged, undefined, 'A missing backing file must invalidate conditional compacted reads')
  assert.equal(largeState.snapshot.store[largeDraft.shapeId].props.url, legacyUrl, 'A missing file must retain the inline fallback')
  legacyPage.store[largeDraft.shapeId].props.url = 'data:text/html;charset=utf-8,%GG'
  await writeFile(pageFile, JSON.stringify(legacyPage))
  await writeFile(largeDraft.assetFile, largeHtml)
  largeState = await call(first, 'get_cowart_canvas_state')
  assert.equal(largeState.snapshot.store[largeDraft.shapeId].props.url, legacyPage.store[largeDraft.shapeId].props.url)
  await writeFile(pageFile, legacyText)
  largeState = await call(first, 'get_cowart_canvas_state')
  await call(first, 'save_cowart_canvas_state', { snapshot: largeState.snapshot, expectedRevision: largeState.revision })
  console.log('OK: megabyte HTML stays file-backed; lazy loading is byte-exact; legacy compaction is read-only and retains changed/missing/malformed fallbacks.')

  const outside = join(fixtureRoot, 'synthetic-outside', 'assets')
  await mkdir(outside, { recursive: true })
  await writeFile(join(outside, 'canary.html'), '<html>synthetic fixture only</html>')
  const pageAssets = join(canvasDir, 'pages', pageId.replace(/^page:/, ''), 'assets')
  await mkdir(join(canvasDir, 'assets'), { recursive: true })
  await writeFile(join(canvasDir, 'assets', 'valid image.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>')
  await symlink(dirname(outside), join(canvasDir, 'pages', 'linked'))
  await symlink(join(outside, 'canary.html'), join(pageAssets, 'linked.html'))
  await symlink(join(outside, 'canary.html'), join(canvasDir, 'assets', 'linked.html'))
  const asset = await call(first, 'read_cowart_page_asset', { assetUrl: '/assets/valid%20image.svg' })
  assert.equal(asset.mimeType, 'image/svg+xml')
  const unsafeUrls = [
    '/page-assets/../canary.html',
    `/page-assets/${encodeURIComponent('../../../synthetic-outside')}/canary.html`,
    '/page-assets/%2e%2e%5csynthetic-outside/canary.html',
    `/page-assets/${pageId.replace(/^page:/, '')}/%2e%2e%2fcanary.html`,
    `/page-assets/${pageId.replace(/^page:/, '')}/linked.html`,
    '/page-assets/linked/canary.html',
    '/assets/%2e%2e/canary.html', '/assets/linked.html', '/assets/%',
  ]
  for (const assetUrl of unsafeUrls) {
    const result = await first.callTool({ name: 'read_cowart_page_asset', arguments: { ...args, assetUrl } })
    assert.equal(result.isError, true, `Unsafe URL must be refused: ${assetUrl}`)
    assert.ok(!JSON.stringify(result).includes('synthetic fixture only'))
  }
  // URI-encoded page names are also directory names on disk, never decoded
  // into a path component containing separators.
  const namedPage = 'page:中文 页面/100%'
  const namedDir = join(canvasDir, 'pages', encodeURIComponent(namedPage.replace(/^page:/, '')), 'assets')
  await mkdir(namedDir, { recursive: true })
  await writeFile(join(namedDir, 'valid.html'), '<html>encoded page name</html>')
  const named = await call(first, 'read_cowart_page_asset', { assetUrl: `/page-assets/${encodeURIComponent(namedPage.replace(/^page:/, ''))}/valid.html` })
  assert.match(Buffer.from(named.dataBase64, 'base64').toString(), /encoded page name/)
  console.log('OK: traversal, invalid encoding and symlink escapes refused; valid page/global assets and encoded page names retained.')

  await assert.rejects(withCowartCanvasTransaction(args, async () => { throw new Error('synthetic operation failure') }), /synthetic operation failure/)
  await call(first, 'get_cowart_canvas_state')
  const exited = spawn(process.execPath, ['-e', ''], { stdio: 'ignore' })
  const deadPid = exited.pid
  await once(exited, 'exit')
  const lockDir = join(canvasDir, '.cowart-canvas-lock')
  await mkdir(lockDir, { recursive: true })
  // Initial choosing and held-lock crashes both recover without a reclaimer
  // process or an ownerless fixed lock directory.
  const deadChoosing = join(lockDir, `${deadPid}-00000000-0000-0000-0000-000000000001.json`)
  const deadHolding = join(lockDir, `${deadPid}-00000000-0000-0000-0000-000000000002.json`)
  await writeFile(deadChoosing, JSON.stringify({ pid: deadPid, ticket: null }))
  await writeFile(deadHolding, JSON.stringify({ pid: deadPid, ticket: 1 }))
  await mkdir(join(lockDir, 'reclaim'), { recursive: true })
  await writeFile(join(lockDir, `${deadPid}-00000000-0000-0000-0000-000000000004.json.partial.tmp`), '{')
  await call(first, 'get_cowart_canvas_state')
  await assert.rejects(readFile(deadChoosing), { code: 'ENOENT' })
  await assert.rejects(readFile(deadHolding), { code: 'ENOENT' })
  const liveParticipant = join(lockDir, `${process.pid}-00000000-0000-0000-0000-000000000003.json`)
  await writeFile(liveParticipant, JSON.stringify({ pid: process.pid, ticket: 1 }))
  let finished = false
  const blockedRead = call(first, 'get_cowart_canvas_state').then((state) => { finished = true; return state })
  await new Promise((resolveWait) => setTimeout(resolveWait, 100))
  assert.equal(finished, false, 'A live participant must never be reclaimed by age')
  await rm(liveParticipant)
  await blockedRead
  console.log('OK: thrown operations release locks; dead choosing/holding participants recover; unfinished publication/reclaim directories do not block; live locks are retained.')
  const pollingStarted = performance.now()
  for (let index = 0; index < 30; index++) await call(first, 'get_cowart_canvas_state')
  console.log(`OK: 30 sequential snapshot polls: ${((performance.now() - pollingStarted) / 30).toFixed(2)} ms average.`)
} finally {
  await Promise.allSettled(clients.map((client) => client.close()))
  await rm(fixtureRoot, { recursive: true, force: true })
}
