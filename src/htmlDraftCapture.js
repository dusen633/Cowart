import html2canvas from './html2canvasClipFix.js'

import documentCloner from 'html2canvas/dist/lib/dom/document-cloner.js'

const { DocumentCloner } = documentCloner
const activeCaptures = new WeakMap()
const originalCloneElement = DocumentCloner.prototype.createElementClone

// html2canvas replaces <video> with <canvas> itself and inserts helper nodes.
// Record actual clone identities while its pinned synchronous clone pass runs.
// Supplying the decoded bitmap here prevents any native <video> screenshot.
DocumentCloner.prototype.createElementClone = function (node) {
  const capture = activeCaptures.get(node.ownerDocument)
  const frame = capture?.videoFrames?.get(node)
  let clone
  if (frame) {
    clone = node.ownerDocument.createElement('canvas')
    clone.width = frame.width; clone.height = frame.height
    clone.getContext('2d').drawImage(frame, 0, 0)
    const style = node.ownerDocument.defaultView.getComputedStyle(node)
    for (const property of style) clone.style.setProperty(property, style.getPropertyValue(property))
    clone.style.animation = 'none'
  } else clone = originalCloneElement.call(this, node)
  capture?.nodes.set(node, clone)
  return clone
}

export async function renderHtmlDraftDocument(iframeDocument, { width, height, pixelRatio, freezeAtCurrentFrame = false, videoFrames }) {
  const capture = { nodes: new WeakMap(), videoFrames }
  const previous = activeCaptures.get(iframeDocument)
  activeCaptures.set(iframeDocument, capture)
  try {
  return html2canvas(iframeDocument.documentElement, {
    allowTaint: false,
    backgroundColor: '#ffffff',
    height,
    logging: false,
    onclone(clonedDocument) {
      clonedDocument.querySelectorAll('script').forEach((script) => script.remove())
      if (freezeAtCurrentFrame) {
        for (const animation of iframeDocument.getAnimations?.() || []) {
          const target = animation.effect?.target
          const clone = capture.nodes.get(target)
          if (!clone || !animation.effect?.getKeyframes) continue
          const computed = iframeDocument.defaultView.getComputedStyle(target)
          for (const key of new Set(animation.effect.getKeyframes().flatMap((frame) => Object.keys(frame)))) {
            if (['offset', 'computedOffset', 'easing', 'composite'].includes(key)) continue
            clone.style[key] = computed[key]
          }
          clone.style.animation = 'none'
        }
      }
      const captureStyle = clonedDocument.createElement('style')
      captureStyle.textContent = `
        html, body { width: ${width}px !important; height: ${height}px !important; }
        *, *::before, *::after { animation-play-state: paused !important; caret-color: transparent !important; transition: none !important; }
      `
      clonedDocument.head?.append(captureStyle)
    },
    scale: pixelRatio,
    scrollX: 0,
    scrollY: 0,
    useCORS: true,
    width,
    windowHeight: height,
    windowWidth: width,
    x: 0,
    y: 0
  })
  } finally {
    // The clone pass runs before html2canvas's first await. Restore immediately
    // so separate capture documents can render concurrently without interference.
    if (previous) activeCaptures.set(iframeDocument, previous)
    else activeCaptures.delete(iframeDocument)
  }
}
