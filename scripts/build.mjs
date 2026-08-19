#!/usr/bin/env node
import { spawn } from 'node:child_process'
import fsSync from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'tsdown'

export const pluginId = '@local/dsh-lumen'
const clientExternals = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-web-react',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-attachment',
  '@deepseek-ai/dsh-client-schema-form',
  '@deepseek-ai/dsh-client-runtime/client',
]

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const tempRoot = path.join(pluginRoot, '.dsh-lumen-build')
const cssVirtualPrefix = '\0dsh-lumen-css:'
const cssVirtualSuffix = '.mjs'

function cssModulePlugin() {
  return {
    name: 'dsh-lumen-css-modules',
    resolveId(source, importer) {
      if (!source.endsWith('.module.css')) return null
      return cssVirtualPrefix + path.resolve(path.dirname(importer), source) + cssVirtualSuffix
    },
    async load(id) {
      if (!id.startsWith(cssVirtualPrefix)) return null
      const emitted = id.slice(cssVirtualPrefix.length, -cssVirtualSuffix.length)
      const marker = `${path.sep}lib${path.sep}types${path.sep}`
      const sourceFile = emitted.includes(marker)
        ? path.resolve(
          emitted.slice(0, emitted.indexOf(marker)),
          'src',
          emitted.slice(emitted.indexOf(marker) + marker.length),
        )
        : emitted
      const file = fsSync.existsSync(emitted) ? emitted : sourceFile
      const source = await fs.readFile(file, 'utf8')
      const classMap = Object.fromEntries([...source.matchAll(/\.([_a-zA-Z]+[_a-zA-Z0-9-]*)/g)]
        .map(match => [match[1], match[1]]))
      const tagId = `${pluginId}/${path.basename(file)}`
      return [
        `const css = ${JSON.stringify(source)};`,
        `const tagId = ${JSON.stringify(tagId)};`,
        'if (typeof document !== \'undefined\' && document.querySelector(\'style[data-plugin-css=\' + JSON.stringify(tagId) + \']\') === null) {',
        '  const tag = document.createElement(\'style\');',
        `  tag.dataset.plugin = ${JSON.stringify(pluginId)};`,
        '  tag.dataset.pluginCss = tagId;',
        '  tag.textContent = css;',
        '  document.head.appendChild(tag);',
        '}',
        `module.exports = ${JSON.stringify(classMap)};`,
      ].join('\n')
    },
  }
}

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
    external: clientExternals,
    noExternal: id => clientExternals.includes(id) ? undefined : true,
    define: {
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
      'import.meta.env.MODE': JSON.stringify(process.env.NODE_ENV ?? 'production'),
      'import.meta.env': JSON.stringify({ MODE: process.env.NODE_ENV ?? 'production' }),
    },
    plugins: [cssModulePlugin()],
  })

  await writeClientBundle()
  await fs.rm(tempRoot, { recursive: true, force: true })
}

const invokedPath = process.argv[1]
if (invokedPath !== undefined && import.meta.url === pathToFileURL(path.resolve(invokedPath)).href) {
  await buildLumen()
}
