export function cowartAssetCacheKey(asset) {
  const { src = '', fileSize = '', mimeType = '', name = '' } = asset?.props || {}
  return [src, fileSize, mimeType, name].join('\u001f')
}

export function cowartBlobFromBase64(dataBase64, mimeType) {
  const base64 = String(dataBase64 || '')
  const chunks = []
  // Decode aligned pieces instead of allocating another full binary string
  // alongside a large MCP base64 result and its complete Blob.
  const chunkSize = 32768
  for (let offset = 0; offset < base64.length; offset += chunkSize) {
    const binary = atob(base64.slice(offset, offset + chunkSize))
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
    chunks.push(bytes)
  }
  return new Blob(chunks, { type: mimeType || 'application/octet-stream' })
}

// Blob URLs retain their complete file until revoked. Bound reads as well as
// retained URLs: one file may be requested by several shapes or export passes.
export function createCowartAssetObjectUrlCache({
  load,
  getKey = cowartAssetCacheKey,
  createObjectURL = (blob) => URL.createObjectURL(blob),
  revokeObjectURL = (url) => URL.revokeObjectURL(url),
  maxConcurrentLoads = 2
}) {
  const entries = new Map()
  const sourceKeys = new Map()
  const concurrency = Math.max(1, Math.floor(maxConcurrentLoads) || 1)
  let queue = []
  let activeLoads = 0

  function remove(entry) {
    if (entries.get(entry.key) !== entry) return
    entries.delete(entry.key)
    if (sourceKeys.get(entry.src) === entry.key) sourceKeys.delete(entry.src)
  }

  function invalidate(entry) {
    remove(entry)
    entry.controller.abort()
    if (entry.objectUrl) revokeObjectURL(entry.objectUrl)
    entry.resolve(null)
  }

  function pump() {
    while (activeLoads < concurrency && queue.length) {
      const entry = queue.shift()
      if (entries.get(entry.key) !== entry) continue
      activeLoads += 1
      Promise.resolve()
        .then(() => {
          if (entry.controller.signal.aborted) return null
          return load(entry.asset, entry.controller.signal)
        })
        .then((blob) => {
          // Removed assets, page changes and teardown may finish before the
          // host responds. Never create or retain a URL for that stale result.
          if (entries.get(entry.key) !== entry || entry.controller.signal.aborted) return
          if (!blob) {
            remove(entry)
            entry.resolve(null)
            return
          }
          entry.objectUrl = createObjectURL(blob)
          entry.resolve(entry.objectUrl)
        })
        .catch((error) => {
          if (entry.controller.signal.aborted) return
          remove(entry)
          entry.reject(error)
        })
        .finally(() => {
          activeLoads -= 1
          pump()
        })
    }
  }

  return {
    resolve(asset) {
      const key = getKey(asset)
      const cached = entries.get(key)
      if (cached) return cached.promise
      const src = asset?.props?.src
      const previous = entries.get(sourceKeys.get(src))
      if (previous) invalidate(previous)
      const entry = { key, src, asset, controller: new AbortController(), objectUrl: null }
      entry.promise = new Promise((resolve, reject) => Object.assign(entry, { resolve, reject }))
      entries.set(key, entry)
      sourceKeys.set(src, key)
      queue.push(entry)
      pump()
      return entry.promise
    },
    retain(assets) {
      const keys = new Set(assets.map(getKey))
      for (const entry of entries.values()) {
        if (!keys.has(entry.key)) invalidate(entry)
      }
      queue = queue.filter((entry) => entries.get(entry.key) === entry)
    },
    clear() {
      for (const entry of entries.values()) invalidate(entry)
      queue = []
    }
  }
}
