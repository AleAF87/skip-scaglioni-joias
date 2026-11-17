/// Unificação de estoque (estoque único):
/// - quantity = quantity + qtde_loja_virtual (o saldo do e-commerce volta para o estoque geral)
/// - qtde_loja_virtual vira apenas o interruptor "Publicar no e-commerce" (1 = ativado, 0 = desativado)
/// - Todos os produtos entram ATIVADOS no e-commerce (decisão do usuário)
/// - Saldo derivado recalculado a partir de qtde_inicial e movimentação em initial_stocks
///   com id_origem determinístico (padrão products_totals / initial_stocks do projeto)
/// Idempotente: roda de novo sem duplicar saldo (só aplica quando qtde_loja_virtual > 1).

migrate(
  (app) => {
    const products = app.findRecordsByFilter('products', '', '', 100000, 0)
    let merged = 0
    let flagged = 0

    for (const p of products) {
      const ecom = p.getInt('qtde_loja_virtual') || 0
      const geral = p.getInt('quantity') || 0

      // Antes da unificação, qtde_loja_virtual era um SALDO (pode ser > 1).
      // Depois, é apenas o interruptor 1/0.
      if (ecom > 1) {
        p.set('quantity', geral + ecom)
        p.set('qtde_loja_virtual', 1)
        merged++
      } else if (ecom === 0) {
        p.set('qtde_loja_virtual', 0)
        flagged++
      } else {
        p.set('qtde_loja_virtual', 1)
        flagged++
      }

      // Recalcula o saldo derivado a partir da quantidade inicial (padrão products_totals)
      const qtdeInicial = p.getInt('qtde_inicial') || 0
      const newGeral = p.getInt('quantity') || 0
      if (qtdeInicial > 0 && newGeral === 0) {
        p.set('quantity', qtdeInicial)
      }

      app.save(p)

      // Movimentação de ajuste de estoque único (id_origem determinístico)
      if (ecom > 1) {
        const idOrigem = 'unifica-estoque-' + p.id
        const existing = app.findRecordsByFilter(
          'initial_stocks',
          "id_origem = '" + idOrigem + "'",
          '',
          1,
          0,
        )
        if (existing.length === 0) {
          const initCol = app.findCollectionByNameOrId('initial_stocks')
          const initRec = new Record(initCol)
          initRec.set('product', p.id)
          initRec.set('origem', 'Ajuste Estoque Único')
          initRec.set('id_origem', idOrigem)
          initRec.set('quantidade', ecom)
          initRec.set('localizacao', 'Unificação do saldo de e-commerce no estoque geral')
          initRec.set('data_registro', new Date().toISOString())
          initRec.set('is_ativo', true)
          initRec.set(
            'detalhes_distribuicao',
            JSON.stringify({ loja_fisica: ecom, expedicao: 0, revendedoras: [] }),
          )
          app.save(initRec)
        }
      }
    }

    console.log(
      '[unifica-estoque] produtos mesclados: ' +
        merged +
        ' | interruptor ajustado: ' +
        flagged +
        ' | total: ' +
        products.length,
    )
  },
  (app) => {
    // Rollback: sem reversão de dados (operação de mesclagem de estoque é destrutiva).
  },
)
