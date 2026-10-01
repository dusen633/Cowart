# Cowart HTML film runtime

The generated film is a complete HTML document with inline styles, JavaScript, and embedded assets. It renders without a server or a network connection. Match the chosen holder's aspect ratio in a fixed design-space stage, then scale the stage proportionally to its viewport. Never stretch the artwork independently along x/y.

## Required API and behavior

Expose this object after initialization:

```js
window.CowartFilm = {
  duration: 15,             // finite seconds, actual film duration
  seek(seconds) {},         // draw immediately or return a Promise resolving after the frame is ready
  ready: Promise.resolve(), // optional asynchronous asset/runtime initialization
  play() {},                // continue from currentTime; replay if at the end
  pause() {},               // stop visuals and audio, retain currentTime
  setMuted(boolean) {},    // affects all sound sources
  renderAudio(options) {}, // return a full-length AudioBuffer, including BGM/SFX
};
```

Provide read-only `currentTime`, `playing`, and `muted` getters as well. Render the initial composition at time 0, paused and unmuted by default. The container applies any explicitly saved mute preference before playback. A seek retains playing/paused state except at the end, where playback stops. There must be one master timeline; seeking backward and forward to the same time gives the same frame, including particles, lights, camera, and background. Paused native Web Animations may be controlled with `animation.currentTime = seconds * 1000`; all other animated state is recomputed in `renderFrame(seconds)`. Do not overwrite editable text during frame updates.

Use a 30 FPS frame grid for both playback drawing and seeking: `Math.min(duration, Math.max(0, Math.round(seconds * 30) / 30))`. The preview controller and exporter use the same quantization. All render state must derive from these seconds; do not use `Date.now()`, wall-clock `performance.now()`, unseeded randomness, or network fetches inside `renderFrame`. The master clock may use performance.now() for playback timing, but frame content must not.

Initialization may be asynchronous: expose an optional `ready` Promise and resolve it only when the timeline and embedded assets are ready. If `seek()` starts asynchronous work (canvas rendering, media decode or style updates), return a Promise resolving only after it completes. An exported frame must never depend on a fire-and-forget callback. Keep normal browser initialization callbacks available; pause the master timeline instead of globally disabling requestAnimationFrame.

For Canvas simulations, either compute positions analytically or reset to a seeded initial state and advance at a fixed simulation step to the requested time. A cache can accelerate seeking, but its output must match the uncached path. User editing or viewport resizing must not advance the timeline.

## Parent iframe protocol

Accept commands only when `event.source === window.parent`. Cowart's srcdoc iframe may have an opaque origin, so the source-window check is essential. Every payload uses `channel: "cowart-film"` and `type: "command"`. All command arguments use **`value`**, not `seconds` or `muted`.

```js
{ channel: "cowart-film", type: "command", command: "play" }
{ channel: "cowart-film", type: "command", command: "pause" }
{ channel: "cowart-film", type: "command", command: "seek", value: 3.25 }
{ channel: "cowart-film", type: "command", command: "mute", value: true }
{ channel: "cowart-film", type: "command", command: "status" }
```

After initialization, every command, and about every 100 ms while playing, send the parent:

```js
window.parent.postMessage({
  channel: "cowart-film",
  type: "status",
  duration: 15,
  currentTime: 3.25,
  playing: true,
  muted: false,
}, "*");
```

The `"*"` target is required for an opaque parent/child configuration; the payload contains only playback state. Do not send page content, project paths, credentials, or unrelated messages. An initial status may arrive before Cowart attaches listeners, so handle the `status` command too.

## Inline master-clock template

Copy this factory into the generated HTML and call it after defining the film's `renderFrame` function and audio adapter. Customize the rendering and score for the brief. The audio hooks are `play(time, muted)`, `pause()`, `seek(time, playing, muted)`, and `setMuted(muted, time, playing)`; asynchronous failures must not stop visual playback.

