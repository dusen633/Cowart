# 产品发布 — `product-launch`

Build attention around a product and demonstrate a benefit through motion. Prefer a consistent hero object or interface surface that changes form across scenes. Use the reference image for recognizable product geometry, palette, materials, and copy rather than inventing claims.

## Original prompt recipe

```text
Create a [duration]-second product launch film for [subject] at [width] × [height]. The viewer should remember [one benefit]. Use the supplied product/reference images to establish the hero, visual system, and exact wording. If no image is supplied, build a distinctive procedural representation without pretending it is a photographed product.

Opening: reveal one product detail through controlled light or a moving mask. Development: turn that detail into a practical interface or capability demonstration; show what changes, not a list of bullet points. Peak: emphasize the strongest benefit with one coordinated product movement and one short line. Close: resolve the same visual motif into the product name and a calm final composition.

Use disciplined materials, a coherent main light, restrained specular movement, and contact shadows. Camera movement follows the reveal and settles before important text. The hero moves first, supporting details follow, then the caption confirms the change. Prefer continuous geometry and shared spatial anchors between shots. Use [the actual brand palette] and a sparse backing rhythm with a few purposeful swishes/clicks/impacts. Keep all copy editable in DOM and make every frame seekable through CowartFilm. Deliver one self-contained offline HTML film.
```

## Motion decisions and checks

- Give the benefit a visible before/after action. An input is assembled into a result, a surface opens to expose a mechanism, or one cumbersome path becomes a direct one. Required feature copy confirms what the viewer has just seen rather than replacing the demonstration.
- Define shared product proportions, pivots, screen regions, light, and shadow once. Build a strong hero frame and test the hardest close-up-to-wide or interface transformation before extending the sequence. Across a match cut, keep the chosen edge/center, scale, and travel direction consistent.
- A software film may morph one surface from input to result, while a physical product film may pass attention from silhouette to material to function.
- Keep the hero visible at the peak. Shadows, glints, and focus respond to its motion; do not flood the frame with bloom.
- Treat cursor actions as meaningful events when showing UI. Fake typing or clicks should lead to a visible result.
- One or two benefits are enough for a short film. Text must be readable without requiring audio.
- Verify reference-image crops, product identity, final logo/name spelling, and that the target ratio preserves the subject rather than stretching it.

Public inspiration: coded startup launch films and single-shape interface transformations; links and verification limits are in [sources.md](sources.md). This recipe is original and does not reuse another brand's advertisement.
