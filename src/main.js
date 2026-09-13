import './style.css'
import { createEditor } from './editor.js'
import {
  getDraft,
  saveDraft,
  clearDraft,
  clearAllDrafts,
  getProgress,
  markSolved,
  unmarkSolved,
  clearProgress,
  exportTransferCode,
  importTransferCode,
} from './db.js'

const els = {
  backBtn: document.getElementById('back-btn'),
  progressLabel: document.getElementById('progress-label'),
  viewList: document.getElementById('view-list'),
  viewProblem: document.getElementById('view-problem'),
  problemList: document.getElementById('problem-list'),
  listEmpty: document.getElementById('list-empty'),
  searchInput: document.getElementById('search-input'),
  packFilter: document.getElementById('pack-filter'),
  btnClearProgress: document.getElementById('btn-clear-progress'),
  btnClearDrafts: document.getElementById('btn-clear-drafts'),
  btnExport: document.getElementById('btn-export'),
  btnImport: document.getElementById('btn-import'),
  transferModal: document.getElementById('transfer-modal'),
  transferClose: document.getElementById('transfer-close'),
  transferCode: document.getElementById('transfer-code'),
  transferDrafts: document.getElementById('transfer-drafts'),
  btnCopyCode: document.getElementById('btn-copy-code'),
  btnApplyCode: document.getElementById('btn-apply-code'),
  problemIndex: document.getElementById('problem-index'),
  problemDifficulty: document.getElementById('problem-difficulty'),
  problemSource: document.getElementById('problem-source'),
  problemTitle: document.getElementById('problem-title'),
  problemPrompt: document.getElementById('problem-prompt'),
  problemSignature: document.getElementById('problem-signature'),
  problemExamples: document.getElementById('problem-examples'),
  editorHost: document.getElementById('editor'),
  btnTab: document.getElementById('btn-tab'),
  btnOutdent: document.getElementById('btn-outdent'),
  btnReset: document.getElementById('btn-reset'),
  btnRun: document.getElementById('btn-run'),
  results: document.getElementById('results'),
  btnSolution: document.getElementById('btn-solution'),
  solutionPanel: document.getElementById('solution-panel'),
  solutionCode: document.getElementById('solution-code'),
  btnInsertSolution: document.getElementById('btn-insert-solution'),
  btnUnsolved: document.getElementById('btn-unsolved'),
  themeToggle: document.getElementById('theme-toggle'),
  progressFab: document.getElementById('progress-fab'),
  fabCount: document.getElementById('fab-count'),
  progressModal: document.getElementById('progress-modal'),
  progressClose: document.getElementById('progress-close'),
  progressCanvas: document.getElementById('progress-canvas'),
  statSolved: document.getElementById('stat-solved'),
  statTotal: document.getElementById('stat-total'),
  statPct: document.getElementById('stat-pct'),
  toast: document.getElementById('toast'),
}

const BASE = import.meta.env.BASE_URL || '/'
const PACKS = [
  { id: 'core', url: `${BASE}problems.json`, label: 'Arrays & hash-maps' },
  { id: 'growth', url: `${BASE}packs/growth.json`, label: 'Growth Track' },
]

let problems = []
let solved = []
let currentProblem = null
let editor = null
let worker = null
let runId = 0
let saveTimer = null
let solutionOpen = false
let disposeProgressScene = null
let progressSceneLoading = false

function currentTheme() {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme
  try {
    localStorage.setItem('pocket-python-theme', theme)
  } catch {
    /* ignore */
  }
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#0c0a09' : '#0F766E')
  if (els.themeToggle) {
    els.themeToggle.setAttribute(
      'aria-label',
      theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'
    )
  }
}

function showToast(text, ms = 1800) {
  els.toast.textContent = text
  els.toast.classList.remove('hidden')
  clearTimeout(showToast._t)
  showToast._t = setTimeout(() => {
    els.toast.classList.add('hidden')
  }, ms)
}

function updateProgress() {
  els.progressLabel.textContent = `${solved.length}/${problems.length}`
  if (els.fabCount) els.fabCount.textContent = String(solved.length)
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function formatValue(value) {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'string') return JSON.stringify(value)
  return JSON.stringify(value)
}

function packLabel(packId) {
  if (packId === 'core') return 'Core'
  if (packId === 'growth') return 'Growth'
  if (packId === 'mbpp') return 'MBPP'
  return packId || ''
}

