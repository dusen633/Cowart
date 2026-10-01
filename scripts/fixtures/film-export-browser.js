import { ALL_FORMATS, AudioBufferSink, BlobSource, Input, VideoSampleSink } from 'mediabunny'
import { filmExportDimensions, renderCowartFilmMp4 } from '../../src/filmExport.js'

function assert(condition, message) { if (!condition) throw new Error(message) }
const fixture = `<!doctype html><html><style>html,body{margin:0;background:white}#blue{position:absolute;left:20px;top:80px;width:50px;height:20px;background:#0000f0}#box{position:absolute;left:20px;top:20px;width:50px;height:50px;background:#f00000}h1{position:absolute;top:100px;font:40px Arial}</style><div id="box"></div><div id="blue"></div><h1 data-cowart-text-id="title">edited hello</h1><script>
let time=0,playing=false,muted=true;
const motion=document.getElementById('blue').animate([{transform:'translateX(0px)'},{transform:'translateX(180px)'}],{duration:1000,fill:'both'});motion.pause();
window.CowartFilm={duration:1,get currentTime(){return time},get playing(){return playing},get muted(){return muted},seek(t){time=t;motion.currentTime=t*1000;document.getElementById('box').style.left=(20+t*180)+'px'},play(){playing=true},pause(){playing=false},setMuted(value){muted=value},renderAudio({sampleRate,numberOfChannels}){const buffer=new AudioBuffer({sampleRate,numberOfChannels,length:sampleRate});for(let c=0;c<numberOfChannels;c++){const data=buffer.getChannelData(c);for(let i=0;i<data.length;i++){const t=i/sampleRate;data[i]=.15*Math.sin(2*Math.PI*440*t)+ (t>.5?.1*Math.sin(2*Math.PI*880*t)*Math.exp(-(t-.5)*12):0)}}return buffer}};
CowartFilm.seek(0);
<\/script></html>`

async function inspect(blob, duration, movingBox = false) {
  assert(blob.type === 'video/mp4' && blob.size > 1000, 'must produce a real MP4 blob')
  const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS })
  try {
    const video = await input.getPrimaryVideoTrack(), audio = await input.getPrimaryAudioTrack()
    assert(video && audio, 'MP4 must contain both video and audio tracks')
    const actual = await input.computeDuration()
    assert(Math.abs(actual - duration) < 0.08, 'MP4 duration must match the timeline')
    let sum = 0, count = 0
    for await (const { buffer } of new AudioBufferSink(audio).buffers()) {
      for (const sample of buffer.getChannelData(0)) { sum += sample * sample; count++ }
    }
    const rms = Math.sqrt(sum / count)
    assert(rms > 0.01, 'decoded AAC soundtrack must contain audible music')
    const sink = new VideoSampleSink(video)
    const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 180
    const context = canvas.getContext('2d')
    const checksums = [], bluePositions = [], assetPixels = [], pixelHashes = []
    for (const time of [0, duration * 0.7]) {
      const sample = await sink.getSample(time)
      assert(sample, 'video frame must decode')
      sample.draw(context, 0, 0, 320, 180)
      sample.close()
      const pixels = context.getImageData(0, 0, 320, 180).data
      pixelHashes.push(pixels.reduce((hash, value) => Math.imul(hash ^ value, 16777619) >>> 0, 2166136261))
      assetPixels.push(Array.from(context.getImageData(265, 115, 1, 1).data))
      if (movingBox) {
        let xSum = 0, redCount = 0
        for (let i = 0; i < pixels.length; i += 4) if (pixels[i] > 150 && pixels[i + 1] < 80 && pixels[i + 2] < 80) {
          xSum += (i / 4) % 320; redCount++
        }
        checksums.push(xSum / redCount)
        let blueX = 0, blueCount = 0
        for (let i = 0; i < pixels.length; i += 4) if (pixels[i + 2] > 150 && pixels[i] < 80 && pixels[i + 1] < 80) {
          blueX += (i / 4) % 320; blueCount++
        }
        bluePositions.push(blueX / blueCount)
      } else checksums.push(pixels.reduce((sum, value, i) => (sum + value * (i % 97)) % 1000000007, 0))
    }
    assert(checksums[0] !== checksums[1], 'decoded frames must animate, rather than repeat a still image')
    if (movingBox) {
      assert(checksums[1] > checksums[0] + 100, 'seeked object must move to its correct timestamp')
      assert(bluePositions[1] > bluePositions[0] + 100, 'WAAPI animations must preserve their seeked frame during HTML cloning: '+JSON.stringify(bluePositions))
    }
    return { size: blob.size, duration: actual, rms, frames: checksums, assetPixels, pixelHashes }
  } finally { input.dispose() }
}

