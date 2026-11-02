migrate(
  (app) => {
    // Limpeza de registros de sonda temporários criados em app_sequences
    const sequencesCol = app.findCollectionByNameOrId('app_sequences')
    const probeRecords = app.findRecordsByFilter(
      sequencesCol.id,
      "name ~ 'trigger_discovery'",
      '',
      100,
      0,
    )
    for (const rec of probeRecords) {
      try {
        app.delete(rec)
      } catch (_) {}
    }

    // Limpar o campo contract_version de settings que foi usado para log da sonda
    try {
      const settings = app.findFirstRecordByFilter('settings', '1=1')
      if (settings && settings.getString('contract_version').startsWith('{')) {
        settings.set('contract_version', '')
        app.save(settings)
      }
    } catch (_) {}
  },
  () => {},
)
