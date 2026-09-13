const DB_NAME = 'pocket-python'
const DB_VERSION = 1

let dbPromise = null

function openDb() {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains('drafts')) {
        db.createObjectStore('drafts')
      }
      if (!db.objectStoreNames.contains('progress')) {
        db.createObjectStore('progress')
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings')
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

function requestToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function getDraft(problemId) {
  const db = await openDb()
  const tx = db.transaction('drafts', 'readonly')
  const value = await requestToPromise(tx.objectStore('drafts').get(problemId))
  return value ?? null
}

export async function saveDraft(problemId, code) {
  const db = await openDb()
  const tx = db.transaction('drafts', 'readwrite')
  await requestToPromise(tx.objectStore('drafts').put(code, problemId))
}

export async function clearDraft(problemId) {
  const db = await openDb()
  const tx = db.transaction('drafts', 'readwrite')
  await requestToPromise(tx.objectStore('drafts').delete(problemId))
}

export async function getProgress() {
  const db = await openDb()
  const tx = db.transaction('progress', 'readonly')
  const value = await requestToPromise(tx.objectStore('progress').get('solved'))
  return Array.isArray(value) ? value : []
}

export async function markSolved(problemId) {
  const solved = await getProgress()
  if (!solved.includes(problemId)) {
    solved.push(problemId)
  }
  const db = await openDb()
  const tx = db.transaction('progress', 'readwrite')
  await requestToPromise(tx.objectStore('progress').put(solved, 'solved'))
  return solved
}

export async function isSolved(problemId) {
  const solved = await getProgress()
  return solved.includes(problemId)
}

export async function unmarkSolved(problemId) {
  const solved = (await getProgress()).filter((id) => id !== problemId)
  const db = await openDb()
  const tx = db.transaction('progress', 'readwrite')
  await requestToPromise(tx.objectStore('progress').put(solved, 'solved'))
  return solved
}

export async function clearProgress() {
  const db = await openDb()
  const tx = db.transaction('progress', 'readwrite')
  await requestToPromise(tx.objectStore('progress').put([], 'solved'))
  return []
}

export async function clearAllDrafts() {
  const db = await openDb()
  const tx = db.transaction('drafts', 'readwrite')
  await requestToPromise(tx.objectStore('drafts').clear())
}

export async function getAllDrafts() {
  const db = await openDb()
  const tx = db.transaction('drafts', 'readonly')
  const store = tx.objectStore('drafts')
  const keys = await requestToPromise(store.getAllKeys())
  const values = await requestToPromise(store.getAll())
  const drafts = {}
  keys.forEach((key, i) => {
    if (typeof values[i] === 'string') drafts[key] = values[i]
  })
  return drafts
}

/** Build a portable transfer token (solved + drafts). */
export async function exportTransferCode({ includeDrafts = true } = {}) {
  const solved = await getProgress()
  const payload = {
    v: 1,
    app: 'pocket-python',
    solved,
    drafts: includeDrafts ? await getAllDrafts() : {},
    at: Date.now(),
  }
  const json = JSON.stringify(payload)
  const b64 = btoa(unescape(encodeURIComponent(json)))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '')
  return `PP1.${b64}`
}

function decodeTransferCode(code) {
  const raw = (code || '').trim()
  if (!raw) throw new Error('Paste a transfer code first.')
  const body = raw.startsWith('PP1.') ? raw.slice(4) : raw
  const padded = body.replaceAll('-', '+').replaceAll('_', '/')
  const pad = (4 - (padded.length % 4)) % 4
  const b64 = padded + '='.repeat(pad)
  const json = decodeURIComponent(escape(atob(b64)))
  const data = JSON.parse(json)
  if (!data || data.app !== 'pocket-python' || !Array.isArray(data.solved)) {
    throw new Error('That does not look like a Pocket Python transfer code.')
  }
  return data
}

/**
 * Apply a transfer token.
 * mode: 'replace' overwrites local solved/drafts; 'merge' unions solved and
 * keeps the local draft when both exist.
 */
export async function importTransferCode(code, { mode = 'replace' } = {}) {
  const data = decodeTransferCode(code)
  const incomingSolved = data.solved.filter((id) => typeof id === 'string')
  const incomingDrafts = data.drafts && typeof data.drafts === 'object' ? data.drafts : {}

  let solved
  if (mode === 'merge') {
    const local = new Set(await getProgress())
    incomingSolved.forEach((id) => local.add(id))
    solved = [...local]
  } else {
    solved = incomingSolved
  }

  const db = await openDb()
  {
    const tx = db.transaction('progress', 'readwrite')
    await requestToPromise(tx.objectStore('progress').put(solved, 'solved'))
  }
  {
    const tx = db.transaction('drafts', 'readwrite')
    const store = tx.objectStore('drafts')
    if (mode === 'replace') {
      await requestToPromise(store.clear())
    }
    for (const [id, draft] of Object.entries(incomingDrafts)) {
      if (typeof draft === 'string') {
        if (mode === 'merge') {
          const existing = await requestToPromise(store.get(id))
          if (existing) continue
        }
        await requestToPromise(store.put(draft, id))
      }
    }
  }

  return {
    solved,
    draftCount: Object.keys(incomingDrafts).length,
  }
}
