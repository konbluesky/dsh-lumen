import { type PointerEvent, type ReactNode, useEffect, useRef, useState } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { LumenExplainRequest, LumenExplainResult, LumenMode } from '../types.ts'
import css from './LumenDock.module.css'

export interface LumenDockActions {
  readonly explain: (request: LumenExplainRequest, signal: AbortSignal) => Promise<RemoteResult<LumenExplainResult>>
}

export type LumenDockProps = PropsRuntime<'conversation.input.dock'> & LumenDockActions

interface PopupPosition {
  readonly left: number
  readonly top: number
}

type PopupState = 'closed' | 'button' | 'panel'

interface LumenHistoryItem {
  readonly id: string
  readonly sessionId?: string
  readonly mode: LumenMode
  readonly query: string
  readonly result: string
  readonly route: LumenExplainResult['route']
  readonly contextMessages: number
  readonly createdAt: number
}

interface DragState {
  readonly pointerId: number
  readonly offsetX: number
  readonly offsetY: number
}

const HISTORY_KEY = 'dsh-lumen:history:v1'
const HISTORY_LIMIT = 30

let activeOwner: symbol | null = null

function resultError(result: RemoteResult<unknown>): string | undefined {
  return result.ok ? undefined : `${result.error.message} (${result.error.code})`
}

function isHistoryItem(value: unknown): value is LumenHistoryItem {
  if (typeof value !== 'object' || value === null) return false
  const item = value as Partial<LumenHistoryItem>
  return typeof item.id === 'string'
    && (item.sessionId === undefined || typeof item.sessionId === 'string')
    && (item.mode === 'quick' || item.mode === 'contextual')
    && typeof item.query === 'string'
    && typeof item.result === 'string'
    && typeof item.route === 'object'
    && item.route !== null
    && typeof item.route.provider === 'string'
    && typeof item.route.model === 'string'
    && typeof item.contextMessages === 'number'
    && typeof item.createdAt === 'number'
}

function readHistory(): LumenHistoryItem[] {
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY)
    if (raw === null) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter(isHistoryItem).slice(0, HISTORY_LIMIT) : []
  } catch {
    return []
  }
}

function writeHistory(items: readonly LumenHistoryItem[]): void {
  try {
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, HISTORY_LIMIT)))
  } catch {
    // History is helpful but must never block the query flow.
  }
}

function shortText(value: string, limit: number): string {
  const singleLine = value.replace(/\s+/g, ' ').trim()
  return singleLine.length > limit ? `${singleLine.slice(0, limit - 1)}…` : singleLine
}

