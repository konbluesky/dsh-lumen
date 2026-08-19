import { z } from 'zod'
import type { RemoteResult, TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import type { LumenExplainRequest, LumenExplainResult } from './types.ts'

const requestSchema = z.object({
  mode: z.union([z.literal('quick'), z.literal('contextual')]).readonly(),
  text: z.string().readonly(),
  sessionId: z.string().readonly().optional(),
})

const resultSchema = z.object({
  text: z.string().readonly(),
  route: z.object({
    provider: z.string().readonly(),
    model: z.string().readonly(),
  }).readonly(),
  contextMessages: z.number().readonly(),
})

export const TYPERT_REMOTE = {
  package: '@local/dsh-lumen',
  descriptors: [{
    id: '@local/dsh-lumen#lumen/explain',
    service: 'lumen',
    namespace: 'lumen',
    method: 'explain',
    invocation: { kind: 'direct' },
    parameters: [{
      name: 'request',
      wire: 'request',
      source: 'json',
      codec: {
        mode: 'strict',
        typeSymbol: '@local/dsh-lumen#LumenExplainRequest',
        schema: requestSchema,
      },
    }],
    cancellation: { parameter: 'signal' },
    result: {
      mode: 'strict',
      typeSymbol: '@local/dsh-lumen#LumenExplainResult',
      schema: resultSchema,
    },
    sourceLocation: { file: 'src/index.ts', line: 54, column: 3 },
  }],
} satisfies TypertRemoteContribution

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface TypertRemoteMap {
    'lumen/explain': (request: LumenExplainRequest, signal?: AbortSignal) => Promise<RemoteResult<LumenExplainResult>>
  }

  interface TypertRemoteNamespaceMap {
    lumen: {
      explain: (request: LumenExplainRequest, signal?: AbortSignal) => Promise<RemoteResult<LumenExplainResult>>
    }
  }
}