async function loadProblems() {
  const all = []
  for (const pack of PACKS) {
    try {
      const res = await fetch(pack.url, { cache: 'default' })
      if (!res.ok) continue
      const data = await res.json()
      if (Array.isArray(data)) {
        data.forEach((p) => all.push({ ...p, packId: pack.id }))
      } else if (Array.isArray(data.problems)) {
        data.problems.forEach((p) => all.push({ ...p, packId: pack.id }))
      }
    } catch (err) {
      console.warn('Failed to load pack', pack.id, err)
    }
  }
  return all
}

function filteredProblems() {
  const q = (els.searchInput.value || '').trim().toLowerCase()
  const pack = els.packFilter.value
  const words = q ? q.split(/\s+/).filter(Boolean) : []
  return problems.filter((p) => {
    if (pack !== 'all' && p.packId !== pack) return false
    if (!words.length) return true
    const hay = `${p.title} ${p.prompt} ${p.fnName}`.toLowerCase()
    return words.every((w) => hay.includes(w))
  })
}

function ensureWorker() {
  if (worker) return worker
  worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' })
  worker.onmessage = (event) => {
    const msg = event.data
    if (!msg) return

    if (msg.type === 'status') {
      if (els.btnRun.disabled && msg.message === 'Loading Python runtime…') {
        setRunLabel('Loading…')
      }
      return
    }

    if (msg.type === 'result' && msg.id === runId) {
      finishRun(msg.result)
    }
  }
  worker.onerror = (err) => {
    console.error(err)
    if (els.btnRun.disabled) {
      finishRun({
        ok: false,
        error: 'The Python worker failed to start. Check your connection once, then try again.',
        results: [],
        passed: 0,
        total: 0,
      })
    }
  }
  return worker
}

function setRunLabel(text) {
  const label = els.btnRun.querySelector('.run-label')
  if (label) label.textContent = text
}

function showList() {
  currentProblem = null
  if (editor) {
    editor.destroy()
    editor = null
  }
  els.viewList.classList.remove('hidden')
  els.viewProblem.classList.add('hidden')
  els.backBtn.classList.add('hidden')
  els.results.classList.add('hidden')
  els.results.innerHTML = ''
  setSolutionOpen(false)
  renderList()
}

function renderList() {
  const items = filteredProblems()
  els.problemList.innerHTML = ''
  els.listEmpty.classList.toggle('hidden', items.length > 0)

  const limit = Math.min(items.length, 120)
  const frag = document.createDocumentFragment()

  for (let i = 0; i < limit; i += 1) {
    const problem = items[i]
    const index = problems.indexOf(problem) + 1
    const li = document.createElement('li')
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'problem-row'
    const isSolved = solved.includes(problem.id)
    btn.innerHTML = `
      <span class="row-index">${String(index).padStart(2, '0')}</span>
      <span class="row-main">
        <span class="row-title">${escapeHtml(problem.title)}</span>
        <span class="row-sub">${escapeHtml(packLabel(problem.packId))} · ${escapeHtml(problem.difficulty)}</span>
      </span>
      <span class="row-status ${isSolved ? 'solved' : problem.difficulty.toLowerCase()}">
        ${isSolved ? 'Solved' : 'Open'}
      </span>
    `
    btn.addEventListener('click', () => openProblem(problem.id))
    li.appendChild(btn)
    frag.appendChild(li)
  }

  els.problemList.appendChild(frag)

  if (items.length > limit) {
    const more = document.createElement('li')
    more.className = 'status-line'
    more.textContent = `Showing ${limit} of ${items.length}. Narrow the search to see more.`
    els.problemList.appendChild(more)
  }
}

function setSolutionOpen(open) {
  solutionOpen = open
  els.btnSolution.setAttribute('aria-expanded', String(open))
  els.btnSolution.textContent = open ? 'Hide solution' : 'Show solution'
  els.solutionPanel.classList.toggle('hidden', !open)
}

function closeProgressModal() {
  els.progressModal?.classList.add('hidden')
  if (disposeProgressScene) {
    disposeProgressScene()
    disposeProgressScene = null
  }
  if (els.progressCanvas) els.progressCanvas.innerHTML = ''
}

