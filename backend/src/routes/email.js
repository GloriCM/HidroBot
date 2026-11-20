import * as emailNotificationService from '../services/emailNotificationService.js'

/**
 * Rutas públicas de confirmación y baja de correos.
 * @param {import('fastify').FastifyInstance} app
 */
export async function emailRoutes(app) {
  app.get('/api/email/confirm/:token', async (request, reply) => {
    await emailNotificationService.confirmRecipientPublic(app, request.params.token)
    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"/><title>HidroBot</title></head>
<body style="font-family:Segoe UI,Arial,sans-serif;padding:32px;color:#0a3d6b;">
<h1>Correo confirmado</h1>
<p>Recibirás avisos de HidroBot en esta zona.</p>
<p><a href="/">Volver al panel</a></p>
</body></html>`
    reply.type('text/html; charset=utf-8').send(html)
  })

  app.get('/api/email/unsubscribe/owner/:token', async (request, reply) => {
    await emailNotificationService.unsubscribeOwnerPublic(app, request.params.token)
    reply.type('text/html; charset=utf-8').send(
      `<!DOCTYPE html><html lang="es"><body style="font-family:Segoe UI,Arial,sans-serif;padding:32px;color:#0a3d6b;">
      <h1>Listo</h1><p>Ya no recibirás avisos como dueño de esta zona.</p></body></html>`,
    )
  })

  app.get('/api/email/unsubscribe/:token', async (request, reply) => {
    await emailNotificationService.unsubscribeRecipientPublic(app, request.params.token)
    reply.type('text/html; charset=utf-8').send(
      `<!DOCTYPE html><html lang="es"><body style="font-family:Segoe UI,Arial,sans-serif;padding:32px;color:#0a3d6b;">
      <h1>Listo</h1><p>Este correo fue eliminado de los avisos.</p></body></html>`,
    )
  })
}