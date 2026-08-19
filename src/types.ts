export type LumenMode = 'quick' | 'contextual'

export interface LumenExplainRequest {
  readonly mode: LumenMode
  readonly text: string
  readonly sessionId?: string
}

export interface LumenExplainRoute {
  readonly provider: string
  readonly model: string
}

export interface LumenExplainResult {
  readonly text: string
  readonly route: LumenExplainRoute
  readonly contextMessages: number
}
