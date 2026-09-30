// This function is also serialized into the first inline widget script. Keep it
// self-contained so diagnostics run before the SDK and React bundles execute.
export function installCowartStartupDiagnostics(appVersion) {
  if (globalThis.__COWART_REPORT_STARTUP__) return

  const startedAt = Date.now()
  const stages = new Set([
    'html_loaded', 'sdk_missing', 'bridge_connecting', 'bridge_ready',
    'bridge_failed', 'bridge_timeout', 'tool_result_received',
    'tool_result_missing_target', 'frontend_started', 'storage_waiting',
    'storage_target_ready', 'storage_target_timeout', 'canvas_load_started',
    'canvas_state_loaded', 'canvas_load_failed', 'canvas_mounted',
    'script_error', 'unhandled_rejection'
  ])
  const seen = new Set()
  const events = []
  let mounted = false

  function report(stage) {
    if (mounted || !stages.has(stage) || seen.has(stage)) return
    seen.add(stage)
    const event = { stage, elapsedMs: Math.max(0, Date.now() - startedAt) }
    events.push(event)
    // Codex 26.928's desktop log only captures sandbox warnings and errors.
    // Emit each startup milestone once; never include paths, payloads or raw errors.
    const level = /failed|timeout|missing|error|rejection/.test(stage) ? 'error' : 'warn'
    try {
      console[level](`[Cowart startup] version=${appVersion} stage=${stage} elapsedMs=${event.elapsedMs}`)
    } catch (_error) {
      // Diagnostics must not prevent the canvas from starting.
    }
    if (stage === 'canvas_mounted') {
      mounted = true
      window.removeEventListener('error', onScriptError)
      window.removeEventListener('unhandledrejection', onUnhandledRejection)
    }
  }

  function onScriptError() { report('script_error') }
  function onUnhandledRejection() { report('unhandled_rejection') }

  globalThis.__COWART_STARTUP__ = { version: appVersion, events }
  globalThis.__COWART_REPORT_STARTUP__ = report
  window.addEventListener('error', onScriptError)
  window.addEventListener('unhandledrejection', onUnhandledRejection)
  report('html_loaded')
}

export function reportCowartStartup(stage) {
  globalThis.__COWART_REPORT_STARTUP__?.(stage)
}
