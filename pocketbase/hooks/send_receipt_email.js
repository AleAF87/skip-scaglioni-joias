/// <reference path="../pb_data/types.d.ts" />

/**
 * Hook to send sale receipt by email
 * POST /backend/v1/scaglioni/send-receipt
 * Body: { email, customer_name, sale_code, total, items, payment_method, date }
 */
routerAdd('POST', '/backend/v1/scaglioni/send-receipt', (e) => {
  try {
    const authRecord = e.auth
    if (!authRecord) {
      return e.json(401, { error: 'Acesso não autorizado.' })
    }

    const info = e.requestInfo()
    const data = (info && info.body) || {}
    const email = (data.email || '').trim()
    const customerName = (data.customer_name || 'Cliente').trim()
    const saleCode = (data.sale_code || 'Venda').trim()
    const total = data.total || 0
    const items = Array.isArray(data.items) ? data.items : []
    const paymentMethod = data.payment_method || 'Pagamento'
    const date = data.date || new Date().toISOString()

    if (!email || !email.includes('@')) {
      return e.json(400, { error: 'E-mail inválido informado para o comprovante.' })
    }

    let itemsHtml = items
      .map(
        (it) =>
          `<tr>
            <td style="padding: 8px; border-bottom: 1px solid #E5DFD5;">${it.quantity}x ${it.description}</td>
            <td style="padding: 8px; border-bottom: 1px solid #E5DFD5; text-align: right; font-weight: bold;">R$ ${Number(
              it.total || it.unit_price * it.quantity || 0,
            )
              .toFixed(2)
              .replace('.', ',')}</td>
          </tr>`,
      )
      .join('')

    const htmlBody = `
      <div style="font-family: Arial, sans-serif; max-width: 550px; margin: 0 auto; border: 1px solid #E5DFD5; border-radius: 12px; padding: 24px; background-color: #FFFFFF; color: #2D2A26;">
        <div style="text-align: center; border-bottom: 2px solid #C6A664; padding-bottom: 16px;">
          <h1 style="color: #7A5C2E; font-size: 22px; margin: 0; text-transform: uppercase; letter-spacing: 2px;">Scaglioni Joias</h1>
          <p style="margin: 4px 0 0; font-size: 11px; color: #6B655E; letter-spacing: 1px;">ALTA JOALHERIA & CONIGNAÇÃO</p>
        </div>

        <div style="margin-top: 20px; font-size: 13px;">
          <p>Olá, <strong>${customerName}</strong>!</p>
          <p>Segue o comprovante da sua compra realizada em nossa joalheria:</p>
          
          <div style="background-color: #FDFBF7; border: 1px solid #E5DFD5; border-radius: 8px; padding: 12px; margin: 16px 0;">
            <p style="margin: 2px 0;"><strong>Código da Venda:</strong> ${saleCode}</p>
            <p style="margin: 2px 0;"><strong>Data:</strong> ${new Date(date).toLocaleString('pt-BR')}</p>
            <p style="margin: 2px 0;"><strong>Forma de Pagamento:</strong> ${paymentMethod.toUpperCase()}</p>
          </div>

          <table style="width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 12px;">
            <thead>
              <tr style="background-color: #F3EAD8; color: #7A5C2E;">
                <th style="padding: 8px; text-align: left;">Item</th>
                <th style="padding: 8px; text-align: right;">Total</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
            <tfoot>
              <tr>
                <td style="padding: 12px 8px; font-weight: bold; font-size: 14px;">Total Pago:</td>
                <td style="padding: 12px 8px; font-weight: bold; font-size: 16px; color: #7A5C2E; text-align: right;">R$ ${Number(total).toFixed(2).replace('.', ',')}</td>
              </tr>
            </tfoot>
          </table>

          <div style="margin-top: 24px; text-align: center; border-top: 1px solid #E5DFD5; padding-top: 16px; font-size: 11px; color: #6B655E;">
            <p style="margin: 0;">Agradecemos pela preferência e confiança!</p>
            <p style="margin: 4px 0 0;">Garantia de autenticidade Scaglioni Joias.</p>
          </div>
        </div>
      </div>
    `

    // Attempt to send email
    try {
      const mailer = $app.newMailClient()
      const message = new Mail()
      message.from = {
        address: $app.settings().meta.senderAddress || 'joias@scaglioni.com.br',
        name: $app.settings().meta.senderName || 'Scaglioni Joias',
      }
      message.to = [{ address: email, name: customerName }]
      message.subject = `Comprovante Scaglioni Joias — Venda ${saleCode}`
      message.html = htmlBody

      mailer.send(message)

      return e.json(200, {
        success: true,
        sent: true,
        message: 'Comprovante enviado com sucesso para ' + email,
      })
    } catch (mailErr) {
      console.warn('[Scaglioni] Servidor SMTP não configurado ou erro ao despachar:', mailErr)
      return e.json(200, {
        success: true,
        sent: false,
        warning:
          'Comprovante gerado com sucesso, mas o servidor de e-mail (SMTP) ainda não está ativo no ambiente.',
        message: 'Comprovante preparado para ' + email,
      })
    }
  } catch (err) {
    return e.json(500, { error: 'Erro interno ao processar envio: ' + err.message })
  }
})
