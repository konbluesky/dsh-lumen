import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-api-gateway/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { TYPERT_REMOTE } from '../remote.js'
import { LumenDock } from './LumenDock.js'

export const inject = ['slots', 'remote']

export function apply(ctx: ClientContext): void {
  ctx.effect(async () => {
    const unmountRemote = await ctx.remote.$mount(TYPERT_REMOTE)
    const slotFiber = ctx.inject(['remote.lumen'], (rctx) => {
      const unregisterSlot = rctx.slots.inject('conversation.input.dock', () => rctx.slots.register({
        name: 'conversation.input.dock',
        id: 'lumen',
        order: 20,
        inject: (): Pick<import('./LumenDock.js').LumenDockActions, 'explain'> => ({
          explain: (request, signal) => rctx.remote.lumen.explain(request, signal),
        }),
      }, LumenDock))
      rctx.effect(() => unregisterSlot, 'dsh-lumen: slot')
    })
    return () => {
      void slotFiber.dispose()
      unmountRemote()
    }
  }, 'dsh-lumen: remote and slot')
}
