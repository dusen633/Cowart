# 动态字体 — `kinetic-type`

Make the words carry the motion and the meaning. Use a restrained print-like composition: one strong display face from an available system font stack, supporting small text, one accent color, and deliberate negative space. Keep Chinese line breaks and legibility intact rather than staggering every character indiscriminately.

## Original prompt recipe

```text
Turn [the user's message] into a [duration]-second moving typographic composition at [width] × [height]. Choose a short readable sequence from the supplied copy; preserve required names and claims. Establish one graphic rule that connects the scenes, such as a line becoming a bracket or a word becoming a window. Build tension with a restrained lead-in, let a key phrase take the frame, then resolve to one memorable sentence.

Use a clear baseline grid and [brand palette or two neutrals plus one accent]. Give each phrase a distinct directional move: unfold, crop, slide through a mask, or change scale. Treat typography as a physical object only on selected accents; reserve small overshoots for those events. Supporting rules and labels respond slightly later. Hold complete phrases long enough to read at the target frame size. Leave the final copy settled and unobstructed.

Create an original sparse pulse bed plus small tick or thump accents connected to phrase arrivals. Do not cover every beat with a movement. Use the Cowart film runtime contract, deterministic seek, embedded assets, and DOM text that remains editable. The result is a single offline HTML film, with no decorative player baked into the embedded stage.
```

## Motion decisions and checks

- Plan the typography as a sequence of physical/spatial changes. For example, a baseline draws in, a key word catches on it, its counter opens into the next composition, then the same line settles under the closing phrase. Adapt this to the copy rather than reusing the example as a stock sequence.
- Keep an entry/exit anchor for each word block or mask, and connect adjacent shots through it. Change framing or scale only when it changes emphasis. Leave the full phrase intact during its reading window; Chinese copy often works better in phrase groups than in a cascade of isolated glyphs.
- Let a word's meaning suggest its movement. Choose one primary transformation per phrase and make adjacent shots inherit a line, word block, or mask.
- Use a short anticipation before a major arrival, then give viewers a quiet reading window. A full phrase should not disappear while its last characters are still entering.
- On a portrait target, reduce phrase length and use vertical rhythm; on a wide target, use the full width without stretching glyphs.
- Preserve contrast and text edges during the strongest movement. Avoid multiple repeated blurs, unrelated neon colors, and camera shake that makes the words unreadable.
- Inspect the densest phrase at the actual target dimensions, and test text edits followed by seeking.

Public inspiration: an author-published typographic identity bumper and continuous UI morph work, documented in [sources.md](sources.md). This recipe is Cowart's own brief, not a copied creator prompt.
