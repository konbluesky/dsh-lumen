import { isPanelElement, removePanel, showPanel, type SelectionInfo } from './Panel.js'

interface ClientContext {
  effect(register: () => void | (() => void), label?: string): void
}

const STYLE_ID = 'dsh-lumen-style'
const BUTTON_ID = 'dsh-lumen-button'
const MIN_SELECTION_LENGTH = 2

/** Required client services. Kept empty for the DOM-level MVP. */
export const inject: string[] = []

function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    .dsh-lumen-button {
      position: fixed;
      z-index: 2147483646;
      border: 1px solid rgba(99, 102, 241, 0.42);
      border-radius: 999px;
      padding: 6px 10px;
      background: color-mix(in srgb, canvas 92%, #6366f1 8%);
      color: canvastext;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.18);
      font: 12px/1.2 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      cursor: pointer;
      user-select: none;
    }
    .dsh-lumen-button:hover {
      background: color-mix(in srgb, canvas 84%, #6366f1 16%);
    }
    .dsh-lumen-panel {
      position: fixed;
      z-index: 2147483647;
      width: min(420px, calc(100vw - 24px));
      max-height: min(520px, calc(100vh - 24px));
      overflow: auto;
      border: 1px solid rgba(99, 102, 241, 0.28);
      border-radius: 16px;
      background: color-mix(in srgb, canvas 96%, #6366f1 4%);
      color: canvastext;
      box-shadow: 0 18px 60px rgba(0, 0, 0, 0.24);
      font: 13px/1.5 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    .dsh-lumen-panel__header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 12px 14px;
      border-bottom: 1px solid rgba(99, 102, 241, 0.18);
      font-weight: 650;
    }
    .dsh-lumen-panel__close {
      border: 0;
      background: transparent;
      color: inherit;
      cursor: pointer;
      font-size: 18px;
      line-height: 1;
    }
    .dsh-lumen-panel__body {
      padding: 14px;
    }
    .dsh-lumen-panel__label {
      margin: 0 0 6px;
      color: color-mix(in srgb, canvastext 70%, transparent);
      font-size: 12px;
    }
    .dsh-lumen-panel__selection {
      width: 100%;
      min-height: 96px;
      box-sizing: border-box;
      margin: 0 0 12px;
      padding: 10px;
      border: 1px solid rgba(99, 102, 241, 0.28);
      border-radius: 10px;
      background: color-mix(in srgb, canvas 88%, #6366f1 12%);
      color: inherit;
      font: inherit;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      resize: vertical;
      outline: none;
    }
    .dsh-lumen-panel__selection:focus {
      border-color: rgba(99, 102, 241, 0.72);
      box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.14);
    }
    .dsh-lumen-panel__hint {
      margin: 0;
      color: color-mix(in srgb, canvastext 78%, transparent);
    }
    .dsh-lumen-panel__actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 12px;
    }
    .dsh-lumen-panel__action {
      border: 1px solid rgba(99, 102, 241, 0.32);
      border-radius: 10px;
      padding: 6px 9px;
      background: color-mix(in srgb, canvas 90%, #6366f1 10%);
      color: inherit;
      cursor: pointer;
    }
  `
  document.head.appendChild(style)
}

function removeElement(id: string): void {
  document.getElementById(id)?.remove()
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function isSelectionInsideApp(selection: Selection): boolean {
  if (selection.rangeCount === 0) return false
  const { anchorNode, focusNode } = selection
  if (!anchorNode || !focusNode) return false
  const root = document.querySelector('#root') ?? document.body
  return root.contains(anchorNode) && root.contains(focusNode)
}

function getSelectionInfo(): SelectionInfo | null {
  const selection = document.getSelection()
  if (!selection || selection.rangeCount === 0) return null
  const text = selection.toString().trim()
  if (text.length < MIN_SELECTION_LENGTH) return null
  if (!isSelectionInsideApp(selection)) return null
  const range = selection.getRangeAt(0)
  const rect = range.getBoundingClientRect()
  if (rect.width === 0 && rect.height === 0) return null
  return { text, rect }
}

function showButton(info: SelectionInfo): void {
  removeElement(BUTTON_ID)
  const button = document.createElement('button')
  button.id = BUTTON_ID
  button.className = 'dsh-lumen-button'
  button.type = 'button'
  button.textContent = 'Lumen'
  const x = clamp(info.rect.left + info.rect.width / 2 - 34, 8, window.innerWidth - 90)
  const y = clamp(info.rect.top - 38, 8, window.innerHeight - 40)
  button.style.left = `${x}px`
  button.style.top = `${y}px`
  button.addEventListener('mousedown', event => event.preventDefault())
  button.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    showPanel(info)
    removeElement(BUTTON_ID)
  })
  document.body.appendChild(button)
}

export function apply(ctx: ClientContext): void {
  ensureStyle()

  let raf = 0
  const update = (): void => {
    cancelAnimationFrame(raf)
    raf = requestAnimationFrame(() => {
      if (document.getElementById('dsh-lumen-panel')) return
      const info = getSelectionInfo()
      if (info) showButton(info)
      else removeElement(BUTTON_ID)
    })
  }

  const onPointerDown = (event: PointerEvent): void => {
    const target = event.target
    if (target instanceof Element && target.closest(`#${BUTTON_ID}`)) return
    if (isPanelElement(target)) return
    removePanel()
  }

  document.addEventListener('selectionchange', update)
  window.addEventListener('scroll', update, true)
  window.addEventListener('resize', update)
  document.addEventListener('pointerdown', onPointerDown, true)

  ctx.effect(() => {
    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('selectionchange', update)
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
      document.removeEventListener('pointerdown', onPointerDown, true)
      removeElement(BUTTON_ID)
      removePanel()
      removeElement(STYLE_ID)
    }
  }, 'dsh-lumen: selection panel')
}
