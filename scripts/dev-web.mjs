#!/usr/bin/env node
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dshRoot = path.resolve(process.env.DSH_ROOT ?? path.join(pluginRoot, '..', 'deepseek-harness'))
const patchPath = path.join(pluginRoot, 'debug', 'dsh-lumen.cordis.patch.yml')

const watcher = spawn('node', ['scripts/watch.mjs'], {
  cwd: pluginRoot,
  stdio: 'inherit',
  env: process.env,
})

const bin = process.env.DSH_DEV_BIN ?? 'pnpm'
const args = process.env.DSH_DEV_BIN === undefined
  ? ['dsh', 'web', '--patch', patchPath]
  : ['--import', 'tsx/esm', 'apps/cli/src/bin.ts', 'web', '--patch', patchPath]

console.log(`[dsh-lumen] starting DSH Web from ${dshRoot}`)
console.log('[dsh-lumen] requires plugin installation through: dsh plugin --profile web add .')
console.log('[dsh-lumen] hot reload: lib/client.js changes are picked up by DSH client-hmr')

const child = spawn(bin, args, {
  cwd: dshRoot,
  stdio: 'inherit',
  env: process.env,
})

child.on('exit', (code, signal) => {
  watcher.kill('SIGTERM')
  if (signal) process.kill(process.pid, signal)
  process.exit(code ?? 0)
})
