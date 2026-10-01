/*!
 * Adapted from html2canvas's ElementPaint.getEffects.
 * Copyright (c) 2012 Niklas von Hertzen
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */
import html2canvasModule from 'html2canvas/dist/lib/index.js'
import stackingContext from 'html2canvas/dist/lib/render/stacking-context.js'
import effectsModule from 'html2canvas/dist/lib/render/effects.js'
import boundCurves from 'html2canvas/dist/lib/render/bound-curves.js'
import pathModule from 'html2canvas/dist/lib/render/path.js'

const { ElementPaint } = stackingContext
const { ClipEffect, isClipEffect } = effectsModule
const { calculateBorderBoxPath, calculatePaddingBoxPath } = boundCurves
const { equalPath } = pathModule
const BACKGROUND_AND_CONTENT = 2 | 4
const isOutOfFlow = (position) => position === 2 || position === 3 // ABSOLUTE / FIXED

// Keep these imports on the same modular build: patching dist/lib while rendering
// with the public, prebundled entry point would silently use a different class.
// html2canvas is pinned to 1.4.1; probe:html:capture checks this adapter on upgrades.
// Upstream getEffects prepends an ancestor's clip BEFORE that ancestor's transform.
// A centered translate(-50%, -50%) stage consequently clips away three quarters
// of its children. Keep each ancestor's transform and clip in their paint order.
// This preserves nested overflow, rounded corners and rotations without touching
// the live HTML, its layout, or the cloned document's CSS.
ElementPaint.prototype.getEffects = function getEffects(target) {
  let inFlow = !isOutOfFlow(this.container.styles.position)
  const effects = this.effects.slice()
  for (let parent = this.parent; parent; parent = parent.parent) {
    const ancestorEffects = parent.effects.filter((effect) => !isClipEffect(effect))
    if (inFlow || parent.container.styles.position !== 0 || !parent.parent) {
      inFlow = !isOutOfFlow(parent.container.styles.position)
      if (parent.container.styles.overflowX !== 0) {
        const borderBox = calculateBorderBoxPath(parent.curves)
        const paddingBox = calculatePaddingBoxPath(parent.curves)
        if (!equalPath(borderBox, paddingBox)) {
          ancestorEffects.push(new ClipEffect(paddingBox, BACKGROUND_AND_CONTENT))
        }
      }
    }
    effects.unshift(...ancestorEffects)
  }
  return effects.filter((effect) => (effect.target & target) !== 0)
}

// CJS interop differs between native Node probes and the browser bundler.
export default html2canvasModule.default || html2canvasModule
