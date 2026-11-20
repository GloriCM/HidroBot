const BRAND = '#0a3d6b'
const ACCENT = '#1d4ed8'
const GREEN = '#22c55e'

const KIND_META = {
  tank_low: {
    subject: 'HidroBot — Tanque bajo',
    headline: 'Nivel de tanque bajo',
    meaning: 'El agua del tanque está por debajo del umbral configurado.',
    action: 'Rellena el tanque pronto para que el riego automático siga funcionando con normalidad.',
  },
  tank_empty: {
    subject: 'HidroBot — Tanque vacío',
    headline: 'Tanque crítico — riego bloqueado',
    meaning: 'El nivel cayó por debajo del mínimo de seguridad.',
    action:
      'Rellena el tanque cuanto antes. El riego automático está bloqueado hasta que el nivel se recupere.',
  },
  tank_recovered: {
    subject: 'HidroBot — Tanque recuperado',
    headline: 'Nivel de tanque recuperado',
    meaning: 'El tanque volvió a un nivel seguro.',
    action: 'No necesitas hacer nada por ahora; el riego automático puede volver a operar.',
  },
  device_offline: {
    subject: 'HidroBot — Dispositivo desconectado',
    headline: 'Sin lecturas recientes',
    meaning: 'Tu dispositivo no ha enviado telemetría en el tiempo esperado.',
    action: 'Revisa alimentación, Wi‑Fi y que el ESP32 esté encendido.',
  },
  test: {
    subject: 'HidroBot — Correo de prueba',
    headline: 'Correo de prueba',
    meaning: 'Las notificaciones por correo están configuradas.',
    action: 'Si recibes este mensaje, el envío SMTP funciona correctamente.',
  },
}

function escHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * @param {{
 *   kind: string,
 *   deviceName: string,
 *   zoneName: string,
 *   tankPct: number | null,
 *   distanceCm: number | null,
 *   recordedLabel: string,
 *   appUrl: string,
 *   unsubscribeUrl: string,
 * }} ctx
 */
export function buildNotificationEmail(ctx) {
  const meta = KIND_META[ctx.kind] || KIND_META.test
  const tankLine =
    ctx.tankPct != null
      ? `Nivel actual: ${ctx.tankPct}%${ctx.distanceCm != null ? ` (distancia ${ctx.distanceCm} cm)` : ''}`
      : 'Sin lectura reciente del sensor de tanque.'

  const text = [
    meta.headline,
    '',
    `Dispositivo: ${ctx.deviceName}`,
    `Zona: ${ctx.zoneName}`,
    tankLine,
    `Hora (America/Bogotá): ${ctx.recordedLabel}`,
    '',
    meta.meaning,
    meta.action,
    '',
    `Panel: ${ctx.appUrl}`,
    '',
    `Dejar de recibir estos avisos: ${ctx.unsubscribeUrl}`,
    '',
    '— HidroBot',
  ].join('\n')

  const html = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#eef3f8;font-family:Segoe UI,Arial,sans-serif;color:${BRAND};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width:520px;background:#ffffff;border-radius:16px;border:1px solid #d7e3ee;overflow:hidden;">
          <tr>
            <td style="padding:20px 24px;background:linear-gradient(90deg,${ACCENT},${GREEN});color:#fff;font-weight:800;font-size:18px;">
              HidroBot
            </td>
          </tr>
          <tr>
            <td style="padding:24px;">
              <h1 style="margin:0 0 12px;font-size:20px;color:${BRAND};">${escHtml(meta.headline)}</h1>
              <p style="margin:0 0 8px;font-size:14px;"><strong>Dispositivo:</strong> ${escHtml(ctx.deviceName)}</p>
              <p style="margin:0 0 8px;font-size:14px;"><strong>Zona:</strong> ${escHtml(ctx.zoneName)}</p>
              <p style="margin:0 0 8px;font-size:14px;">${escHtml(tankLine)}</p>
              <p style="margin:0 0 16px;font-size:13px;color:#6b8494;">Hora (America/Bogotá): ${escHtml(ctx.recordedLabel)}</p>
              <p style="margin:0 0 8px;font-size:14px;">${escHtml(meta.meaning)}</p>
              <p style="margin:0 0 20px;font-size:14px;font-weight:600;">${escHtml(meta.action)}</p>
              <a href="${escHtml(ctx.appUrl)}" style="display:inline-block;padding:12px 18px;border-radius:12px;background:linear-gradient(90deg,${ACCENT},${GREEN});color:#fff;text-decoration:none;font-weight:800;font-size:14px;">Abrir panel</a>
              <p style="margin:24px 0 0;font-size:12px;color:#6b8494;">
                <a href="${escHtml(ctx.unsubscribeUrl)}" style="color:#6b8494;">Dejar de recibir estos avisos</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

  return { subject: meta.subject, text, html }
}

/**
 * @param {{ confirmUrl: string, zoneName: string, email: string }} ctx
 */
export function buildConfirmEmail(ctx) {
  const text = [
    'Confirma tu correo en HidroBot',
    '',
    `Zona: ${ctx.zoneName}`,
    `Correo: ${ctx.email}`,
    '',
    `Abre este enlace para recibir avisos: ${ctx.confirmUrl}`,
    '',
    '— HidroBot',
  ].join('\n')

  const html = `<!DOCTYPE html><html lang="es"><body style="font-family:Segoe UI,Arial,sans-serif;color:${BRAND};padding:24px;">
    <h1>Confirma tu correo</h1>
    <p>Zona: <strong>${escHtml(ctx.zoneName)}</strong></p>
    <p>Correo: <strong>${escHtml(ctx.email)}</strong></p>
    <p><a href="${escHtml(ctx.confirmUrl)}" style="color:${ACCENT};font-weight:700;">Confirmar y recibir avisos</a></p>
  </body></html>`

  return { subject: 'HidroBot — Confirma tu correo', text, html }
}