import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import html2canvas from '../src/html2canvasClipFix.js'
import stackingContext from 'html2canvas/dist/lib/render/stacking-context.js'
import effectsModule from 'html2canvas/dist/lib/render/effects.js'

const { ElementPaint } = stackingContext
const { TransformEffect, ClipEffect, OpacityEffect, isClipEffect } = effectsModule
const ALL = 2 | 4

function paint({ parent = null, position = 2, clip = true, effects = [] } = {}) {
  const result = Object.create(ElementPaint.prototype)
  result.parent = parent
  result.container = { styles: { position, overflowX: clip ? 1 : 0 } }
  result.effects = effects
  result.curves = {}
  for (const corner of ['topLeft', 'topRight', 'bottomRight', 'bottomLeft']) {
    result.curves[`${corner}BorderBox`] = { box: 'border', corner }
    result.curves[`${corner}PaddingBox`] = { box: 'padding', corner }
  }
  return result
}

test('the pinned modular renderer is callable', () => {
  assert.equal(typeof html2canvas, 'function')
  const require = createRequire(import.meta.url)
  assert.equal(require('html2canvas/package.json').version, '1.4.1')
})

test('a centered stage transforms before clipping its positioned children', () => {
  const transform = new TransformEffect(1024, 576, [1, 0, 0, 1, -512, -288])
  const stage = paint({ effects: [transform] })
  const child = paint({ parent: stage })
  for (const target of [2, 4]) {
    const effects = child.getEffects(target)
    assert.equal(effects[0], transform)
    assert.ok(isClipEffect(effects[1]))
    assert.equal(effects[1].path[0], stage.curves.topLeftPaddingBox)
  }
})

test('nested scale, rotation, opacity and clips retain outer-to-inner paint order', () => {
  const scale = new TransformEffect(0, 0, [1.5, 0, 0, 1.5, -768, -432])
  const rotation = new TransformEffect(60, 60, [0, 1, -1, 0, 0, 0])
  const opacity = new OpacityEffect(0.5)
  const outer = paint({ effects: [scale] })
  const inner = paint({ parent: outer, effects: [opacity, rotation] })
  const ownClip = new ClipEffect([], ALL)
  const child = paint({ parent: inner, effects: [ownClip] })
  const effects = child.getEffects(4)
  assert.equal(effects.length, 6)
  assert.equal(effects[0], scale)
  assert.equal(effects[1].path[0], outer.curves.topLeftPaddingBox)
  assert.equal(effects[2], opacity)
  assert.equal(effects[3], rotation)
  assert.equal(effects[4].path[0], inner.curves.topLeftPaddingBox)
  assert.equal(effects[5], ownClip)
  assert.deepEqual(inner.effects, [opacity, rotation], 'do not mutate cached parent effects')
})

test('ordinary overflow clips and target filtering remain unchanged', () => {
  const parent = paint()
  const backgroundOnly = new ClipEffect([], 2)
  const child = paint({ parent, effects: [backgroundOnly] })
  assert.equal(child.getEffects(4).length, 1)
  assert.equal(child.getEffects(2).length, 2)
  assert.equal(child.getEffects(2)[1], backgroundOnly)
})

test('out-of-flow children still skip non-containing static ancestors', () => {
  const root = paint({ clip: false })
  const staticParent = paint({ parent: root, position: 0 })
  assert.deepEqual(paint({ parent: staticParent }).getEffects(4), [])
  assert.equal(paint({ parent: staticParent, position: 0 }).getEffects(4).length, 1)
})