function openTransferModal(mode = 'export') {
  if (!els.transferModal || !els.transferCode) return
  els.transferModal.classList.remove('hidden')
  if (mode === 'export') {
    els.transferCode.value = ''
    els.transferCode.placeholder = 'Generating code…'
    els.transferCode.readOnly = true
    exportTransferCode({ includeDrafts: els.transferDrafts?.checked !== false })
      .then((code) => {
        els.transferCode.value = code
        els.transferCode.placeholder = 'PP1.…'
      })
      .catch((err) => {
        els.transferCode.placeholder = 'Failed to export'
        showToast(err?.message || 'Export failed')
      })
  } else {
    els.transferCode.value = ''
    els.transferCode.placeholder = 'Paste a PP1.… code from the other device'
    els.transferCode.readOnly = false
  }
  setTimeout(() => els.transferCode.focus(), 50)
}

function closeTransferModal() {
  els.transferModal?.classList.add('hidden')
}

async function openProgressModal() {
  if (!els.progressModal || !els.progressCanvas) return
  const total = problems.length
  const done = solved.length
  const pct = total ? Math.round((done / total) * 100) : 0

  if (els.statSolved) els.statSolved.textContent = String(done)
  if (els.statTotal) els.statTotal.textContent = String(total)
  if (els.statPct) els.statPct.textContent = `${pct}%`

  els.progressModal.classList.remove('hidden')
  els.progressCanvas.innerHTML = ''

  if (progressSceneLoading) return
  progressSceneLoading = true
  try {
    const { mountProgressScene } = await import('./progress-scene.js')
    // Modal just became visible; layout height is available now
    disposeProgressScene = mountProgressScene(els.progressCanvas, {
      solvedCount: done,
      totalCount: total,
    })
  } catch (err) {
    console.warn('progress scene failed', err)
    els.progressCanvas.innerHTML =
      '<div class="status-line">3D preview unavailable — you still have ' +
      `${done}/${total} solved.</div>`
  } finally {
    progressSceneLoading = false
  }
}

async function openProblem(problemId) {
  const problem = problems.find((p) => p.id === problemId)
  if (!problem) return

  currentProblem = problem
  const index = problems.findIndex((p) => p.id === problemId) + 1

  els.viewList.classList.add('hidden')
  els.viewProblem.classList.remove('hidden')
  els.backBtn.classList.remove('hidden')

  els.problemIndex.textContent = `${String(index).padStart(2, '0')} / ${String(problems.length).padStart(2, '0')}`
  els.problemDifficulty.textContent = problem.difficulty
  els.problemDifficulty.className = `difficulty ${problem.difficulty.toLowerCase()}`
  els.problemSource.textContent = packLabel(problem.packId)
  els.problemSource.classList.toggle('hidden', !problem.packId)
  els.problemTitle.textContent = problem.title
  els.problemPrompt.textContent = problem.prompt
  els.problemSignature.textContent = problem.signature

  els.problemExamples.innerHTML = (problem.examples || [])
    .map(
      (ex) =>
        `<li>Input: ${escapeHtml(ex.input)} → <span class="ex-out">Output: ${escapeHtml(ex.output)}</span></li>`
    )
    .join('')

  const draft = await getDraft(problem.id)
  const code = draft ?? problem.starter

  if (editor) editor.destroy()
  els.editorHost.innerHTML = ''
  editor = createEditor({
    parent: els.editorHost,
    doc: code,
    onChange: (value) => scheduleSave(problem.id, value),
  })

  els.results.classList.add('hidden')
  els.results.innerHTML = ''
  setRunLabel('Run')
  els.btnRun.disabled = false

  const hasSolution = Boolean(problem.solution)
  els.btnSolution.classList.toggle('hidden', !hasSolution)
  els.solutionCode.textContent = problem.solution || ''
  setSolutionOpen(false)
  updateUnsolvedButton()
}

function updateUnsolvedButton() {
  const isDone = Boolean(currentProblem && solved.includes(currentProblem.id))
  els.btnUnsolved?.classList.toggle('hidden', !isDone)
}

function scheduleSave(problemId, code) {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saveDraft(problemId, code).catch(() => {})
  }, 400)
}

