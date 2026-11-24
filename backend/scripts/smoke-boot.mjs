import { buildApp } from '../src/app.js'
import { loadConfig } from '../src/config.js'
import { closePool } from '../src/db/pool.js'

const config = loadConfig()
const app = await buildApp({ config })
await app.listen({ port: 0, host: '127.0.0.1' })

const res = await app.inject({ method: 'GET', url: '/api/health' })
if (res.statusCode !== 200) {
  process.stderr.write(`smoke-boot: /api/health → ${res.statusCode}\n`)
  process.exit(1)
}

await app.close()
await closePool()
process.stdout.write('smoke-boot OK\n')