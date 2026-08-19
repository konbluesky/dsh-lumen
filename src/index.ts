import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-agent-default-model'
import Schema from '@deepseek-ai/schemastery'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { BlockAssembler, createUserMessage, deepFreeze } from '@deepseek-ai/dsh-llm'
import type { FinishReason, GenerateOptions, Message } from '@deepseek-ai/dsh-llm'
import type { LumenExplainRequest, LumenExplainResult, LumenExplainRoute } from './types.ts'

export interface LumenConfig {
  readonly maxInputChars: number
  readonly contextMessages: number
  readonly maxOutputTokens: number
  readonly systemPrompt: string
}

export const Config = Schema.object({
  maxInputChars: Schema.natural().min(100).max(50_000).default(8_000).description('单次查询允许发送的最大选中文本长度。'),
  contextMessages: Schema.natural().min(0).max(50).default(8).description('结合上下文查询时读取当前会话最近消息数量。'),
  maxOutputTokens: Schema.natural().min(100).max(8_000).default(900).description('知识透镜回答的最大输出 tokens。'),
  systemPrompt: Schema.string().default('你是 DSH 知识透镜。回答应简洁、准确，使用 Markdown 输出，优先解释概念、关系、上下文含义和下一步可操作问题。').description('知识透镜调用模型时使用的系统提示词。'),
})

export const inject = ['llm', 'sessions', 'agentDefaultModel']

interface HostSession {
  requestHeader(): { config: LumenExplainRoute } | undefined
  requestContext(): { config: LumenExplainRoute } | undefined
  deriveMessages(): Message[]
}

interface HostServices {
  sessions: { get(id: string): HostSession | undefined }
  agentDefaultModel: { currentSelection(): LumenExplainRoute }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    lumen: LumenService
  }
}

function cleanText(text: string, config: LumenConfig): string {
  return text.trim().slice(0, config.maxInputChars)
}

function finishError(reason: FinishReason | undefined): Error | undefined {
  if (reason === undefined) return new Error('dsh-lumen: model stream ended without finish')
  if (reason.kind === 'error' || reason.kind === 'aborted') return new Error(reason.failure.message)
  return undefined
}

function messageText(messages: readonly Message[]): string {
  return messages.map((message) => {
    const text = message.content
      .filter((block): block is Extract<(typeof block), { type: 'text' }> => block.type === 'text')
      .map(block => block.text)
      .join('\n')
      .trim()
    return text === '' ? undefined : `${message.role}: ${text}`
  }).filter((line): line is string => line !== undefined).join('\n\n')
}

function promptFor(request: LumenExplainRequest, context: readonly Message[]): string {
  const format = '请使用 Markdown 输出，包含“简短结论”“关键点”“可能的追问”三个小节。'
  if (request.mode === 'quick') {
    return `请解释下面这段内容，指出关键概念、隐含前提和可能的追问方向。${format}\n\n${request.text}`
  }
  const framed = messageText(context)
  return `请结合当前会话上下文解释最后给出的文本。${format}\n\n当前会话上下文：\n${framed || '(无可用上下文)'}\n\n待解释文本：\n${request.text}`
}

function routeOf(ctx: Context, sessionId?: string): LumenExplainRoute {
  const host = ctx as Context & HostServices
  if (sessionId !== undefined) {
    const session = host.sessions.get(sessionId)
    const routed = session?.requestHeader()?.config ?? session?.requestContext()?.config
    if (routed !== undefined) return { provider: routed.provider, model: routed.model }
  }
  const fallback = host.agentDefaultModel.currentSelection()
  return { provider: fallback.provider, model: fallback.model }
}

export class LumenService extends TypertRemoteService {
  constructor(private readonly host: Context, private readonly getConfig: () => LumenConfig) {
    super(host, 'lumen')
  }

  @Remote('explain')
  async explain(request: LumenExplainRequest, signal?: AbortSignal): Promise<LumenExplainResult> {
    const host = this.host as Context & HostServices
    const config = this.getConfig()
    const text = cleanText(request.text, config)
    if (text === '') throw new Error('dsh-lumen: request text is empty')
    const normalized: LumenExplainRequest = { ...request, text }
    const session = normalized.sessionId === undefined ? undefined : host.sessions.get(normalized.sessionId)
    const context = normalized.mode === 'contextual' && session !== undefined
      ? session.deriveMessages().slice(-config.contextMessages)
      : []
    const route = routeOf(this.host, normalized.sessionId)
    const messages: Message[] = [createUserMessage({
      content: [{ type: 'text', text: promptFor(normalized, context) }],
      source: { kind: 'plugin', plugin: '@local/dsh-lumen' },
    })]
    const options: GenerateOptions = deepFreeze({
      provider: route.provider,
      model: route.model,
      messages,
      system: config.systemPrompt,
      maxTokens: config.maxOutputTokens,
      ...(normalized.sessionId === undefined ? {} : { sessionId: normalized.sessionId as never }),
      ...(signal === undefined ? {} : { signal }),
    })
    const assembler = new BlockAssembler()
    for await (const chunk of this.host.llm.stream(options)) assembler.push(chunk)
    const terminal = finishError(assembler.finish)
    if (terminal !== undefined) throw terminal
    const output = assembler.blocks()
      .filter((block): block is Extract<(typeof block), { type: 'text' }> => block.type === 'text')
      .map(block => block.text)
      .join('')
      .trim()
    if (output === '') throw new Error('dsh-lumen: model produced no text')
    return { text: output, route, contextMessages: context.length }
  }
}

export function apply(ctx: Context, config: LumenConfig): void {
  let current = (): LumenConfig => config
  const service = new LumenService(ctx, () => current())
  installSettingsSection(ctx, settingsNamespace('dsh-lumen'), Config, config, {
    setSource: (source: () => LumenConfig) => { current = source },
    onChange: () => {},
  })
}