function renderInlineMarkdown(text: string): ReactNode[] {
  const nodes: ReactNode[] = []
  const pattern = /(\*\*([^*]+)\*\*)|(`([^`]+)`)|(\[([^\]]+)]\((https?:\/\/[^\s)]+)\))/g
  let cursor = 0
  let index = 0
  for (const match of text.matchAll(pattern)) {
    if (match.index === undefined) continue
    if (match.index > cursor) nodes.push(text.slice(cursor, match.index))
    if (match[2] !== undefined) {
      nodes.push(<strong key={`strong-${index++}`}>{match[2]}</strong>)
    } else if (match[4] !== undefined) {
      nodes.push(<code key={`code-${index++}`}>{match[4]}</code>)
    } else if (match[6] !== undefined && match[7] !== undefined) {
      nodes.push(<a key={`link-${index++}`} href={match[7]} target="_blank" rel="noreferrer">{match[6]}</a>)
    }
    cursor = match.index + match[0].length
  }
  if (cursor < text.length) nodes.push(text.slice(cursor))
  return nodes
}

function MarkdownBlock({ text }: { readonly text: string }) {
  const nodes: ReactNode[] = []
  const lines = text.split('\n')
  let paragraph: string[] = []
  let list: string[] = []
  let ordered = false
  let code: string[] | null = null
  let codeIndex = 0

  const flushParagraph = (): void => {
    if (paragraph.length === 0) return
    nodes.push(<p key={`p-${nodes.length}`}>{renderInlineMarkdown(paragraph.join('\n'))}</p>)
    paragraph = []
  }

  const flushList = (): void => {
    if (list.length === 0) return
    const Tag = ordered ? 'ol' : 'ul'
    nodes.push(<Tag key={`list-${nodes.length}`}>{list.map((item, index) => <li key={index}>{renderInlineMarkdown(item)}</li>)}</Tag>)
    list = []
  }

  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      flushParagraph()
      flushList()
      if (code === null) {
        code = []
      } else {
        nodes.push(<pre key={`code-${codeIndex++}`}><code>{code.join('\n')}</code></pre>)
        code = null
      }
      continue
    }
    if (code !== null) {
      code.push(line)
      continue
    }

    const trimmed = line.trim()
    if (trimmed === '') {
      flushParagraph()
      flushList()
      continue
    }

    const heading = /^(#{1,3})\s+(.+)$/.exec(trimmed)
    if (heading !== null) {
      flushParagraph()
      flushList()
      const marker = heading[1] ?? ''
      const content = heading[2] ?? trimmed
      const level = marker.length
      const Tag = level === 1 ? 'h3' : level === 2 ? 'h4' : 'h5'
      nodes.push(<Tag key={`h-${nodes.length}`}>{renderInlineMarkdown(content)}</Tag>)
      continue
    }

    const bullet = /^[-*]\s+(.+)$/.exec(trimmed)
    const numbered = /^\d+[.)]\s+(.+)$/.exec(trimmed)
    if (bullet !== null || numbered !== null) {
      flushParagraph()
      const nextOrdered = numbered !== null
      if (list.length > 0 && ordered !== nextOrdered) flushList()
      ordered = nextOrdered
      list.push((bullet ?? numbered)?.[1] ?? trimmed)
      continue
    }

    flushList()
    paragraph.push(trimmed)
  }

  flushParagraph()
  flushList()
  if (code !== null) nodes.push(<pre key={`code-${codeIndex++}`}><code>{code.join('\n')}</code></pre>)
  return <div className={css.markdown}>{nodes}</div>
}

export function LumenDock({ sessionId, explain }: LumenDockProps) {
  const [popupState, setPopupState] = useState<PopupState>('closed')
  const [text, setText] = useState('')
  const [position, setPosition] = useState<PopupPosition>({ left: 16, top: 16 })
  const [pending, setPending] = useState<LumenMode | null>(null)
  const [result, setResult] = useState<LumenExplainResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [history, setHistory] = useState<LumenHistoryItem[]>(() => readHistory())
  const [historyOpen, setHistoryOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const ownerRef = useRef(Symbol('dsh-lumen'))
  const abortRef = useRef<AbortController | null>(null)
  const dragRef = useRef<DragState | null>(null)

  useEffect(() => () => {
    abortRef.current?.abort()
    if (activeOwner === ownerRef.current) activeOwner = null
  }, [])

  useEffect(() => {
    const updateFromSelection = (): void => {
      const selection = window.getSelection()
      const selected = selection?.toString().trim() ?? ''
      if (selection === null || selection.rangeCount === 0 || selected === '') return
      if (activeOwner !== null && activeOwner !== ownerRef.current) return

      const activeElement = document.activeElement
      if (activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement) return
      if (activeElement instanceof Node && rootRef.current?.contains(activeElement)) return
      if (selection.anchorNode !== null && rootRef.current?.contains(selection.anchorNode)) return
      if (selection.focusNode !== null && rootRef.current?.contains(selection.focusNode)) return

      const range = selection.getRangeAt(0)
      const rect = range.getBoundingClientRect()
      if (rect.width === 0 && rect.height === 0) return

      const margin = 12
      const popupWidth = Math.min(460, window.innerWidth - margin * 2)
      setText(selected)
      setResult(null)
      setError(null)
      setPosition({
        left: Math.min(Math.max(rect.left, margin), window.innerWidth - popupWidth - margin),
        top: Math.min(Math.max(rect.bottom + 8, margin), window.innerHeight - 220),
      })
      activeOwner = ownerRef.current
      setPopupState('button')
    }

    const handleSelection = (event: MouseEvent | KeyboardEvent): void => {
      if (event.target instanceof Node && rootRef.current?.contains(event.target)) return
      window.setTimeout(updateFromSelection, 0)
    }

    document.addEventListener('mouseup', handleSelection)
    document.addEventListener('keyup', handleSelection)
    return () => {
      document.removeEventListener('mouseup', handleSelection)
      document.removeEventListener('keyup', handleSelection)
    }
  }, [])

  const close = (): void => {
    abortRef.current?.abort()
    if (activeOwner === ownerRef.current) activeOwner = null
    setPopupState('closed')
    setPending(null)
  }

  const clampPosition = (next: PopupPosition): PopupPosition => {
    const margin = 8
    const rect = rootRef.current?.getBoundingClientRect()
    const width = rect?.width ?? Math.min(460, window.innerWidth - margin * 2)
    const height = rect?.height ?? 320
    return {
      left: Math.min(Math.max(next.left, margin), Math.max(margin, window.innerWidth - width - margin)),
      top: Math.min(Math.max(next.top, margin), Math.max(margin, window.innerHeight - Math.min(height, window.innerHeight - margin * 2) - margin)),
    }
  }

  const startDrag = (event: PointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0) return
    const target = event.target
    if (target instanceof HTMLElement && target.closest('button, textarea, input, a')) return
    const rect = rootRef.current?.getBoundingClientRect()
    if (rect === undefined) return
    dragRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const moveDrag = (event: PointerEvent<HTMLDivElement>): void => {
    const drag = dragRef.current
    if (drag === null || drag.pointerId !== event.pointerId) return
    setPosition(clampPosition({ left: event.clientX - drag.offsetX, top: event.clientY - drag.offsetY }))
  }

  const stopDrag = (event: PointerEvent<HTMLDivElement>): void => {
    if (dragRef.current?.pointerId !== event.pointerId) return
    dragRef.current = null
    event.currentTarget.releasePointerCapture(event.pointerId)
  }

  const saveHistory = (mode: LumenMode, query: string, value: LumenExplainResult): void => {
    const item: LumenHistoryItem = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      ...(sessionId === undefined ? {} : { sessionId }),
      mode,
      query,
      result: value.text,
      route: value.route,
      contextMessages: value.contextMessages,
      createdAt: Date.now(),
    }
    setHistory((current) => {
      const next = [item, ...current.filter(existing => existing.query !== query || existing.mode !== mode)].slice(0, HISTORY_LIMIT)
      writeHistory(next)
      return next
    })
  }

  const restoreHistory = (item: LumenHistoryItem): void => {
    setText(item.query)
    setResult({ text: item.result, route: item.route, contextMessages: item.contextMessages })
    setError(null)
    setHistoryOpen(false)
  }

  const run = async (mode: LumenMode): Promise<void> => {
    const trimmed = text.trim()
    if (trimmed === '') {
      setError('请输入要查询的文本。')
      return
    }
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setPending(mode)
    setError(null)
    setResult(null)
    try {
      const response = await explain({ mode, text: trimmed, sessionId }, controller.signal)
      if (response.ok) {
        setResult(response.value)
        saveHistory(mode, trimmed, response.value)
      }
      else setError(resultError(response) ?? '查询失败')
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      if (abortRef.current === controller) abortRef.current = null
      setPending(null)
    }
  }

  if (popupState === 'closed') {
    return null
  }

  if (popupState === 'button') {
    return (
      <div ref={rootRef} className={css.buttonPopup} style={{ left: position.left, top: position.top }}>
        <button type="button" className={css.lumenButton} onClick={() => { setPopupState('panel') }}>
          Lumen
        </button>
      </div>
    )
  }

  const disabled = pending !== null
  return (
    <div ref={rootRef} className={css.popup} style={{ left: position.left, top: position.top }}>
      <section className={css.card} aria-label="知识透镜">
        <div
          className={css.header}
          onPointerDown={startDrag}
          onPointerMove={moveDrag}
          onPointerUp={stopDrag}
          onPointerCancel={stopDrag}
        >
          <span className={css.title}>知识透镜</span>
          <div className={css.headerActions}>
            <button type="button" className={css.button} onClick={() => { setHistoryOpen(open => !open) }}>
              历史 {history.length}
            </button>
            <button type="button" className={css.button} onClick={close}>关闭</button>
          </div>
        </div>
        <p className={css.hint}>已捕获选中文本；“结合上下文”会读取当前会话最近消息，但不会污染主线。</p>
        {historyOpen && (
          <div className={css.history}>
            {history.length === 0 ? <p className={css.empty}>暂无历史查询。</p> : history.map(item => (
              <button key={item.id} type="button" className={css.historyItem} onClick={() => { restoreHistory(item) }}>
                <span className={css.historyTitle}>{shortText(item.query, 42)}</span>
                <span className={css.historyMeta}>{item.mode === 'quick' ? '快速' : '上下文'} · {new Date(item.createdAt).toLocaleString()}</span>
              </button>
            ))}
          </div>
        )}
        <textarea
          className={css.textarea}
          value={text}
          onChange={event => { setText(event.currentTarget.value) }}
          placeholder="输入要解释、归纳或追问的文本"
        />
        <div className={css.actions}>
          <button type="button" className={css.button} onClick={() => { void run('quick') }} disabled={disabled}>
            {pending === 'quick' ? '查询中...' : '快速查询'}
          </button>
          <button type="button" className={css.button} onClick={() => { void run('contextual') }} disabled={disabled}>
            {pending === 'contextual' ? '查询中...' : '结合上下文查询'}
          </button>
        </div>
        {error !== null && <p className={css.error} role="alert">{error}</p>}
        {result !== null && (
          <div className={css.result}>
            <MarkdownBlock text={result.text} />
            <p className={css.resultMeta}>模型：{result.route.provider}/{result.route.model}；上下文消息：{result.contextMessages}</p>
          </div>
        )}
      </section>
    </div>
  )
}
