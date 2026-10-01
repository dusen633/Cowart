# Directing an HTML film in Codex

Use this guide to turn a brief into a film whose craft is visible in the rendered frames. Apply the chosen style and user references; hand-painted characters are one option, not the default for every subject. These are Cowart's own production instructions, informed by the source inspection recorded in [sources.md](sources.md).

## Scale the production

For a quick greeting, logo sting, or small edit, use a compact note and one or two events. For a 10–20 second film, a few developed shots usually serve the subject better than many shallow cuts. For longer work, group shots into sequences with a setup, change, and payoff. Shot count follows what the viewer can understand, not a fixed template. Honor an explicit request for speed by reducing scope, while keeping the main action and ending intentional.

Make the production decisions concrete before writing scene code:

- **Intent:** what the viewer should understand or feel, expressed in one sentence.
- **Visual system:** design-space size, palette, light, material, type hierarchy, recurring subject, and its proportions/anchors.
- **Timeline:** total seconds, major event times, reading windows, and final hold. If supplied music has timed cues, use those cues; otherwise choose a beat grid and phrasing that support this film. Do not inherit a reference's BPM or song duration.
- **Shot table:** cover the whole duration, including transition windows. The last resting composition must already exist before `duration - 1/30`, not appear only at the unencoded endpoint.

| Time | Visible action and consequence | Composition / camera | Copy / hold | Handoff / sound |
| --- | --- | --- | --- | --- |
| start–end | Subject does X; Y changes because of it | Focus, framing, camera endpoints | Required DOM copy and reading interval | Persistent anchor or cover point; cue time |

Use action verbs such as catches, folds, threads, compresses, reveals, overtakes, or assembles. “Beautiful particles,” “cinematic transition,” and “show the next feature” leave the hardest decisions unresolved. Name the actual object, trajectory, result, and cut point.

## Make a scene, then develop it

A narrative or product shot needs an environment or relationship that changes: a drawer opens to expose a capability; a token passes through a machine and comes out organized; a character loses balance, catches itself, and reacts. Establish enough context to make the result legible. Keep an identifiable subject across changes. Revisit a composition with a changed state when that produces an escalation or payoff.

Typography can itself be the subject: a word unfolds into a bridge, a letter counter becomes a window, or a line from one phrase becomes the next baseline. Preserve the supplied message. For a factual explainer, geometric diagrams may be more appropriate than characters, and the visible process must still have a consequence.

Design a hero frame with a clear silhouette, useful negative space, and a controlled hierarchy. Check it at the real viewport size. Background detail should establish scale, material, or story rather than compete with the hero. Avoid making every scene a new centered title over an unrelated animated background unless that is the user's intended style.

## Give motion a performance

Lay out the action's anticipation, main move/contact, reaction, and settling/hold on the timeline. The main event owns attention. Supporting pieces respond with delays or different amplitudes that follow its cause. A heavy object, elastic ribbon, and paper flap should have different acceleration and recovery.

For a character or expressive object, define a reusable rig in local coordinates:

- A stable root/ground point, body proportions, pivots, and contact shadow.
- Pose channels for translation, rotation, squash/stretch, limbs, gaze, and expression. Preserve identity across poses and camera scales.
- Prop attachments in hand/object space, so held objects follow their pivot instead of sliding independently.
- A motivated change of expression: gaze or anticipation, blink/compression, a short reaction, then the new face. Do not replace one static emoji with another as the entire performance.
- Ground contact, occlusion, and momentum. Keep planted feet and shadows anchored; deform near the applied force rather than scaling every part around the frame center.

These channels can drive SVG groups, Canvas geometry, or DOM transforms. Choose the simplest renderer that gives the needed silhouette and performance. A film about software need not invent a mascot; apply the same rules to its hero surface, cursor, and result.

## Use a camera for a reason

A camera move should reveal information, follow an action, change perceived scale, or set up the next shot. Record its start/end focal point and scale. Use foreground/background parallax when the scene has depth. Keep text and important faces readable during the strongest move, and allow a stable hold after it. Stillness is a valid choice during reading or a deliberate pause.

