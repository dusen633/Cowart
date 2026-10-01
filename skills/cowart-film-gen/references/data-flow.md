# 数据流动 — `data-flow`

Give information a visible identity and a causal route. A useful system film shows what enters, what changes, where it travels, and what the resulting state means. The result should explain the subject even when effects and sound are removed.

## Original prompt recipe

```text
Explain [system or process] through a [duration]-second motion film at [width] × [height]. Identify one input, the few transformations that matter, and one output. Represent them with a small set of geometric containers, directional paths, and labeled tokens. Derive color and shape from the provided references; keep categories consistent throughout.

Introduce the input with a readable label. Send a clearly identifiable token along a path. At each stage, show the transformation before releasing the next token. Reveal the output as the consequence of the journey, then pull the view back slightly to show the complete system. Each connection draws in the direction of travel; supporting labels and counters arrive after their related event. Keep idle nodes quiet.

Use a precise diagram-like layout with subtle depth, two neutrals and a small semantic accent palette. Camera movement may reveal scale but must settle for reading. A subtle pulse or soft background bed supports the timeline; small pings identify accepted events, with no sound burst during scrubbing. Any numbers must come from the user or verified sources; label illustrative values as examples. Keep labels in editable DOM text, seed particles, implement the CowartFilm control contract, and deliver one offline HTML file.
```

## Motion decisions and checks

- Show the operation on the token: split, route, filter, encode, merge, or assemble. A glow traveling between identical boxes is insufficient when the brief asks the viewer to understand what changes. Preserve token identity and category while its form evolves.
- Reuse a stage's path or port as the next shot's entry anchor. A pullback can reveal that a close-up was one part of a larger system, with scale and position matched at the boundary. Restrict foreground activity to the meaningful route and hold the final system long enough to understand it.
- Use persistent token identity: the viewer should follow the same token through a change instead of guessing what newly appeared particles represent.
- Limit simultaneous activity. A dense network can become background context while one chosen route carries the main event.
- Animate a path by its arc length or a deterministic Bézier parameter, not by unrelated x/y easings. A directional trail should follow that route.
- For a portrait holder, use stacked stages; for a wide holder, use a horizontal progression. Keep labels readable at the actual selected size.
- Check that every label matches the visible state, edge direction is unambiguous, and repeated seeking recreates identical token positions. Watch a muted pass to confirm the explanation stands alone.

Public inspiration: source-linked process explainers in [sources.md](sources.md). This recipe is an original Cowart systems style, not a claim that “data-flow” is a named popular prompt genre.
