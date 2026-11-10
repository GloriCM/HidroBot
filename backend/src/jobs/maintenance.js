import { expirePendingCommands } from '../repos/commands.js'
import { runOfflineWatcher, runRetentionJob } from '../services/panelService.js'

/**
 * Arranca tareas periódicas (offline, retención, caducidad de comandos).
 * @param {import('fastify').FastifyInstance} app
 */
export function startMaintenanceJobs(app) {
  const timers = []

  const offline = setInterval(() => {
    runOfflineWatcher(app).catch((error) => {
      app.log.error({ err: error }, 'offline watcher')
    })
  }, 60_000)
  timers.push(offline)

  const expire = setInterval(() => {
    expirePendingCommands(app.db).catch((error) => {
      app.log.error({ err: error }, 'expire commands')
    })
  }, 60_000)
  timers.push(expire)

  const retention = setInterval(() => {
    runRetentionJob(app)
      .then((count) => {
        if (count > 0) app.log.info({ count }, 'lecturas antiguas eliminadas')
      })
      .catch((error) => {
        app.log.error({ err: error }, 'retention job')
      })
  }, 6 * 60 * 60 * 1000)
  timers.push(retention)

  // Primera pasada suave tras arrancar
  setTimeout(() => {
    runOfflineWatcher(app).catch(() => {})
    expirePendingCommands(app.db).catch(() => {})
  }, 15_000)

  return () => {
    for (const timer of timers) clearInterval(timer)
  }
}