Use one consistent world-to-screen transform for world-space geometry and editable DOM copy. Place captions intended to stay on screen outside that transform. Separate the world, foreground occluders, transition layer, and captions by an explicit paint order; a reveal or curtain must cover the intended layers, including copy, rather than exposing stray labels over it.

## Design the handoff between shots

For every boundary, decide what carries attention across it:

- **Continuous action:** a falling object enters the next setting with the same direction and speed.
- **Match transformation:** the exiting circle and entering lens share a center/size at the join, then develop into the new subject.
- **Camera connection:** a push into a detail becomes a pullback from that detail in a new scale/context.
- **Motivated occlusion:** a flap, ink stroke, foreground object, or iris covers the old composition; switch the scene only at full coverage, then reveal the new composition.
- **Purposeful cut:** an action or music cue justifies a cut, and the next framing preserves the intended gaze/direction. A continuous morph is not mandatory.

Record the exit and entry anchor positions, scale, direction, color/material, and transition interval. For a cover/reveal, record the exact swap time and which layers are covered. Evaluate both shots at that time to establish the match; do not rely on having played the previous shot. Repeated generic fades do not supply this spatial relationship.

## Add material without sacrificing the subject

For hand-drawn or painted briefs, separate silhouette, flat color, shade/wash, sparse texture, and outline. Keep the character/hero solid enough to read, with softer backgrounds and restrained pigment accumulation near chosen edges. Use a limited harmonious palette and a small family of line weights. A full-frame noise filter by itself does not create a painted object.

Build static paper, grain, hatching patches, or brush stamps once with a fixed seed and reuse them. Place roughness along an object's contour or material, not as indiscriminate jitter on position and text. Optional line boil can change at a slower keyed cadence while pose motion stays on the 30 FPS grid; derive each object's perturbation from its identity and the selected time bucket. Camera/visibility changes must not shift another object's random sequence.

For clean product work, prioritize geometry, contact shadows, coherent light, and subtle highlights instead. Do not add watercolor texture, bloom, grain, or wobble just because the reference used it. Detail should express the chosen material.

## Build with explicit contracts

Codex should carry the production through in the current task using named data and local helpers. A compact scene specification and reusable rig reduce drift between shots more reliably than asking a model to “be more cinematic.” Do not require a particular GPT model, reasoning setting, Claude tool, or delegation workflow.

Use an ordered shot list with `start`, `end`, and `render(globalTime, localTime, shotDuration)`, plus named event/transition data. Keep helpers private or namespaced. Validate that intervals are ordered and cover the declared duration. Give the endpoint to the last shot explicitly. During each render, clear the drawing surface and reset transforms/alpha/clips; set all relevant DOM visibility and styles, including inactive shots. A frame must reconstruct its own complete visual state.

Keep asset/geometry preparation separate from frame evaluation. Cache immutable assets and pooled nodes; avoid per-frame allocations of full-resolution textures, large DOM trees, or thousands of brush shapes. Measure the busiest shot and transition in the actual browser when possible. Prefer a few convincing forms with precise motion over unbounded detail that makes preview stutter. A source renderer's seconds-per-frame offline allowance is not a Widget playback budget.

Use the existing [runtime contract](runtime-contract.md) for the master clock, seek, audio, messages, and export. Native Canvas/SVG/DOM plus original procedural materials usually suffice. If a requested effect needs a library, use it only when an appropriate redistributable bundle is actually available and can be embedded; do not add CDN, `node_modules`, remote-font, Chrome, or ffmpeg dependencies to the deliverable. Important words remain DOM text even when the illustration is on Canvas.

## Compose sound from the same events

Design the backing bed's rhythm/harmony or atmosphere, main accents, a peak, and a short resolved ending. Give the motion room: not every object needs a ping, and not every beat needs a bounce. A sparse sustained texture may suit a quiet film; an energetic one needs phrasing and changes in dynamics/timbre, not a single tone repeated at full volume.

Store event times once and use them for both motion and offline audio synthesis/mixing. Give attacks/releases and a little headroom so impacts are legible without clipping. The complete `renderAudio` result includes music, effects, and any desired embedded-clip audio once. Do not borrow the reference repository's song or add narration unless requested.
