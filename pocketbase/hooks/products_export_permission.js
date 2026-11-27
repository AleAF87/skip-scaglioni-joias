/**
 *products_export_permission.js — proteção server-side da exportação de backup.
 *
 * O frontend chama POST /backend/v1/products/export/permission antes de gerar o
 * ZIP local (CSV + fotos). Se o papel do usuário autenticado não for "superadmin",
 * responde 403 e a exportação é bloqueada no cliente.
 *
 * JSVM (PocketBase): nada de top-level é visível aos handlers — constantes
 * duplicadas inline aqui (mesmo padrão dos demais hooks deste projeto).
 */
routerAdd(
  'POST',
  '/backend/v1/products/export/permission',
  (e) => {
    const info = e.requestInfo()
    const auth = info && info.auth ? info.auth : null
    if (!auth || auth.collection().name !== 'users') {
      return e.json(403, { error: 'Apenas o Superadmin pode exportar o backup completo.' })
    }
    let role = ''
    try {
      role = auth.getString('role') || ''
    } catch (_err) {
      role = ''
    }
    if (role !== 'superadmin') {
      return e.json(403, { error: 'Apenas o Superadmin pode exportar o backup completo.' })
    }
    return e.json(200, { ok: true })
  },
  null,
)
