import html2canvas from './html2canvasClipFix.js'

export async function renderHtmlDraftDocument(iframeDocument, { width, height, pixelRatio }) {
  return html2canvas(iframeDocument.documentElement, {
    allowTaint: false,
    backgroundColor: '#ffffff',
    height,
    logging: false,
    onclone(clonedDocument) {
      clonedDocument.querySelectorAll('script').forEach((script) => script.remove())
      for (const animation of clonedDocument.getAnimations?.() || []) {
        try {
          const timing = animation.effect?.getComputedTiming?.()
          if (Number.isFinite(timing?.endTime)) animation.finish()
        } catch (_error) {
          // Infinite or detached animations cannot be finished; pause them below.
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
}
