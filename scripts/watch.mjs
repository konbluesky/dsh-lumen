#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildLumen } from './build.mjs'

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const srcRoot = path.join(pluginRoot, 'src')

let building = false
let queued = false
let timer

async function rebuild() {
  if (building) {
    queued = true
    return
  }
  building = true
  queued = false
  try {
    await buildLumen()
    console.log('[dsh-lumen] rebuilt lib/client.js')
  } catch (error) {
    console.error(error)
  } finally {
    building = false
    if (queued) void rebuild()
  }
}

await rebuild()

fs.watch(srcRoot, { recursive: true }, () => {
  clearTimeout(timer)
  timer = setTimeout(() => { void rebuild() }, 120)
})

console.log(`[dsh-lumen] watching ${srcRoot}`)
