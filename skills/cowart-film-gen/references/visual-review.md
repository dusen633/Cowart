# Visual review before insertion

Use the saved HTML and a browser facility available in the current session. Follow that facility's skill/API and session permissions. Set the viewport to the intended composition size, wait for `CowartFilm.ready` when present and font/image decode, pause playback, then await each `seek(time)` before inspecting. Keep playback controls in Cowart's container; a testing harness can live outside the deliverable.

## Sample what can fail

For a short single-action film, inspect the opening, peak, and ending plus a small sequence around the main move. For multiple shots, choose times from the shot/event table:

- First composition at 0 and the last encoded frame, `max(0, duration - 1/30)`; also check the API endpoint at `duration`.
- Each shot's established framing, main event, and settled reading/acting moment.
- Before, at, and after each boundary. At a cover/reveal, inspect full coverage and the first revealed composition. Check a few adjacent frames around a collision, expression change, or match transition, rather than one attractive still.
- The densest scene and strongest camera move at actual target dimensions.

Quantize sample times to the runtime's 30 FPS grid. Capture real rendered images through the browser/testing facility. If tools permit, assemble them into a contact sheet labeled with timestamp and shot ID; keep inspection files in the project's allowed output directory, separate from the single-file film. Native screenshot and DOM export capture may render some CSS differently: verify the export path when accessible, rather than treating a browser screenshot as proof of MP4 fidelity.

## Judge the images and the sequence

| Check | Evidence of a problem | Repair |
| --- | --- | --- |
| Focus and scale | Main action/face is too small; background dominates | Reframe or simplify; enlarge the meaningful silhouette |
| Action and consequence | Only captions/background change; unclear result | Add a visible event, reaction, or transformation to the subject |
| Performance | Everything shares one easing; expression snaps; held prop slides | Separate pose timing, define pivots/attachments, add a short reaction and hold |
| Continuity | Subject jumps at a join; motion reverses accidentally; stray caption leaks | Match boundary anchors/velocity and fix paint order or cover interval |
| Craft | Flat generic shapes despite a painted brief; grain obscures edges; incoherent shadow | Use a deliberate shape/material system, sparse texture, consistent lighting |
| Readability | Copy enters late, leaves early, is clipped, or moves during reading | Reduce copy, change line breaks/framing, give a complete phrase a stable window |
| Rhythm | Every beat is accented; long dead interval; ending is cut off | Respace events, introduce contrast in intensity, reserve a resolved final hold |
| Playback cost | Busiest frame stalls or repeatedly creates heavy assets | Cache textures/geometry and simplify supporting effects before sacrificing the hero |

When images reveal a defect, name the shot and timestamp, make the smallest useful repair, and inspect that moment plus affected joins again. Continue until meaningful observed defects are resolved. Do not keep broadening the review after checks pass, or claim the film matches a reference's polish without having seen the rendered frames.

## Check the runtime independently of appearance

1. Seek out of order, such as `0 → 0.7D → 0.2D → 0.7D → D`. Compare the two compositions at the repeated time, including DOM copy, pose, particles, camera, and texture. A paused seek must be silent.
2. Test play/pause/resume, seeking while playing, replay from the end, and mute/unmute through the real container controls when available. Check that one action does not start two timelines or duplicate audio nodes.
3. Edit a representative DOM label, seek backward/forward, and confirm the edit survives. Check world-space and screen-space text separately if both exist.
4. Check the full-length offline AudioBuffer: finite samples, music/effects present as intended, matching duration, and sensible levels. Listen through an available audio facility or container user gesture when possible; buffer existence alone does not establish audible preview.
5. If MP4 export testing is accessible, inspect decoded frames around a meaningful event and verify the audio track, cue alignment, and ending. This is particularly useful for new materials, embedded video, or effects near the DOM renderer's CSS limits. If only the source HTML was tested, say so.
6. Check that delivery is self-contained: inline scripts/styles, embedded assets, no runtime network/library build dependency, correct target dimensions, and no baked-in player UI. Inspect readiness/error handling rather than treating successful loading as a complete production check.

If a required testing facility is unavailable, preserve the finished film, complete the authorized insertion, and report the specific unperformed check. A successful insertion proves placement; a syntax/contract check proves only the property it tested. Neither substitutes for visual observation or listening.
