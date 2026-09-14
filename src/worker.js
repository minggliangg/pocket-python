import harnessSource from './harness.py?raw'

const PYODIDE_VERSION = '0.26.4'
const PYODIDE_BASE = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`

let pyodideReady = null
let harnessReady = null
let formatterReady = null

async function ensurePyodide() {
  if (!pyodideReady) {
    pyodideReady = (async () => {
      postMessage({ type: 'status', message: 'Loading Python runtime…' })
      const { loadPyodide } = await import(
        /* @vite-ignore */ `${PYODIDE_BASE}pyodide.mjs`
      )
      const pyodide = await loadPyodide({
        indexURL: PYODIDE_BASE,
      })
      postMessage({ type: 'status', message: 'Ready' })
      return pyodide
    })()
  }
  return pyodideReady
}

async function ensureHarness(pyodide) {
  if (!harnessReady) {
    harnessReady = pyodide.runPythonAsync(harnessSource)
  }
  return harnessReady
}

async function ensureFormatter(pyodide) {
  if (!formatterReady) {
    formatterReady = (async () => {
      postMessage({ type: 'status', message: 'Loading formatter…' })
      await pyodide.loadPackage('micropip')
      const micropip = pyodide.pyimport('micropip')
      await micropip.install('black')
      await pyodide.runPythonAsync(`
import black

def format_python(code: str) -> str:
    return black.format_str(code, mode=black.Mode())
`)
      postMessage({ type: 'status', message: 'Ready' })
    })()
  }
  return formatterReady
}

async function formatCode({ code }) {
  const pyodide = await ensurePyodide()
  await ensureFormatter(pyodide)
  const formatPython = pyodide.globals.get('format_python')
  const result = formatPython(code)
  const text = typeof result === 'string' ? result : String(result)
  if (result && typeof result.destroy === 'function') result.destroy()
  return text
}

async function runTests({ code, fnName, mode, tests, asserts }) {
  const pyodide = await ensurePyodide()
  await ensureHarness(pyodide)

  postMessage({ type: 'status', message: 'Running tests…' })

  const payload =
    mode === 'asserts'
      ? { mode: 'asserts', asserts: asserts || [] }
      : { mode: 'cases', tests: tests || [] }

  try {
    const runSuite = pyodide.globals.get('run_suite')
    const resultJson = runSuite(code, fnName, JSON.stringify(payload))
    return JSON.parse(resultJson)
  } catch (err) {
    const message = err?.message || String(err)
    return {
      ok: false,
      error: message,
      results: [],
      passed: 0,
      total: payload.tests?.length ?? payload.asserts?.length ?? 0,
    }
  }
}

self.onmessage = async (event) => {
  const msg = event.data
  if (!msg) return

  if (msg.type === 'format') {
    try {
      const formatted = await formatCode(msg)
      postMessage({ type: 'formatResult', id: msg.id, code: formatted })
    } catch (err) {
      postMessage({
        type: 'formatResult',
        id: msg.id,
        error: err?.message || String(err),
      })
    }
    return
  }

  if (msg.type !== 'run') return

  try {
    const result = await runTests(msg)
    postMessage({ type: 'result', id: msg.id, result })
  } catch (err) {
    postMessage({
      type: 'result',
      id: msg.id,
      result: {
        ok: false,
        error: err?.message || String(err),
        results: [],
        passed: 0,
        total: 0,
      },
    })
  }
}

postMessage({ type: 'status', message: 'Worker ready' })