function renderResults(result) {
  els.results.classList.remove('hidden')
  els.results.innerHTML = ''

  if (!result.ok && (!result.results || result.results.length === 0)) {
    const err = document.createElement('div')
    err.className = 'results-error'
    err.textContent = result.error || 'Something went wrong while running your code.'
    const header = document.createElement('div')
    header.className = 'results-header'
    header.innerHTML = `<span class="results-summary fail">Failed</span>`
    els.results.appendChild(header)
    els.results.appendChild(err)
    return
  }

  const passed = result.passed ?? 0
  const total = result.total ?? result.results.length
  const allPassed = result.ok && passed === total && total > 0

  const header = document.createElement('div')
  header.className = 'results-header'

  const summary = document.createElement('span')
  summary.className = `results-summary ${allPassed ? 'pass' : 'fail'}`
  summary.textContent = allPassed
    ? `All ${total} passed`
    : `${passed}/${total} passed`

  const ribbon = document.createElement('div')
  ribbon.className = 'results-ribbon'
  ribbon.setAttribute('aria-hidden', 'true')
  result.results.forEach((r) => {
    const seg = document.createElement('span')
    seg.className = r.passed ? 'pass' : 'fail'
    ribbon.appendChild(seg)
  })

  header.appendChild(summary)
  header.appendChild(ribbon)
  els.results.appendChild(header)

  if (result.error) {
    const err = document.createElement('div')
    err.className = 'results-error'
    err.textContent = result.error
    els.results.appendChild(err)
  }

  const list = document.createElement('ul')
  list.className = 'case-list'
  result.results.forEach((r) => {
    const li = document.createElement('li')
    li.className = 'case'
    const head = document.createElement('div')
    head.className = 'case-head'
    head.innerHTML = `
      <span class="case-dot ${r.passed ? 'pass' : 'fail'}" aria-hidden="true"></span>
      <span>${escapeHtml(r.label)}</span>
    `
    li.appendChild(head)

    if (!r.passed) {
      const detail = document.createElement('div')
      detail.className = 'case-detail'
      if (r.assert) {
        detail.innerHTML = `<div>${escapeHtml(r.assert)}</div><span class="actual-bad">${escapeHtml(r.error || 'Failed')}</span>`
      } else if (r.error) {
        detail.innerHTML = `<span class="actual-bad">${escapeHtml(r.error)}</span>`
      } else {
        detail.innerHTML = `
          <div>Input: ${escapeHtml(formatValue(r.args))}</div>
          <div class="expected-good">Expected: ${escapeHtml(formatValue(r.expected))}</div>
          <div class="actual-bad">Got: ${escapeHtml(formatValue(r.actual))}</div>
        `
      }
      li.appendChild(detail)
    } else if (r.assert) {
      const detail = document.createElement('div')
      detail.className = 'case-detail'
      detail.textContent = r.assert
      li.appendChild(detail)
    }

    list.appendChild(li)
  })
  els.results.appendChild(list)
}

function finishRun(result) {
  els.btnRun.disabled = false
  setRunLabel('Run')
  renderResults(result)

  if (result.ok && result.total > 0 && result.passed === result.total && currentProblem) {
    if (!solved.includes(currentProblem.id)) {
      markSolved(currentProblem.id)
        .then((next) => {
          solved = next
          updateProgress()
          updateUnsolvedButton()
          showToast('Solved. Saved on this device.')
        })
        .catch(() => {})
    }
  }
}

function runCurrent() {
  if (!currentProblem || !editor) return

  const code = editor.getValue()
  saveDraft(currentProblem.id, code).catch(() => {})

  runId += 1
  const id = runId

  els.btnRun.disabled = true
  setRunLabel('Running…')
  els.results.classList.remove('hidden')
  els.results.innerHTML = '<div class="status-line">Starting Python…</div>'

  const mode = currentProblem.asserts ? 'asserts' : 'cases'
  const w = ensureWorker()
  w.postMessage({
    type: 'run',
    id,
    code,
    fnName: currentProblem.fnName,
    mode,
    tests: currentProblem.tests || [],
    asserts: currentProblem.asserts || [],
  })
}

