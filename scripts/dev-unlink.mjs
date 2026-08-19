#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dshRoot = path.resolve(process.env.DSH_ROOT ?? path.join(pluginRoot, '..', 'deepseek-harness'))
const profileRoot = path.resolve(process.env.DSH_PROFILE_ROOT ?? path.join(process.env.HOME ?? '~', '.dsh', 'profiles', 'web'))

const scopeDirs = [
  path.join(dshRoot, 'node_modules', '@local'),
  path.join(profileRoot, 'node_modules', '@local'),
]
const linkNames = ['dsh-lumen', 'dsh-client-ui-knowledge-lens']

for (const scopeDir of scopeDirs) {
  for (const linkName of linkNames) {
    const linkPath = path.join(scopeDir, linkName)
    try {
      const stat = await fs.lstat(linkPath)
      if (!stat.isSymbolicLink()) {
        throw new Error(`${linkPath} exists and is not a symlink; refusing to remove it`)
      }
      await fs.rm(linkPath, { force: true })
      console.log(`[dsh-lumen] removed ${linkPath}`)
    } catch (error) {
      if (error && error.code === 'ENOENT') {
        console.log(`[dsh-lumen] no link found at ${linkPath}`)
      } else {
        throw error
      }
    }
  }
}
