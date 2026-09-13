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
