# 叙事短片 — `editorial-story`

Tell a compact story using a recurring visual motif, a changing relationship, and a final consequence. Paper-like forms, line drawing, cutouts, and simple depth are practical for a self-contained film. The story should remain understandable with sound muted.

## Original prompt recipe

```text
Create a [duration]-second editorial motion film about [subject] at [width] × [height]. Decide the one question the film answers, then express its answer through a short sequence of visual changes. Use the provided reference images for composition, atmosphere, or a recurring character/object. For factual subjects, verify the few facts actually shown and keep invented imagery schematic.

Opening: introduce a situation through one visual symbol. Middle: transform that symbol or its surroundings to show a cause and a consequence. Turning point: change scale, arrangement, or viewpoint to reveal the key insight. Ending: resolve the symbol into one clear takeaway. Give each scene its own main task while retaining a line, shape, or spatial anchor across transitions.

Use a coherent editorial palette and a consistent drawing/material language. Support short captions with visual explanation; do not animate paragraphs as the scene. Separate foreground, action layer, and background so attention travels deliberately. Use controlled parallax and a small number of purposeful wipes or transformations. Add an original quiet music bed and context-appropriate sound cues; avoid synthetic narration unless requested. Keep captions in editable DOM text and implement deterministic CowartFilm seek. Output a single self-contained offline HTML film.
```

## Motion decisions and checks

- Write each shot as an action and reaction, not a caption topic. Let the protagonist, motif, or environment retain the consequence of the previous shot; a later return can reveal a changed scale, role, or understanding. A motivated cut can be as useful as a continuous morph.
- If characters are involved, establish proportions, a ground anchor, eye direction, pose channels, and prop attachments once. Use anticipation and a brief bodily reaction around mood changes. A close-up should reveal a performance or information, rather than simply enlarge a static face.
- Scale the story to duration. A 15-second film needs a few decisive changes; it cannot explain a full historical event at documentary depth.
- Let a recurring line become a path, horizon, divider, or timeline. This makes continuity tangible without forcing every scene to use the same composition.
- Assign slower movement to background layers and faster, shorter motion to local actions. Reveal text after the event it explains.
- Avoid implying unsupported dates, statistics, maps, or named entities. User-provided fictional subjects remain fiction.
- Review the film silently, check that the narrative still reads, then inspect transitions for accidental blank frames and overlapping captions.

## Painted or picture-book direction

When the user/reference calls for this look, build recognizable solid silhouettes with a small palette, irregular ink contours, selective translucent color/shading, and quiet paper texture. Keep the action layer clearer than the background. Cache texture/stamps during initialization and use object-keyed seeded roughness; optional slow line boil must not make important text or faces vibrate. Use a foreground edge, page flap, or painted stroke as a motivated occluder only when it suits the scene. Important copy stays in DOM even when the illustration is painted on Canvas.

Apply the rig, material, camera, and handoff guidance in [directing.md](directing.md). That guidance adapts PDoomVideo's production ideas to Cowart; the reference's character, soundtrack, p5.brush stack, and text-light music-video rule are not defaults for a GPT-authored explanatory film.

Public inspiration: source-linked coded narrative and historical films, catalogued in [sources.md](sources.md). The recipe above is an original short-film adaptation, not the long-form creator prompt.
