// Optional pixel regression. Open the printed URL with an approved browser tool.
// --original=/absolute/path/today-ai.html adds the user's reproduction read-only.
// This exercises the capture function, not native Codex plugin integration.
import { createServer } from 'node:http'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const root = fileURLToPath(new URL('../', import.meta.url))
const originalPath = process.argv.find((arg) => arg.startsWith('--original='))?.slice(11)
const original = originalPath ? await readFile(originalPath) : null
const outputDir = new URL('../output/html-capture-probe/', import.meta.url)
await mkdir(outputDir, { recursive: true })
const bundle = await build({
  absWorkingDir: root,
  entryPoints: ['scripts/fixtures/html-draft-capture-browser.js'],
  bundle: true, format: 'esm', write: false, logLevel: 'silent'
})
const server = createServer(async (request, response) => {
  try {
    if (request.method === 'GET' && request.url === '/') {
      response.setHeader('content-type', 'text/html; charset=utf-8')
      response.end('<!doctype html><title>Cowart capture pixel regression</title><pre>Running…</pre><script type="module" src="/probe.js"></script>')
    } else if (request.method === 'GET' && request.url === '/probe.js') {
      response.setHeader('content-type', 'text/javascript')
      response.end(bundle.outputFiles[0].text)
    } else if (request.method === 'GET' && request.url === '/original' && original) {
      response.setHeader('content-type', 'text/html; charset=utf-8')
      response.end(original)
    } else if (request.method === 'POST' && request.url === '/result') {
      let body = ''
      for await (const chunk of request) {
        body += chunk
        if (body.length > 10_000_000) throw new Error('Result too large')
      }
      const { results, originalPng } = JSON.parse(body)
      await writeFile(new URL('results.json', outputDir), JSON.stringify(results, null, 2) + '\n')
      if (originalPng) await writeFile(new URL('today-ai-fixed.png', outputDir), Buffer.from(originalPng, 'base64'))
      console.log(JSON.stringify(results, null, 2))
      process.exitCode = results.length >= 7 && results.every((result) => result.passed) ? 0 : 1
      response.end('saved')
      clearTimeout(timeout)
      server.close()
    } else {
      response.writeHead(404).end()
    }
  } catch (error) {
    console.error(error)
    response.writeHead(500).end('Probe failed')
    process.exitCode = 1
    clearTimeout(timeout)
    server.close()
  }
})
const timeout = setTimeout(() => { console.error('No browser result within 120s'); process.exitCode = 1; server.close() }, 120_000)
server.listen(0, '127.0.0.1', () => console.log(`Capture function regression: http://127.0.0.1:${server.address().port}/`))
