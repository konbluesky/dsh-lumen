export interface SelectionInfo {
  readonly text: string
  readonly rect: DOMRect
}

export interface PanelElements {
  readonly panel: HTMLElement
}

const PANEL_ID = 'dsh-lumen-panel'

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function removeElement(id: string): void {
  document.getElementById(id)?.remove()
}

export function removePanel(): void {
  removeElement(PANEL_ID)
}

export function showPanel(info: SelectionInfo): PanelElements {
  removePanel()

  const panel = document.createElement('section')
  panel.id = PANEL_ID
  panel.className = 'dsh-lumen-panel'
  const x = clamp(info.rect.left, 12, window.innerWidth - 432)
  const y = clamp(info.rect.bottom + 10, 12, window.innerHeight - 260)
  panel.style.left = `${x}px`
  panel.style.top = `${y}px`

  const header = document.createElement('div')
  header.className = 'dsh-lumen-panel__header'
  header.textContent = 'DSH Lumen / 知识透镜'

  const close = document.createElement('button')
  close.className = 'dsh-lumen-panel__close'
  close.type = 'button'
  close.textContent = 'x'
  close.title = '关闭'
  close.addEventListener('click', removePanel)
  header.appendChild(close)

  const body = document.createElement('div')
  body.className = 'dsh-lumen-panel__body'

  const label = document.createElement('p')
  label.className = 'dsh-lumen-panel__label'
  label.textContent = '当前选区'

  const selection = document.createElement('textarea')
  selection.className = 'dsh-lumen-panel__selection'
  selection.value = info.text
  selection.placeholder = '编辑要解释、搜索或回填的内容'

  const hint = document.createElement('p')
  hint.className = 'dsh-lumen-panel__hint'
  hint.textContent = '可以先调整选区内容，再复制或发起解释。'

  const actions = document.createElement('div')
  actions.className = 'dsh-lumen-panel__actions'

  const copy = document.createElement('button')
  copy.className = 'dsh-lumen-panel__action'
  copy.type = 'button'
  copy.textContent = '复制内容'
  copy.addEventListener('click', async () => {
    const text = selection.value.trim()
    if (!text) {
      hint.textContent = '内容为空，请先输入要处理的文本。'
      return
    }
    await navigator.clipboard.writeText(text)
    copy.textContent = '已复制'
    setTimeout(() => { copy.textContent = '复制内容' }, 1000)
  })

  const explain = document.createElement('button')
  explain.className = 'dsh-lumen-panel__action'
  explain.type = 'button'
  explain.textContent = '解释这段内容'
  explain.addEventListener('click', () => {
    const text = selection.value.trim()
    hint.textContent = text
      ? '解释能力将在下一步接入当前会话上下文和模型调用。'
      : '内容为空，请先输入要解释的文本。'
  })

  actions.append(copy, explain)
  body.append(label, selection, hint, actions)
  panel.append(header, body)
  document.body.appendChild(panel)
  selection.focus()

  return { panel }
}

export function isPanelElement(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(`#${PANEL_ID}`) !== null
}
