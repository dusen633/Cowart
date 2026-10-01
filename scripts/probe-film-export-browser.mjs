// Browser regression using the real renderer/encoder. No plugin runtime service.
import { createServer } from 'node:http'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { build } from 'esbuild'

const root = new URL('../', import.meta.url)
const { outputFiles } = await build({ entryPoints: [new URL('fixtures/film-export-browser.js', import.meta.url).pathname], bundle: true,
  format: 'esm', write: false, logLevel: 'silent' })
const directory = new URL('output/film-export-probe/', root)
await mkdir(directory, { recursive: true })
const server = createServer(async (request, response) => {
  try {
    if (request.url === '/') {
      response.setHeader('content-type', 'text/html')
      response.end('<!doctype html><title>Cowart MP4 regression</title><button id="run">Run export tests</button><pre id="result">Ready</pre><script type="module" src="/probe.js"></script>')
    } else if (request.url === '/probe.js') {
      response.setHeader('content-type', 'text/javascript')
      response.end(outputFiles[0].text)
    } else if (request.url === '/legacy.html') {
      response.setHeader('content-type', 'text/html')
      response.end(await readFile(new URL('canvas/hello-film.html', root)))
    } else if (request.url === '/slow.svg') {
      response.setHeader('content-type', 'image/svg+xml')
      setTimeout(() => response.end('<svg xmlns="http://www.w3.org/2000/svg" width="50" height="30"><rect width="50" height="30" fill="#00d000"/></svg>'), 120)
    } else if (request.method === 'POST' && /^\/(result|fixture\.mp4|legacy\.mp4)$/.test(request.url)) {
      const chunks = []
      for await (const chunk of request) chunks.push(chunk)
      const body = Buffer.concat(chunks)
      await writeFile(new URL(request.url.slice(1) === 'result' ? 'results.json' : request.url.slice(1), directory), body)
      if (request.url === '/result') console.log(body.toString())
      response.end('saved')
    } else response.writeHead(404).end()
  } catch (error) { console.error(error); response.writeHead(500).end(String(error)) }
})
server.listen(0, '127.0.0.1', () => console.log(`MP4 export regression: http://127.0.0.1:${server.address().port}/`))