```js
function createCowartFilm({ duration, renderFrame, audio = {} }) {
  if (!Number.isFinite(duration) || duration <= 0 || typeof renderFrame !== "function") {
    throw new Error("A film needs a finite duration and renderFrame(seconds).");
  }
  let time = 0, playing = false, muted = false;
  let baseTime = 0, baseStamp = performance.now(), raf = 0, lastStatus = -Infinity;
  const subscribers = new Set();
  const clamp = (value) => Math.max(0, Math.min(duration, value));
  const readClock = () => playing
    ? clamp(baseTime + (performance.now() - baseStamp) / 1000) : time;
  const state = () => ({ duration, currentTime: time, playing, muted });
  const emit = () => {
    const next = state();
    if (window.parent !== window) {
      window.parent.postMessage({ channel: "cowart-film", type: "status", ...next }, "*");
    }
    for (const listener of subscribers) listener(next);
  };
  const sound = (method, ...args) => {
    try {
      Promise.resolve(audio[method]?.(...args)).catch((error) => {
        console.warn("Film audio needs a permitted user gesture or a supported audio device.", error);
      });
    } catch (error) { console.warn("Film audio unavailable.", error); }
  };
  const stopLoop = () => { cancelAnimationFrame(raf); raf = 0; };
  const frameTime = (value) => clamp(Math.round(value * 30) / 30);
  const draw = () => renderFrame(frameTime(time));
  function tick(now) {
    if (!playing) return;
    time = clamp(baseTime + (now - baseStamp) / 1000);
    draw();
    if (time >= duration) {
      playing = false;
      raf = 0;
      sound("pause");
      emit();
      return;
    }
    if (now - lastStatus >= 100) { lastStatus = now; emit(); }
    raf = requestAnimationFrame(tick);
  }
  const film = {
    duration,
    get currentTime() { return readClock(); },
    get playing() { return playing; },
    get muted() { return muted; },
    seek(value) {
      if (!Number.isFinite(value)) { emit(); return; }
      time = frameTime(value);
      baseTime = time;
      baseStamp = performance.now();
      if (time >= duration) { playing = false; stopLoop(); }
      const rendered = draw();
      sound("seek", time, playing, muted);
      emit();
      return rendered;
    },
    play() {
      if (playing) { emit(); return; }
      if (time >= duration) time = 0;
      playing = true;
      baseTime = time;
      baseStamp = performance.now();
      draw();
      sound("play", time, muted);
      stopLoop();
      raf = requestAnimationFrame(tick);
      emit();
    },
    pause() {
      time = readClock();
      playing = false;
      stopLoop();
      const rendered = draw();
      sound("pause");
      emit();
      return rendered;
    },
    setMuted(value) {
      if (typeof value !== "boolean") { emit(); return; }
      time = readClock();
      muted = value;
      sound("setMuted", muted, time, playing);
      emit();
    },
    renderAudio(options) {
      if (typeof audio.render !== "function") throw new Error("The film needs an offline audio renderer for MP4 export.");
      return audio.render(options);
    },
    subscribe(listener) {
      subscribers.add(listener);
      listener(state());
      return () => subscribers.delete(listener);
    },
  };
  window.CowartFilm = film;
  window.addEventListener("message", (event) => {
    const data = event.data;
    if (event.source !== window.parent || !data || data.channel !== "cowart-film" || data.type !== "command") return;
    switch (data.command) {
      case "play": film.play(); break;
      case "pause": film.pause(); break;
      case "seek": film.seek(data.value); break;
      case "mute": film.setMuted(data.value); break;
      case "status": time = readClock(); emit(); break;
    }
  });
  window.addEventListener("pagehide", () => film.pause());
  film.ready = Promise.resolve(draw());
  emit();
  return film;
}
```

## Sound tied to the same clock

Use one master gain or one combined score buffer so mute covers every source. Prefer an original synthesized backing bed plus a few timed effects. All audio adapters must stop old nodes before scheduling new ones; play/resume starts at the current film offset; a paused seek is silent. Never schedule sounds inside `renderFrame`.

One reliable short-film option is to generate a mono `AudioBuffer` from a deterministic sample function and then play that buffer from the timeline offset. The sample function can sum a backing bed and impact/whoosh envelopes at the brief's event times. It must produce finite samples and keep peaks below clipping. Adapt the notes, rhythm, texture, and cue times to the selected style; do not reuse a generic loop uncritically.

```js
function createFilmScore(duration, sampleAt) {
  let context, master, buffer, source, revision = 0;
  function stop() {
    revision += 1;
    if (source) {
      try { source.stop(); } catch (_) {}
      source.disconnect();
      source = null;
    }
  }
  function prepare() {
    if (context) return;
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) throw new Error("Web Audio is unavailable.");
    context = new Context();
    master = context.createGain();
    master.gain.value = 0.7;
    master.connect(context.destination);
    const rate = context.sampleRate;
    buffer = context.createBuffer(1, Math.ceil(duration * rate), rate);
    const samples = buffer.getChannelData(0);
    for (let index = 0; index < samples.length; index += 1) {
      const value = sampleAt(index / rate);
      samples[index] = Number.isFinite(value) ? Math.max(-0.95, Math.min(0.95, value)) : 0;
    }
  }
  async function start(time, muted) {
    const requestedAt = performance.now();
    stop();
    if (muted || time >= duration) return;
    prepare();
    const requested = revision;
    await context.resume();
    if (requested !== revision) return;
    if (context.state !== "running") throw new Error("Click the film's sound control to enable audio.");
    const offset = Math.max(0, time + (performance.now() - requestedAt) / 1000);
    if (offset >= duration) return;
    source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(master);
    source.start(0, offset);
  }
  return {
    render({ sampleRate = 48000, numberOfChannels = 2 } = {}) {
      const result = new AudioBuffer({ numberOfChannels, length: Math.ceil(duration * sampleRate), sampleRate });
      for (let channel = 0; channel < numberOfChannels; channel++) {
        const samples = result.getChannelData(channel);
        for (let index = 0; index < samples.length; index++) {
          const value = sampleAt(index / sampleRate);
          samples[index] = Number.isFinite(value) ? Math.max(-0.95, Math.min(0.95, value)) : 0;
        }
      }
      return result;
    },
    play: start,
    pause: stop,
    seek(time, playing, muted) { return playing ? start(time, muted) : stop(); },
    setMuted(muted, time, playing) { return playing ? start(time, muted) : stop(); },
  };
}
```

