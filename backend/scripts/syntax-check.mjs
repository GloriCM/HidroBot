import { spawnSync } from 'node:child_process'
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const backendRoot = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const srcRoot = join(backendRoot, 'src')

/** @param {string} dir */
async function collectJsFiles(dir) {
  /** @type {string[]} */
  const files = []
  for (const ent of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, ent.name)
    if (ent.isDirectory()) files.push(...(await collectJsFiles(path)))
    else if (ent.name.endsWith('.js')) files.push(path)
  }
  return files
}

const files = await collectJsFiles(srcRoot)
let failed = 0
for (const file of files) {
  const rel = file.slice(backendRoot.length + 1)
  const r = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' })
  if (r.status !== 0) {
    failed += 1
    process.stderr.write(`syntax-check falló: ${rel}\n`)
    if (r.stderr) process.stderr.write(r.stderr)
  }
}

if (failed) {
  process.stderr.write(`\n${failed} archivo(s) con error de sintaxis en src/\n`)
  process.exit(1)
}

process.stdout.write(`syntax-check OK (${files.length} archivos)\n`)