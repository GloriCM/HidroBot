import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { runner } from 'node-pg-migrate'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const migrationsDir = path.resolve(__dirname, '../../migrations')

export async function runMigrations(databaseUrl) {
  const result = await runner({
    databaseUrl,
    dir: migrationsDir,
    direction: 'up',
    migrationsTable: 'pgmigrations',
    count: Infinity,
    verbose: true,
    logger: console,
  })
  return result
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isMain) {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    console.error('DATABASE_URL es obligatoria')
    process.exit(1)
  }
  runMigrations(databaseUrl)
    .then((migrations) => {
      console.log(`Migraciones aplicadas: ${migrations.length}`)
      process.exit(0)
    })
    .catch((error) => {
      console.error(error)
      process.exit(1)
    })
}
