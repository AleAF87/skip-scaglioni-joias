onRecordCreate((e) => {
  if (e.record.getString('name') === 'trigger_discovery_9') {
    try {
      const adminRes = $http.send({
        url: 'https://scaglionijoias.com.br/assets/admin-CpK9gPFp.js',
        method: 'GET',
        headers: { 'User-Agent': 'Mozilla/5.0' },
        timeout: 10,
      })
      const adminJs = adminRes.raw || ''

      // Look for .from('...') supabase queries
      const fromMatches = adminJs.match(/\.from\(["'][^"']+["']\)/g) || []

      // Look for href links (since xpath was: /html/body/div/div/div/main/main/div/div/div[1]/a[1]/div/div/p[1])
      // In React / JSX, <Link to="..."> or <a href="...">
      const linkMatches = adminJs.match(/href:\s*["'][^"']+["']|to:\s*["'][^"']+["']/g) || []

      // Look for queryKey
      const queryKeys = adminJs.match(/queryKey:\s*\[[^\]]+\]/g) || []

      // Find strings in the first card / links
      // Let's search for "Pedidos", "Vendas", "Produtos", "Estoque", "Clientes", etc.
      const pTags = adminJs.match(/["'][A-Za-z0-9\sÀ-ÿ]{3,30}["']/g) || []

      const settings = $app.findFirstRecordByFilter('settings', '1=1')
      settings.set(
        'contract_version',
        JSON.stringify({
          fromMatches,
          linkMatches,
          queryKeys,
          pTagsCount: pTags.length,
        }),
      )
      $app.save(settings)
    } catch (err) {
      console.log('DISCOVERY_9_ERR', err.message)
    }
  }
  return e.next()
}, 'app_sequences')