document.getElementById('run').onclick = async () => {
  const results = [], result = document.getElementById('result')
  try {
    assert(filmExportDimensions(1023, 575).width % 2 === 0, 'H.264 dimensions must be even')
    assert(filmExportDimensions(4000, 2000).width === 1920, 'large shapes must be bounded')
    const progress = []
    const blob = await renderCowartFilmMp4({ html: fixture, width: 320, height: 180, duration: 1,
      onProgress: (value) => { progress.push(value); result.textContent = 'Fixture: ' + Math.round(value * 100) + '%' } })
    results.push({ test: 'edited DOM, seeked frames, muted preview still exports music', ...await inspect(blob, 1, true) })
    assert(progress[0] === 0 && progress.at(-1) === 1 && progress.every((v, i) => !i || v >= progress[i - 1]), 'progress must reach 100% monotonically')
    await fetch('/fixture.mp4', { method: 'POST', body: blob })
    const asynchronous = fixture
      .replace('window.CowartFilm={duration:1,', `window.CowartFilm={duration:1,ready:new Promise(resolve=>requestAnimationFrame(()=>{
        const asset=document.createElement('div');asset.style.cssText='position:absolute;left:240px;top:100px;width:50px;height:30px;background-image:url(/slow.svg)';document.body.append(asset);requestAnimationFrame(resolve);
      })),`)
      .replace('seek(t){time=t;', 'async seek(t){await new Promise(resolve=>requestAnimationFrame(resolve));time=t;')
    const asyncBlob = await renderCowartFilmMp4({ html: asynchronous, width: 320, height: 180, duration: 1 })
    const asyncInfo = await inspect(asyncBlob, 1, true)
    assert(asyncInfo.assetPixels.every((rgba) => rgba[1] > 120 && rgba[0] < 60), 'delayed CSS backgrounds must be decoded in the first and later frames')
    const repeated = await renderCowartFilmMp4({ html: asynchronous, width: 320, height: 180, duration: 1 })
    const repeatedInfo = await inspect(repeated, 1, true)
    assert(JSON.stringify(asyncInfo.frames) === JSON.stringify(repeatedInfo.frames), 'repeat export must produce the same decoded compositions')
    assert(JSON.stringify(asyncInfo.pixelHashes) === JSON.stringify(repeatedInfo.pixelHashes), 'repeat export must retain identical decoded frame pixels')
    assert(Math.abs(asyncInfo.rms - repeatedInfo.rms) < 0.00001, 'repeat export must retain the same soundtrack')
    results.push({ test: 'RAF readiness, async seek, delayed CSS asset, repeat export parity', ...asyncInfo })
    const delayedAPI = fixture.replace('window.CowartFilm={', 'setTimeout(()=>{window.CowartFilm={').replace('CowartFilm.seek(0);', 'CowartFilm.seek(0);},75);')
    const delayedBlob = await renderCowartFilmMp4({ html: delayedAPI, width: 320, height: 180, duration: 1 })
    results.push({ test: 'API installed after iframe load', ...await inspect(delayedBlob, 1, true) })
    const sourceData = await new Promise((resolve) => {
      const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.readAsDataURL(blob)
    })
    const videoFixture = fixture
      .replace('<h1 data-cowart-text-id="title">', `<video preload="auto" muted src="${sourceData}" style="position:absolute;left:0;top:0;width:320px;height:180px;object-fit:cover"></video><h1 data-cowart-text-id="title">`)
      .replace('seek(t){time=t;', "seek(t){time=t;document.querySelector('video').pause();document.querySelector('video').currentTime=t;")
    const videoBlob = await renderCowartFilmMp4({ html: videoFixture, width: 320, height: 180, duration: 1 })
    const videoInfo = await inspect(videoBlob, 1, true)
    assert(videoInfo.frames.every((x, i) => Math.abs(x - asyncInfo.frames[i]) < 3), 'embedded video must display its exact source time, not a dropped/native playback frame')
    results.push({ test: 'deterministically decoded embedded MP4, video/music retained', ...videoInfo })
    const legacyResponse = await fetch('/legacy.html')
    if (legacyResponse.ok) {
      const legacy = await renderCowartFilmMp4({ html: await legacyResponse.text(), width: 1024, height: 576, duration: 4,
        onProgress: (value) => { result.textContent = 'Legacy: ' + Math.round(value * 100) + '%' } })
      results.push({ test: 'existing hello film Web Audio graph export', ...await inspect(legacy, 4) })
      await fetch('/legacy.mp4', { method: 'POST', body: legacy })
    }
    const abort = new AbortController(); abort.abort()
    let canceled = false
    try { await renderCowartFilmMp4({ html: fixture, width: 320, height: 180, duration: 1, signal: abort.signal }) } catch (error) { canceled = error.name === 'AbortError' }
    assert(canceled, 'cancellation must reject before rendering')
    let missingAudio = false
    try { await renderCowartFilmMp4({ html: fixture.replace('renderAudio({sampleRate,numberOfChannels})', 'unused({sampleRate,numberOfChannels})'), width: 320, height: 180, duration: 1 }) }
    catch (error) { missingAudio = /音轨/.test(error.message) }
    assert(missingAudio, 'missing music must fail rather than download a silent MP4')
    const neverReady = fixture.replace('duration:1,', 'duration:1,ready:new Promise(()=>{}),')
    const duringLoad = new AbortController()
    const cancelTimer = setTimeout(() => duringLoad.abort(), 100)
    let interrupted = false
    try { await renderCowartFilmMp4({ html: neverReady, width: 320, height: 180, duration: 1, signal: duringLoad.signal }) }
    catch (error) { interrupted = error.name === 'AbortError' }
    finally { clearTimeout(cancelTimer) }
    assert(interrupted, 'cancel during runtime preparation must reject immediately')
    let timedOut = false
    try { await renderCowartFilmMp4({ html: neverReady, width: 320, height: 180, duration: 1, taskTimeout: 250 }) }
    catch (error) { timedOut = /初始化超时/.test(error.message) }
    assert(timedOut, 'a permanently pending runtime must report a bounded initialization timeout')
    const neverSeeked = fixture.replace('seek(t){time=t;', 'seek(t){return new Promise(()=>{});time=t;')
    const duringSeek = new AbortController()
    const seekCancelTimer = setTimeout(() => duringSeek.abort(), 400)
    let seekInterrupted = false
    try { await renderCowartFilmMp4({ html: neverSeeked, width: 320, height: 180, duration: 1, signal: duringSeek.signal }) }
    catch (error) { seekInterrupted = error.name === 'AbortError' }
    finally { clearTimeout(seekCancelTimer) }
    assert(seekInterrupted, 'cancel while seeking a frame must release the export')
    let seekTimedOut = false
    try { await renderCowartFilmMp4({ html: neverSeeked, width: 320, height: 180, duration: 1, taskTimeout: 250 }) }
    catch (error) { seekTimedOut = /帧定位超时/.test(error.message) }
    assert(seekTimedOut, 'a stuck seek must report the frame stage and release the iframe')
    let backgroundFailed = false
    try { await renderCowartFilmMp4({ html: fixture.replace('background:#f00000', 'background:url(/missing-background.png)'), width: 320, height: 180, duration: 1 }) }
    catch (error) { backgroundFailed = /背景素材/.test(error.message) }
    assert(backgroundFailed, 'broken CSS backgrounds must not silently export incomplete artwork')
    assert(document.querySelectorAll('iframe').length === 0, 'export frames must be cleaned up after success and failure')
    results.push({ test: 'progress, initialization/frame cancellation and timeout, missing audio/background, iframe cleanup', passed: true })
    window.testResult = { passed: true, results }
  } catch (error) { window.testResult = { passed: false, error: error.stack, results } }
  result.textContent = JSON.stringify(window.testResult, null, 2)
  await fetch('/result', { method: 'POST', body: result.textContent })
}