async function init() {
  try {
    solved = await getProgress()
  } catch {
    solved = []
  }

  try {
    problems = await loadProblems()
  } catch (err) {
    console.error(err)
  }

  if (!problems.length) {
    els.problemList.innerHTML =
      '<li class="status-line">Could not load problems. Refresh once while online.</li>'
    updateProgress()
    return
  }

  updateProgress()
  renderList()

  els.backBtn.addEventListener('click', showList)
  els.btnRun.addEventListener('click', runCurrent)
  els.btnTab.addEventListener('click', () => editor?.indent())
  els.btnOutdent.addEventListener('click', () => editor?.outdent())
  els.btnReset.addEventListener('click', async () => {
    if (!currentProblem || !editor) return
    editor.setValue(currentProblem.starter)
    await clearDraft(currentProblem.id)
    showToast('Starter code restored')
  })
  els.btnSolution.addEventListener('click', () => setSolutionOpen(!solutionOpen))
  els.btnUnsolved?.addEventListener('click', async () => {
    if (!currentProblem) return
    solved = await unmarkSolved(currentProblem.id)
    updateProgress()
    updateUnsolvedButton()
    showToast('Marked incomplete — you can redo it')
  })
  els.btnInsertSolution.addEventListener('click', () => {
    if (!currentProblem?.solution || !editor) return
    editor.setValue(currentProblem.solution)
    scheduleSave(currentProblem.id, currentProblem.solution)
    showToast('Solution inserted')
  })
  els.searchInput.addEventListener('input', renderList)
  els.packFilter.addEventListener('change', renderList)
  els.themeToggle?.addEventListener('click', () => {
    const prev = currentTheme()
    const next = prev === 'dark' ? 'light' : 'dark'
    applyTheme(next)
  })
  applyTheme(currentTheme())

  els.btnClearProgress?.addEventListener('click', async () => {
    if (!solved.length) {
      showToast('Nothing marked complete yet')
      return
    }
    const ok = window.confirm(
      `Clear ${solved.length} completed problem${solved.length === 1 ? '' : 's'} so you can redo them?`
    )
    if (!ok) return
    solved = await clearProgress()
    updateProgress()
    renderList()
    showToast('Completed marks cleared')
  })

  els.btnClearDrafts?.addEventListener('click', async () => {
    const ok = window.confirm('Delete all saved drafts? Starter code will be restored when you open each problem.')
    if (!ok) return
    await clearAllDrafts()
    showToast('Drafts cleared')
  })

  els.btnExport?.addEventListener('click', () => openTransferModal('export'))
  els.btnImport?.addEventListener('click', () => openTransferModal('import'))
  els.transferClose?.addEventListener('click', closeTransferModal)
  els.transferModal?.addEventListener('click', (event) => {
    if (event.target === els.transferModal) closeTransferModal()
  })
  els.transferDrafts?.addEventListener('change', () => {
    // Regenerate export payload when the drafts toggle flips while exporting
    if (
      els.transferModal &&
      !els.transferModal.classList.contains('hidden') &&
      els.transferCode?.readOnly
    ) {
      openTransferModal('export')
    }
  })
  els.btnCopyCode?.addEventListener('click', async () => {
    const code = els.transferCode?.value?.trim()
    if (!code) {
      showToast('Nothing to copy yet')
      return
    }
    try {
      await navigator.clipboard.writeText(code)
      showToast('Code copied')
    } catch {
      els.transferCode.focus()
      els.transferCode.select()
      showToast('Select and copy manually')
    }
  })
  els.btnApplyCode?.addEventListener('click', async () => {
    const code = els.transferCode?.value?.trim()
    if (!code) {
      showToast('Paste a transfer code first')
      return
    }
    const merge = window.confirm(
      'Merge with this device’s progress?\n\nOK = merge (keep both)\nCancel = replace local progress with the code'
    )
    try {
      const result = await importTransferCode(code, {
        mode: merge ? 'merge' : 'replace',
      })
      solved = result.solved
      updateProgress()
      renderList()
      closeTransferModal()
      showToast(
        `Imported ${solved.length} solved` +
          (result.draftCount ? ` · ${result.draftCount} drafts` : '')
      )
    } catch (err) {
      showToast(err?.message || 'Import failed')
    }
  })
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return
    if (els.transferModal && !els.transferModal.classList.contains('hidden')) {
      closeTransferModal()
      return
    }
    if (els.progressModal && !els.progressModal.classList.contains('hidden')) {
      closeProgressModal()
    }
  })

  els.progressFab?.addEventListener('click', () => {
    openProgressModal()
  })
  els.progressClose?.addEventListener('click', closeProgressModal)
  els.progressModal?.addEventListener('click', (event) => {
    if (event.target === els.progressModal) closeProgressModal()
  })
}

if (import.meta.env.DEV) {
  ensureWorker()
}

init()
