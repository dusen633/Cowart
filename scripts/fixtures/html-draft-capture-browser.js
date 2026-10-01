import { renderHtmlDraftDocument } from '../../src/htmlDraftCapture.js'

const results = []
const output = document.querySelector('pre')
const assert = (value, message) => { if (!value) throw new Error(message) }

// Four quadrants expose both missing content and accidentally disabled clipping.
const fixture = `<!doctype html><style>
*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#ffffff}
#stage{position:absolute;left:50%;top:50%;width:400px;height:240px;overflow:hidden;transform-origin:center}
.page{position:absolute;inset:0;background:#ff0000}.page[hidden]{display:none}
.q{position:absolute;width:200px;height:120px}.tr{left:200px;background:#00ff00}.bl{top:120px;background:#0000ff}.br{left:200px;top:120px;background:#ffff00}
.clip{position:absolute;left:80px;top:60px;width:40px;height:40px;overflow:hidden;transform:rotate(90deg);border-radius:6px}
.oversize{position:absolute;left:-20px;top:-20px;width:80px;height:80px;background:#ff00ff}
</style><main id="stage"><section class="page">Inactive page</section><section class="page" hidden><div class="q tr"></div><div class="q bl"></div><div class="q br"></div><div class="clip"><div class="oversize"></div></div></section></main><script>
const stage=document.querySelector('#stage');
function fit(){stage.style.transform='translate(-50%,-50%) scale('+Math.min(innerWidth/400,innerHeight/240)+')'}fit();addEventListener('resize',fit);
// Capture must keep the current page, not rerun the source and return to page one.
document.querySelectorAll('.page')[0].hidden=true;document.querySelectorAll('.page')[1].hidden=false;
</script>`

function rgb(canvas, x, y, ratio) {
  return [...canvas.getContext('2d').getImageData(Math.floor(x * ratio), Math.floor(y * ratio), 1, 1).data].slice(0, 3).join(',')
}

async function capture(source, width, height, pixelRatio, zoom = 1) {
  const frame = document.createElement('iframe')
  frame.style.cssText = `width:${width}px;height:${height}px;border:0;transform:scale(${zoom});transform-origin:top left`
  const loaded = new Promise((resolve) => { frame.onload = resolve })
  frame.srcdoc = source
  document.body.append(frame)
  try {
    await loaded
    await frame.contentDocument.fonts.ready
    await new Promise((resolve) => setTimeout(resolve, 300))
    const before = frame.contentDocument.documentElement.outerHTML
    const canvas = await renderHtmlDraftDocument(frame.contentDocument, { width, height, pixelRatio })
    assert(canvas.width === Math.floor(width * pixelRatio) && canvas.height === Math.floor(height * pixelRatio), 'wrong output dimensions')
    assert(before === frame.contentDocument.documentElement.outerHTML, 'live HTML was mutated')
    return canvas
  } finally {
    frame.remove()
  }
}

async function check(name, run) {
  try { await run(); results.push({ name, passed: true }) }
  catch (error) { results.push({ name, passed: false, error: String(error) }) }
  output.textContent = results.map((result) => `${result.passed ? 'PASS' : 'FAIL'} ${result.name}${result.error ? ': ' + result.error : ''}`).join('\n')
}

for (const [width, height, ratio, zoom] of [
  [400, 240, 1, 1], [400, 240, 1.5, 1], [400, 240, 2, 0.42],
  [200, 120, 2, 1], [600, 360, 1, 1], [400, 400, 1.5, 1], [600, 240, 1, 1]
]) {
  await check(`quadrants + nested clipping ${width}x${height} @${ratio} zoom ${zoom}`, async () => {
    const canvas = await capture(fixture, width, height, ratio, zoom)
    const scale = Math.min(width / 400, height / 240)
    const x = (width - 400 * scale) / 2, y = (height - 240 * scale) / 2
    for (const [px, py, expected] of [
      [20, 20, '255,0,0'], [380, 20, '0,255,0'], [20, 220, '0,0,255'], [380, 220, '255,255,0'],
      [100, 80, '255,0,255'], [70, 80, '255,0,0'], [130, 80, '255,0,0'], [80, 60, '255,0,0']
    ]) assert(rgb(canvas, x + px * scale, y + py * scale, ratio) === expected, `pixel ${px},${py} lost or leaked`)
    if (y > 0) assert(rgb(canvas, width / 2, 5, ratio) === '255,255,255', 'vertical letterbox changed')
    if (x > 0) assert(rgb(canvas, 5, height / 2, ratio) === '255,255,255', 'horizontal letterbox changed')
  })
}

let originalPng
const originalResponse = await fetch('/original')
if (originalResponse.ok) {
  const source = await originalResponse.text()
  for (const [width, height, ratio] of [[1024, 576, 1], [1024, 576, 1.5], [1024, 576, 2], [512, 288, 1], [1536, 864, 1], [1024, 768, 1]]) {
    await check(`Today AI original ${width}x${height} @${ratio}`, async () => {
      const canvas = await capture(source, width, height, ratio, 0.42)
      const scale = Math.min(width / 1024, height / 576)
      const left = (width - 1024 * scale) / 2, top = (height - 576 * scale) / 2
      for (const [x, y] of [[5, 5], [1019, 5], [5, 570], [1019, 570]]) {
        assert(rgb(canvas, left + x * scale, top + y * scale, ratio) === '250,84,43', `cover corner ${x},${y} was clipped`)
      }
      if (width === 1024 && height === 576 && ratio === 1.5) originalPng = canvas.toDataURL('image/png').split(',')[1]
    })
  }
}
output.textContent += `\nDONE: ${results.filter((result) => result.passed).length}/${results.length} passed`
await fetch('/result', { method: 'POST', body: JSON.stringify({ results, originalPng }) })
