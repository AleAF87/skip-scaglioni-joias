migrate(
  (app) => {
    const brands = app.findCollectionByNameOrId('brands')

    // Garante que a marca Scaglioni exista
    try {
      app.findFirstRecordByData('brands', 'name', 'Scaglioni')
    } catch (_) {
      const brand = new Record(brands)
      brand.set('name', 'Scaglioni')
      brand.set('slug', 'scaglioni')
      app.save(brand)
    }
  },
  (app) => {
    // Revert opcional no-op para manter integridade
  },
)
