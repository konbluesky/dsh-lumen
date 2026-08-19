#!/usr/bin/env node
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dshRoot = path.resolve(process.env.DSH_ROOT ?? path.join(pluginRoot, '..', 'deepseek-harness'))
const profile = process.env.DSH_PROFILE ?? 'web'

function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: 'inherit', env: process.env })
    child.on('exit', (code, signal) => {
      if (code === 0) resolve()
      else reject(new Error(`${command} ${args.join(' ')} failed with ${signal ?? code}`))
    })
  })
}

console.log(`[dsh-lumen] installing plugin into DSH profile ${JSON.stringify(profile)}`)
console.log(`[dsh-lumen] DSH_ROOT=${dshRoot}`)
console.log(`[dsh-lumen] PLUGIN_ROOT=${pluginRoot}`)

await run('pnpm', ['dsh', 'plugin', '--profile', profile, 'add', pluginRoot], dshRoot)
