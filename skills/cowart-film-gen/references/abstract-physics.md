# 物理几何 — `abstract-physics`

Use a small family of forms and a legible chain of forces. Material and momentum should explain every deformation. This style can be abstract while still having a clear start, transfer of energy, and resolution.

## Original prompt recipe

```text
Interpret [subject or idea] as a [duration]-second physical motion film at [width] × [height]. Choose one hero form and at most two supporting material families. Derive a memorable action from the idea: compression releasing energy, a collision organizing scattered forms, a ribbon carrying a signal, or liquid gathering into a stable object. Use the reference images for material and palette when available.

Start with stored tension. Accelerate the hero into a clear contact event. Show compression or stretching where force is applied; let neighboring elements react in sequence. Carry the outgoing momentum into the next shape or trajectory instead of resetting the scene. End with energy dissipating into a clean, readable arrangement.

Give materials distinct response: a heavy body has a short impact and slow recovery; an elastic body overshoots and damps; a soft ribbon transmits a wave with a visible delay. Keep a single light direction, grounded contact shadows, and limited color. Sound follows events: air movement from speed, impact from contact, small residual ticks from settling. Use analytic paths or deterministic fixed-step simulation with reset-and-replay seek; no unseeded random motion. Deliver one offline HTML film under the Cowart runtime contract.
```

## Motion decisions and checks

- Sketch the force chain with contact points and event times before simulating it. Show what stores energy, what releases it, what receives it, and what changes afterward. A collection of objects oscillating independently will not establish that chain.
- Keep the hero's material response distinctive and recurring. Connect a transition through outgoing momentum or a shared contour; the incoming object must reconstruct the matching state even on a direct seek. Sparse material texture and changing contact shadows can add depth without obscuring the silhouette.
- Work in a design-space coordinate system; holder resizing must not change the simulated time or introduce different outcomes.
- Use ballistic paths, damped springs, delayed traveling waves, or a fixed-step cached simulation. A direct seek to 8 seconds must match playing to 8 seconds.
- Animate volume-preserving squash/stretch around the contact point when useful. A drifting contact shadow is a visible error.
- Maintain a hierarchy: one force transfers attention; avoid every object bouncing at once.
- Inspect frames just before contact, at maximum compression, during rebound, and after settlement. Compare forward and backward seeks and listen for duplicated effects.

Public inspiration: procedural physical chain-reaction scenes; the source example in [sources.md](sources.md) uses a different production stack. Translate the causal principle into Cowart's self-contained renderer rather than copying that project.
