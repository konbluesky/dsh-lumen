#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dshRoot = path.resolve(process.env.DSH_ROOT ?? path.join(pluginRoot, '..', 'deepseek-harness'))
const profileRoot = path.resolve(process.env.DSH_PROFILE_ROOT ?? path.join(process.env.HOME ?? '~', '.dsh', 'profiles', 'web'))

const links = [
  {
    label: 'checkout',
    scopeDir: path.join(dshRoot, 'node_modules', '@local'),
    linkPath: path.join(dshRoot, 'node_modules', '@local', 'dsh-lumen'),
  },
  {
    label: 'web-profile',
    scopeDir: path.join(profileRoot, 'node_modules', '@local'),
    linkPath: path.join(profileRoot, 'node_modules', '@local', 'dsh-lumen'),
  },
]
const staleNames = ['dsh-client-ui-knowledge-lens']

async function removeStale(scopeDir) {
  for (const staleName of staleNames) {
    const stalePath = path.join(scopeDir, staleName)
    try {
      const stat = await fs.lstat(stalePath)
      if (stat.isSymbolicLink()) {
        await fs.rm(stalePath, { force: true })
        console.log(`[dsh-lumen] removed stale link ${stalePath}`)
      }
    } catch (error) {
      if (!error || error.code !== 'ENOENT') throw error
    }
  }
}

async function ensureLink({ label, scopeDir, linkPath }) {
  await fs.mkdir(scopeDir, { recursive: true })
  await removeStale(scopeDir)

  try {
    const stat = await fs.lstat(linkPath)
    if (stat.isSymbolicLink()) {
      const current = await fs.readlink(linkPath)
      const resolved = path.resolve(path.dirname(linkPath), current)
      if (resolved === pluginRoot) {
        console.log(`[dsh-lumen] ${label} link already exists: ${linkPath} -> ${pluginRoot}`)
        return
      }
      await fs.rm(linkPath, { recursive: true, force: true })
    } else {
      throw new Error(`${linkPath} exists and is not a symlink; remove it manually before linking`)
    }
  } catch (error) {
    if (error && error.code !== 'ENOENT') throw error
  }

  await fs.symlink(pluginRoot, linkPath, 'dir')
  console.log(`[dsh-lumen] linked ${label}: ${linkPath} -> ${pluginRoot}`)
}

for (const link of links) await ensureLink(link)

console.log('[dsh-lumen] start DSH Web with:')
console.log(`  cd ${dshRoot}`)
console.log(`  pnpm dsh web --patch ${path.join(pluginRoot, 'debug', 'dsh-lumen.cordis.patch.yml')}`)