`AudioContext.resume()` and media playback may be restricted without a trusted user activation. Keep the visual clock working. The canvas container must call `play` or `setMuted` synchronously from its user-operated controls when same-origin access is available, preserving the audio user gesture. Do not add an audio-unlock button inside the film HTML or claim audible playback merely because a promise was called. If using media elements too, mirror `muted`, `currentTime`, pause, and resume for them and catch rejected play promises.

## MP4 audio export

Use the same finite `duration` in the playback API, soundtrack and Cowart metadata. The exporter rejects mismatches instead of truncating or duplicating content. It awaits runtime readiness, font/image decode (including CSS backgrounds), each seek, and layout before capturing a frame. Pending work has a bounded timeout and supports cancellation.

For embedded `<video>`, use an inline/local source and set `video.currentTime` from the film timeline in `seek()`. Pause the element rather than letting its native playback clock run. Cowart decodes the source at that exact timestamp through WebCodecs, then paints the decoded frame in the capture clone while preserving transforms, opacity and object-fit. Include any desired audio from the embedded clip in `renderAudio`, with its offsets/fades, so it is mixed once with the score. Do not rely on native video playback during export. Dynamic streams and inaccessible sources are not supported.

Implement `CowartFilm.renderAudio({sampleRate: 48000, numberOfChannels: 2})` and return (or resolve to) an `AudioBuffer` covering exactly the film duration. Mix the same original background music and event effects used in playback at their timeline offsets. Audio export is independent of preview mute state, must not start playback, and must not require a user gesture. For embedded audio, decode and mix it with an `OfflineAudioContext`; for synthesized scores use the deterministic sample function, as in the factory above. Do not use timer-driven effects as the only source of export audio.

Cowart renders MP4 in an isolated iframe, seeking each video frame and encoding H.264 video plus AAC audio at 30 FPS. The container offers “导出为影片” and saves a `.mp4` with music through the normal download tool. The HTML still contains no player UI. Existing score-based Web Audio films can use the exporter's offline graph adapter, but new films must provide the explicit audio export hook.

## Container controls and editable text

Use actual DOM text for important copy and stable `data-cowart-text-id` attributes. Animate style or a wrapper rather than rewriting text each frame. For partial reveals, prefer a clip/mask on the intact DOM text; for typing, preserve the editable full string in a copy model that is updated by edits.

The AI film container on the infinite canvas owns play/pause, progress, and mute controls. Generated and exported HTML contains only the film content and its playback API/message protocol: do not include a standalone control strip or player UI, even when `window.parent === window`. Cowart subscribes to playback status and sends commands to the existing iframe. Controls stay outside the film artwork and are not serialized into the HTML during text editing or export.

## Behavioral checks

- Call `seek(duration * 0.6)`, `seek(duration * 0.2)`, and `seek(duration * 0.6)`; compare the first and third frames.
- Play, pause, wait, then inspect `currentTime` and the frame. Neither should advance while paused.
- Seek while playing and confirm the next frame continues from the new position. Seek to the end; playback pauses. Press play; playback resumes at 0.
- Toggle mute while playing, then seek backward. Previous sources must be stopped, all audio must respect mute, and a paused scrub must stay silent.
- Edit a visible phrase, then seek across the scene; the edited phrase must remain.
- Load the exported HTML with network disabled and check embedded assets and the playback API. Test play/pause, progress, and mute through the canvas container; confirm the HTML contains no player controls.

Technical references checked on 2026-10-01: [MDN Animation.currentTime](https://developer.mozilla.org/en-US/docs/Web/API/Animation/currentTime), [MDN postMessage](https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage), and [MDN media/Web Audio autoplay](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay). The Cowart message protocol is an application contract, not a browser standard.
