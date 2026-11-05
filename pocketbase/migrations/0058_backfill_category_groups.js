// Backfill idempotente: categorias de produto com `group` vazio recebem o grupo
// inferido pelo nome ('metal' para metais conhecidos, 'tipo' para o restante).
// A importação antiga (antes do hook products_import.js inferir o grupo) criou
// registros como PRATA, BRINCOS e SEMIJOIAS sem group, o que os esconde dos
// filtros Metal/Tipo da vitrine. Em um banco novo (sem registros com group
// vazio) esta migração não altera nada.
migrate(
  (app) => {
    try {
      const records = app.findRecordsByFilter('product_categories', "group = ''", '', 0, 0)
      if (!records || records.length === 0) {
        console.log('0058: nenhuma categoria com group vazio — nada a fazer.')
        return
      }
      let updated = 0
      for (let i = 0; i < records.length; i++) {
        const rec = records[i]
        const name = rec.getString('name') || ''
        const isMetal = /metal|ouro|prata|rodio|r[oó]dio|inox|a[çc]o|banho|dourad/i.test(name)
        rec.set('group', isMetal ? 'metal' : 'tipo')
        app.save(rec)
        updated++
      }
      console.log('0058: categorias com group preenchido: ' + updated)
    } catch (err) {
      console.log('0058 erro no backfill de grupos de categorias:', err && err.message)
    }
  },
  (app) => {
    // Reversão não aplicável (dados inferidos; manter estado atual).
  },
)
