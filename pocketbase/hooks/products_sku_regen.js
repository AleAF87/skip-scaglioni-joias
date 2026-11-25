// POST /backend/v1/products/regenerate-sku
// Body: { productId: string, nome?: string, tipo: string, metal: string }
//
// Gera a SKU e-commerce pela REGRA COMPARTILHADA ($app_skuRule, v0.0.215):
// 2 letras do TIPO + 2 do METAL + inicial de cada palavra do nome livre +
// numerador de 2 dígitos (01, 02...), verificando as SKUs já existentes para
// evitar duplicidade. NÃO grava nada: devolve a SKU candidata para o modal de
// edição preencher o campo — a gravação acontece no update do produto, que
// passa de novo pelo hook products_sku_rule.js (anti-duplicidade no servidor).
routerAdd(
  'POST',
  '/backend/v1/products/regenerate-sku',
  (e) => {
    try {
      // JSVM: cada handler roda em contexto isolado — o helper compartilhado
      // ($app_skuRule) precisa ser carregado via require() DENTRO do handler.
      const $app_skuRule = require(`${__hooks}/products_sku_rule.js`)
      const body = e.requestInfo().body || {}
      const productId = String(body.productId || '').trim()
      if (!productId) {
        return e.json(400, { error: 'Parâmetro productId é obrigatório.' })
      }
      const tipo = String(body.tipo || '').trim()
      const metal = String(body.metal || '').trim()
      if (!tipo || !metal) {
        return e.json(400, {
          error: 'Tipo e Metal são obrigatórios para gerar a SKU.',
        })
      }

      let record = null
      try {
        record = $app.findRecordById('products', productId)
      } catch (_) {}
      if (!record) {
        return e.json(404, { error: 'Produto não encontrado.' })
      }

      // Nome digitado no modal (pode diferir do gravado): usa apenas para o
      // cálculo das iniciais — o registro NÃO é persistido aqui.
      const nome = String(body.nome || '').trim()
      if (nome) record.set('nome_produto', nome)

      const sku = $app_skuRule.generateForRecord(record, tipo, metal, '', $app)
      if (!sku) {
        return e.json(200, {
          sku: '',
          regra: 'letras insuficientes — verifique Tipo/Metal/nome',
        })
      }
      return e.json(200, { sku: sku, regra: 'tipo+metal+iniciais+numerador' })
    } catch (err) {
      console.log('Erro em /backend/v1/products/regenerate-sku:', err.message)
      return e.json(500, { error: 'Falha ao gerar SKU: ' + err.message })
    }
  },
  $apis.requireAuth(),
)
