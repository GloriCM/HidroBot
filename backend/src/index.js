import { loadConfig } from './config.js'
import { buildApp } from './app.js'
import { closePool } from './db/pool.js'
import { runMigrations } from './db/migrate.js'
import { startMaintenanceJobs } from './jobs/maintenance.js'
import { seedDemo } from './seed/demo.js'

async function main() {
  const config = loadConfig()

  console.log('Aplicando migraciones…')
  const applied = await runMigrations(config.DATABASE_URL)
  console.log(`Migraciones aplicadas: ${applied.length}`)

  if (config.SEED) {
    if (config.NODE_ENV === 'production') {
      console.warn('SEED=1 ignorado en production')
    } else {
      console.log('Ejecutando semilla demo (SEED=1)…')
      await seedDemo(config.DATABASE_URL)
    }
  }

  const app = await buildApp({ config })
  const stopJobs = startMaintenanceJobs(app)

  await app.listen({ port: config.PORT, host: '0.0.0.0' })
  console.log(`API escuchando en :${config.PORT}`)

  const shutdown = async (signal) => {
    console.log(`Señal ${signal}, cerrando…`)
    try {
      stopJobs()
      await app.close()
      await closePool()
    } finally {
      process.exit(0)
    }
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
