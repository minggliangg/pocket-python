import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { defaultKeymap, history, historyKeymap, indentMore, indentLess } from '@codemirror/commands'
import { python } from '@codemirror/lang-python'
import { syntaxHighlighting, defaultHighlightStyle, indentOnInput, bracketMatching } from '@codemirror/language'
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete'
import { oneDark } from '@codemirror/theme-one-dark'

const phoneTheme = EditorView.theme({
  '&': {
    // Driven by --code-font-size (toolbar A−/A+). Viewport meta blocks iOS focus-zoom.
    fontSize: 'var(--code-font-size, 14px)',
    height: '100%',
  },
  '.cm-scroller': {
    fontFamily: "'SF Mono', 'Cascadia Code', 'Fira Code', Consolas, ui-monospace, monospace",
    fontSize: 'inherit',
    lineHeight: '1.55',
    padding: '8px 0',
  },
  '.cm-content': {
    fontSize: 'inherit',
    paddingBottom: '24px',
    caretColor: '#5eead4',
  },
  '.cm-gutters': {
    backgroundColor: '#0c0a09',
    color: '#78716c',
    border: 'none',
  },
  '.cm-activeLine': {
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'rgba(255,255,255,0.06)',
    color: '#d6d3d1',
  },
  '.cm-cursor': {
    borderLeftColor: '#5eead4',
  },
  '.cm-selectionBackground, ::selection': {
    backgroundColor: 'rgba(15, 118, 110, 0.45) !important',
  },
  '&.cm-focused .cm-selectionBackground': {
    backgroundColor: 'rgba(15, 118, 110, 0.5) !important',
  },
  '.cm-tooltip': {
    backgroundColor: '#1c1917',
    border: '1px solid #44403c',
    color: '#e7e5e4',
  },
})

export function createEditor({ parent, doc, onChange }) {
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc,
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        highlightActiveLineGutter(),
        history(),
        indentOnInput(),
        bracketMatching(),
        closeBrackets(),
        python(),
        oneDark,
        phoneTheme,
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        keymap.of([
          ...closeBracketsKeymap,
          ...defaultKeymap,
          ...historyKeymap,
        ]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged && typeof onChange === 'function') {
            onChange(update.state.doc.toString())
          }
        }),
        EditorView.lineWrapping,
      ],
    }),
  })

  return {
    view,
    getValue() {
      return view.state.doc.toString()
    },
    setValue(code) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: code },
      })
    },
    indent() {
      view.focus()
      indentMore(view)
    },
    outdent() {
      view.focus()
      indentLess(view)
    },
    destroy() {
      view.destroy()
    },
  }
}
