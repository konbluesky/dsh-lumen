#!/usr/bin/env node
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'tsdown'

export const pluginId = '@local/dsh-lumen'

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const tempRoot = path.join(pluginRoot, '.dsh-lumen-build')

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: pluginRoot,
      stdio: 'inherit',
      env: process.env,
    })
    child.on('exit', (code, signal) => {
      if (code === 0) resolve()
      else reject(new Error(`${command} ${args.join(' ')} failed with ${signal ?? code}`))
    })
  })
}

async function writeClientBundle() {
  const builtClient = path.join(tempRoot, 'client.cjs')
  const code = await fs.readFile(builtClient, 'utf8')
  const wrapped = [
    `window.__ModuleLoader__.load({`,
    `  id: ${JSON.stringify(pluginId)},`,
    `  factory: (require) => {`,
    `    const module = { exports: {} };`,
    `    const exports = module.exports;`,
    code.split('\n').map(line => `    ${line}`).join('\n'),
    `    return module.exports;`,
    `  }`,
    `});`,
    ``,
  ].join('\n')
  await fs.writeFile(path.join(pluginRoot, 'lib', 'client.js'), wrapped)
}

export async function buildLumen() {
  await fs.rm(path.join(pluginRoot, 'lib'), { recursive: true, force: true })
  await fs.rm(tempRoot, { recursive: true, force: true })
  await run('pnpm', ['exec', 'tsc', '-p', 'tsconfig.json'])

  await build({
    cwd: pluginRoot,
    entry: ['lib/types/index.js'],
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'es2024',
    fixedExtension: false,
    dts: false,
    clean: false,
  })

  await build({
    cwd: pluginRoot,
    entry: { client: 'lib/types/client/index.js' },
    outDir: tempRoot,
    format: 'cjs',
    platform: 'browser',
    target: 'es2022',
    fixedExtension: false,
    dts: false,
    clean: true,
    sourcemap: false,
  })

  await writeClientBundle()
  await fs.rm(tempRoot, { recursive: true, force: true })
}

const invokedPath = process.argv[1]
if (invokedPath !== undefined && import.meta.url === pathToFileURL(path.resolve(invokedPath)).href) {
  await buildLumen()
}
