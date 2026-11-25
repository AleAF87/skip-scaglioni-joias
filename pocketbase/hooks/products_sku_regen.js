// POST /backend/v1/products/regenerate-sku
// Body: { productId: string, nome?: string, tipo: string, metal: string }
//
// Gera a SKU e-commerce pela REGRA COMPARTILHADA (v0.0.215, agora INLINE — v0.0.257):
// 2 letras do TIPO + 2 do METAL + inicial de cada palavra do nome livre +
// numerador de 2 dígitos (01, 02...), verificando as SKUs já existentes para
// evitar duplicidade. NÃO grava nada: devolve a SKU candidata para o modal de
// edição preencher o campo — a gravação acontece no update do produto, que
// passa de novo pelo hook de update (anti-duplicidade no servidor).
//
// JSVM (v0.0.257): o handler roda em contexto isolado — nem variável global de
// nível superior ($app_skuRule is not defined), nem require() de módulo local
// ("Invalid module"), nem declaração de outro arquivo chegam ao handler. Por
// isso a regra vem DUPLICADA inline aqui (funções puras + $app via parâmetro).
routerAdd(
  'POST',
  '/backend/v1/products/regenerate-sku',
  (e) => {
    // ===== Início da regra INLINE (copiada de products_sku_rule.js — fonte de
    // verdade textual; cole em TODA atualização da regra) =====
    const skuRuleNormalize = (value) =>
      String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .replace(/\s+/g, ' ')
        .trim()
    const skuRuleTipoMap = { BRINCO: 'BR', COLAR: 'CO', PULSEIRA: 'PU', ANEL: 'AN' }
    const skuRuleMetalMap = { PRATA: 'PR', OURO: 'OU', RODIO: 'RO' }
    const skuRuleTipoLetters = (tipo) => {
      const t = skuRuleNormalize(tipo)
      if (!t) return ''
      if (skuRuleTipoMap[t]) return skuRuleTipoMap[t]
      const words = t.split(' ')
      for (let i = 0; i < words.length; i++) {
        if (skuRuleTipoMap[words[i]]) return skuRuleTipoMap[words[i]]
      }
      return t.replace(/[^A-Z]/g, '').slice(0, 2)
    }
    const skuRuleMetalLetters = (metal) => {
      const m = skuRuleNormalize(metal)
      if (!m) return ''
      const words = m.split(' ')
      for (let i = 0; i < words.length; i++) {
        if (skuRuleMetalMap[words[i]]) return skuRuleMetalMap[words[i]]
      }
      return m.replace(/[^A-Z]/g, '').slice(0, 2)
    }
    const skuRuleNomeLivreLetters = (nomeLivre) => {
      const n = skuRuleNormalize(nomeLivre)
      if (!n) return ''
      const words = n.split(' ').filter(Boolean)
      let out = ''
      for (let i = 0; i < words.length; i++) {
        const clean = words[i].replace(/[^A-Z]/g, '')
        if (clean) out += clean.charAt(0)
      }
      return out
    }
    const skuRuleBuildPrefix = (tipo, metal, nomeLivre) => {
      const t = skuRuleTipoLetters(tipo)
      const m = skuRuleMetalLetters(metal)
      const n = skuRuleNomeLivreLetters(nomeLivre)
      if (!t && !m && !n) return ''
      return t + m + n
    }
    const skuRuleDetectTipo = (nomeNorm) => {
      const words = skuRuleNormalize(nomeNorm).split(' ').filter(Boolean)
      for (let i = 0; i < words.length; i++) {
        const w = words[i]
        const singular = w.replace(/S$/, '')
        if (skuRuleTipoMap[w]) return w
        if (skuRuleTipoMap[singular]) return singular
      }
      return ''
    }
    const skuRuleDetectMetal = (nomeNorm) => {
      const words = skuRuleNormalize(nomeNorm).split(' ').filter(Boolean)
      for (let i = 0; i < words.length; i++) {
        if (skuRuleMetalMap[words[i]]) return words[i]
      }
      return ''
    }
    const skuRuleStripWords = (nomeNorm, phrases) => {
      let out = skuRuleNormalize(nomeNorm)
      for (let i = 0; i < phrases.length; i++) {
        const p = skuRuleNormalize(phrases[i])
        if (!p) continue
        const esc = p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        out = out
          .replace(new RegExp('(^|\\s)' + esc + '(?=\\s|$)'), ' ')
          .replace(/\s+/g, ' ')
          .trim()
      }
      return out
    }
    const skuRuleIsTaken = (app, candidate, excludeId) => {
      try {
        const rec = app.findFirstRecordByFilter(
          'products',
          "sku_ecommerce = '" + candidate.replace(/'/g, "\\'") + "'",
        )
        if (rec && (!excludeId || rec.id !== excludeId)) return true
      } catch (_) {}
      return false
    }
    const skuRuleGenerateFromHints = (app, record, tipoHint, metalHint, nomeLivreHint) => {
      let tipo = String(tipoHint || '')
      let metal = String(metalHint || '')
      let nomeLivre = String(nomeLivreHint || '')
      const nome = record.getString('nome_produto') || record.getString('description') || ''
      try {
        if (!tipo) {
          const tRec = record.get('type')
          if (tRec && tRec.getString('name')) tipo = tRec.getString('name')
        }
        if (!metal) {
          const mRec = record.get('material')
          if (mRec && mRec.getString('name')) metal = mRec.getString('name')
        }
      } catch (_) {}
      if (!tipo) tipo = skuRuleDetectTipo(nome)
      if (!metal) metal = skuRuleDetectMetal(nome)
      if (!nomeLivre) nomeLivre = skuRuleStripWords(nome, [tipo, metal])
      const prefix = skuRuleBuildPrefix(tipo, metal, nomeLivre)
      if (!prefix) return ''
      const excludeId = record.id || ''
      let n = 1
      while (n < 100) {
        const candidate = prefix + (n < 10 ? '0' + n : String(n))
        if (!skuRuleIsTaken(app, candidate, excludeId)) {
          record.set('sku_ecommerce', candidate)
          return candidate
        }
        n++
      }
      return ''
    }
    // ===== Fim da regra INLINE =====

    try {
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

      const sku = skuRuleGenerateFromHints($app, record, tipo, metal, '')
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
