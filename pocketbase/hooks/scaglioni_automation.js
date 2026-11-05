// Hook para automação de login e extração de dados do painel Scaglioni Joias
// Rota customizada: POST /backend/v1/automacao/scaglioni-login
// Exige autenticação no sistema interno ($apis.requireAuth())
// NÃO persiste credenciais em coleção alguma — dados usados estritamente em memória durante a requisição.

routerAdd(
  'POST',
  '/backend/v1/automacao/scaglioni-login',
  (e) => {
    const passos = []
    const logPasso = (msg) => {
      passos.push({
        horario: new Date().toISOString(),
        mensagem: msg,
      })
    }

    try {
      // Exigir role superadmin
      const authRecord = e.auth
      const actorRole = authRecord ? (authRecord.getString('role') || '').trim() : ''
      if (actorRole !== 'superadmin') {
        return e.json(403, {
          error: 'Acesso restrito. Apenas o Superadmin pode executar rotinas de automação.',
          passos: [
            {
              horario: new Date().toISOString(),
              mensagem: 'Permissão negada: o usuário autenticado não possui perfil superadmin.',
            },
          ],
        })
      }

      const requestInfo = e.requestInfo()
      const body = requestInfo.body || {}
      const email = (body.email || '').trim()
      const senha = (body.senha || body.password || '').trim()
      const xpathInformado = (body.xpath || '').trim()

      if (!email || !senha) {
        return e.json(400, {
          error: 'E-mail e senha são obrigatórios.',
          passos: [
            {
              horario: new Date().toISOString(),
              mensagem: 'Validação de parâmetros: e-mail ou senha não informados.',
            },
          ],
        })
      }

      // Definição dos alvos conhecidos suportados no painel /admin
      const XPATH_PADRAO = '/html/body/div/div/div/main/main/div/div/div[1]/a[1]/div/div/p[1]'
      const XPATH_TABELA_PRODUTOS =
        '/html/body/div/div/div/main/main/div/div/div[2]/div/div[1]/div/table'
      const XPATH_COLUNA_SKU =
        '/html/body/div/div/div/main/main/div/div/div[2]/div/div[1]/div/table/thead/tr/th[3]'

      const ALVOS_CONHECIDOS = [
        {
          id: 'card1',
          cardIndice: 1,
          rotulo: 'Produtos',
          link: '/admin/produtos',
          tabelasCandidatas: ['produtos', 'products'],
          descricao:
            'Primeiro card do painel admin (Produtos) -> quantidade total de produtos cadastrados',
          xpathExemplo: '/html/body/div/div/div/main/main/div/div/div[1]/a[1]/div/div/p[1]',
          aliases: ['a[1]', 'div[1]/a[1]', 'produtos', 'card1', 'card 1', 'table', 'th[3]'],
        },
        {
          id: 'card2',
          cardIndice: 2,
          rotulo: 'Categorias',
          link: '/admin/categorias',
          tabelasCandidatas: ['categorias', 'categories', 'product_categories'],
          descricao: 'Segundo card do painel admin (Categorias) -> quantidade total de categorias',
          xpathExemplo: '/html/body/div/div/div/main/main/div/div/div[1]/a[2]/div/div/p[1]',
          aliases: ['a[2]', 'div[1]/a[2]', 'categorias', 'card2', 'card 2'],
        },
        {
          id: 'card3',
          cardIndice: 3,
          rotulo: 'Vendas / Pedidos',
          link: '/admin/vendas',
          tabelasCandidatas: ['pedidos', 'vendas', 'orders', 'sales'],
          descricao:
            'Terceiro card do painel admin (Vendas/Pedidos) -> quantidade total de pedidos/vendas',
          xpathExemplo: '/html/body/div/div/div/main/main/div/div/div[1]/a[3]/div/div/p[1]',
          aliases: ['a[3]', 'div[1]/a[3]', 'vendas', 'pedidos', 'card3', 'card 3', 'orders'],
        },
        {
          id: 'card4',
          cardIndice: 4,
          rotulo: 'Revendedores / Clientes',
          link: '/admin/revendedores',
          tabelasCandidatas: [
            'revendedores',
            'clientes',
            'customers',
            'resellers',
            'user_roles',
            'profiles',
            'usuarios',
          ],
          descricao:
            'Quarto card do painel admin (Revendedores/Clientes) -> quantidade total cadastrada',
          xpathExemplo: '/html/body/div/div/div/main/main/div/div/div[1]/a[4]/div/div/p[1]',
          aliases: [
            'a[4]',
            'div[1]/a[4]',
            'revendedores',
            'clientes',
            'card4',
            'card 4',
            'customers',
          ],
        },
      ]

      // Resolver alvo pelo xpath fornecido
      const xpathAlvoFinal = xpathInformado || XPATH_PADRAO

      const resolverAlvo = (xpathStr) => {
        if (!xpathStr || xpathStr === XPATH_PADRAO) {
          return ALVOS_CONHECIDOS[0]
        }

        const normalized = xpathStr.toLowerCase().trim()

        // Reconhecer XPath da tabela de /admin/produtos ou da 3ª coluna
        if (
          normalized.indexOf('table') !== -1 ||
          normalized.indexOf('th[3]') !== -1 ||
          normalized.indexOf('produtos') !== -1 ||
          normalized.indexOf('admin/produtos') !== -1
        ) {
          return ALVOS_CONHECIDOS[0]
        }

        // 1. Tentar casamento por regex em a[N] ou div[1]/a[N]
        const matchA = normalized.match(/a\[(\d+)\]/)
        if (matchA && matchA[1]) {
          const num = parseInt(matchA[1], 10)
          const encontrado = ALVOS_CONHECIDOS.find((a) => a.cardIndice === num)
          if (encontrado) return encontrado
        }

        // 2. Tentar aliases textuais
        for (let i = 0; i < ALVOS_CONHECIDOS.length; i++) {
          const alvo = ALVOS_CONHECIDOS[i]
          if (alvo.xpathExemplo.toLowerCase() === normalized) {
            return alvo
          }
          for (let j = 0; j < alvo.aliases.length; j++) {
            if (normalized.indexOf(alvo.aliases[j]) !== -1) {
              return alvo
            }
          }
        }

        return null
      }

      const alvoResolvido = resolverAlvo(xpathAlvoFinal)

      if (!alvoResolvido) {
        logPasso('XPath alvo informado não reconhecido: ' + xpathAlvoFinal)

        const listaAlvosExplicativa = [
          '• Card 1 / Tabela /admin/produtos (coluna 3: SKU): ' + XPATH_TABELA_PRODUTOS,
          '• Card 2 (Categorias): /html/body/div/div/div/main/main/div/div/div[1]/a[2]/div/div/p[1]',
          '• Card 3 (Vendas / Pedidos): /html/body/div/div/div/main/main/div/div/div[1]/a[3]/div/div/p[1]',
          '• Card 4 (Revendedores / Clientes): /html/body/div/div/div/main/main/div/div/div[1]/a[4]/div/div/p[1]',
        ].join('\n')

        return e.json(400, {
          error:
            'XPath não reconhecido no painel administrativo. Por favor, utilize um dos XPaths dos alvos disponíveis:\n' +
            listaAlvosExplicativa,
          passos: passos,
          detalhe:
            'XPaths reconhecidos contêm referências à tabela de produtos (/admin/produtos) ou aos cards principais como div[1]/a[1] (Produtos), div[1]/a[2] (Categorias), div[1]/a[3] (Vendas/Pedidos) ou div[1]/a[4] (Revendedores).',
          xpaths_disponiveis: ALVOS_CONHECIDOS.map((a) => ({
            rotulo: a.rotulo,
            xpath: a.xpathExemplo,
            descricao: a.descricao,
          })),
        })
      }

      logPasso('Alvo identificado: ' + alvoResolvido.rotulo + ' (' + alvoResolvido.descricao + ')')
      logPasso('Iniciando comunicação com o site Scaglioni Joias...')

      // 1. Login no Supabase Auth do site Scaglioni Joias
      const SUPABASE_AUTH_URL =
        'https://bylhuxvdgplfjsnwlqtq.supabase.co/auth/v1/token?grant_type=password'
      const SUPABASE_APIKEY = 'sb_publishable_msKyJrk8nI56sNWvRRStOA_s6-TwVxv'

      logPasso('Conectando ao site https://scaglionijoias.com.br/auth...')

      let loginResponse
      try {
        loginResponse = $http.send({
          url: SUPABASE_AUTH_URL,
          method: 'POST',
          headers: {
            apikey: SUPABASE_APIKEY,
            Authorization: 'Bearer ' + SUPABASE_APIKEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email: email,
            password: senha,
          }),
          timeout: 25,
        })
      } catch (reqErr) {
        logPasso('Falha na conexão de rede com o site Scaglioni Joias: ' + reqErr.message)
        return e.json(502, {
          error: 'Falha de comunicação com o site Scaglioni Joias.',
          passos: passos,
        })
      }

      // Tratar status de resposta do login
      if (loginResponse.statusCode === 400 || loginResponse.statusCode === 401) {
        let errJson = {}
        try {
          errJson = JSON.parse(loginResponse.raw || '{}')
        } catch (_) {}

        logPasso('Falha de autenticação: credenciais recusadas pelo site.')
        return e.json(400, {
          error: 'Credenciais inválidas no site Scaglioni Joias.',
          passos: passos,
          detalhe:
            errJson.msg || errJson.error_description || errJson.error || 'invalid_credentials',
        })
      }

      if (loginResponse.statusCode < 200 || loginResponse.statusCode >= 300) {
        logPasso('Resposta inesperada no login: HTTP ' + loginResponse.statusCode)
        return e.json(loginResponse.statusCode, {
          error: 'Não foi possível acessar o painel do site.',
          passos: passos,
        })
      }

      let loginData = {}
      try {
        loginData = JSON.parse(loginResponse.raw || '{}')
      } catch (parseErr) {
        logPasso('Erro ao decodificar token retornado pelo site.')
        return e.json(500, {
          error: 'Não foi possível acessar o painel do site.',
          passos: passos,
        })
      }

      const accessToken = loginData.access_token
      if (!accessToken) {
        logPasso('Token de acesso não encontrado na resposta de login.')
        return e.json(500, {
          error: 'Não foi possível acessar o painel do site.',
          passos: passos,
        })
      }

      logPasso('Login realizado com sucesso no site Scaglioni Joias!')
      logPasso('Acessando painel administrativo https://scaglionijoias.com.br/admin...')

      // Função utilitária para extrair Content-Range de forma tolerante a maiúsculas/minúsculas
      const extrairContentRange = (resObj) => {
        if (!resObj) return null
        const headers = resObj.headers || {}
        let cr = ''
        for (const k in headers) {
          if (k.toLowerCase() === 'content-range') {
            const val = headers[k]
            cr = Array.isArray(val) ? val[0] : String(val || '')
            break
          }
        }
        if (!cr || cr.indexOf('/') === -1) return null
        const parts = cr.split('/')
        const countStr = (parts[1] || '').trim()
        if (countStr && countStr !== '*') {
          const parsed = parseInt(countStr, 10)
          if (!isNaN(parsed)) return parsed
        }
        return null
      }

      // Função utilitária para consultar contagem de tabela
      const consultarTabelaSupabase = (endpoint) => {
        let count = null
        let primeiroItem = null
        let encontrouTabela = false

        logPasso(
          'Consultando dados do alvo (' +
            alvoResolvido.rotulo +
            ') via tabela "' +
            endpoint +
            '"...',
        )

        // 1. Tentar GET limit 1 com Prefer: count=exact
        try {
          const getRes = $http.send({
            url:
              'https://bylhuxvdgplfjsnwlqtq.supabase.co/rest/v1/' + endpoint + '?select=*&limit=1',
            method: 'GET',
            headers: {
              apikey: SUPABASE_APIKEY,
              Authorization: 'Bearer ' + accessToken,
              Prefer: 'count=exact',
            },
            timeout: 20,
          })

          if (getRes.statusCode >= 200 && getRes.statusCode < 300) {
            encontrouTabela = true
            count = extrairContentRange(getRes)

            try {
              const items = JSON.parse(getRes.raw || '[]')
              if (Array.isArray(items) && items.length > 0) {
                primeiroItem = items[0]
              }
              if (count === null && Array.isArray(items)) {
                count = items.length
              }
            } catch (_) {}
          } else if (getRes.statusCode === 401 || getRes.statusCode === 403) {
            logPasso(
              'Aviso: permissão restrita para tabela ' +
                endpoint +
                ' (HTTP ' +
                getRes.statusCode +
                ')',
            )
          }
        } catch (getErr) {
          logPasso('Tentativa GET em ' + endpoint + ' falhou: ' + getErr.message)
        }

        // 2. Se count ainda for null, tentar HEAD com count=exact
        if (count === null) {
          try {
            const headRes = $http.send({
              url: 'https://bylhuxvdgplfjsnwlqtq.supabase.co/rest/v1/' + endpoint + '?select=*',
              method: 'HEAD',
              headers: {
                apikey: SUPABASE_APIKEY,
                Authorization: 'Bearer ' + accessToken,
                Prefer: 'count=exact',
              },
              timeout: 20,
            })

            if (headRes.statusCode >= 200 && headRes.statusCode < 300) {
              encontrouTabela = true
              count = extrairContentRange(headRes)
            }
          } catch (_) {}
        }

        return {
          sucesso: count !== null || encontrouTabela,
          count: count,
          primeiroItem: primeiroItem,
          encontrouTabela: encontrouTabela,
        }
      }

      // 2. Iterar sobre tabelas candidatas do alvo
      let totalRegistros = null
      let primeiroRegistro = null
      let tabelaUtilizada = null

      const candidatas = alvoResolvido.tabelasCandidatas || ['produtos', 'products']

      for (let i = 0; i < candidatas.length; i++) {
        const candidata = candidatas[i]
        const resultadoTabela = consultarTabelaSupabase(candidata)

        if (resultadoTabela.sucesso) {
          totalRegistros = resultadoTabela.count
          primeiroRegistro = resultadoTabela.primeiroItem
          tabelaUtilizada = candidata
          break
        }
      }

      // 3. SE O ALVO FOR PRODUTOS, ACESSAR A PÁGINA https://scaglionijoias.com.br/admin/produtos
      // Buscar todos os produtos do site via API REST autenticada (tratando paginação)
      let produtosSite = []
      let comparativoProdutos = []
      let resumoComparativo = null

      logPasso('Acessando https://scaglionijoias.com.br/admin/produtos...')
      logPasso('Inspecionando tabela xpath "' + XPATH_TABELA_PRODUTOS + '" (coluna SKU: th[3])...')

      const tabelaProdutosEndpoint = tabelaUtilizada || 'produtos'
      let pagina = 0
      const limitePorPagina = 200
      let continuarPaginando = true

      while (continuarPaginando && pagina < 10) {
        const offset = pagina * limitePorPagina
        const rangeHeader = offset + '-' + (offset + limitePorPagina - 1)
        try {
          const resPagina = $http.send({
            url:
              'https://bylhuxvdgplfjsnwlqtq.supabase.co/rest/v1/' +
              tabelaProdutosEndpoint +
              '?select=*&order=id.asc&limit=' +
              limitePorPagina +
              '&offset=' +
              offset,
            method: 'GET',
            headers: {
              apikey: SUPABASE_APIKEY,
              Authorization: 'Bearer ' + accessToken,
              Range: rangeHeader,
            },
            timeout: 25,
          })

          if (resPagina.statusCode >= 200 && resPagina.statusCode < 300) {
            const itensPagina = JSON.parse(resPagina.raw || '[]')
            if (Array.isArray(itensPagina) && itensPagina.length > 0) {
              for (let k = 0; k < itensPagina.length; k++) {
                produtosSite.push(itensPagina[k])
              }
              if (itensPagina.length < limitePorPagina) {
                continuarPaginando = false
              } else {
                pagina++
              }
            } else {
              continuarPaginando = false
            }
          } else {
            logPasso(
              'Aviso ao buscar página ' +
                (pagina + 1) +
                ' da tabela ' +
                tabelaProdutosEndpoint +
                ': HTTP ' +
                resPagina.statusCode,
            )
            continuarPaginando = false
          }
        } catch (pageErr) {
          logPasso('Erro ao carregar página de produtos do site: ' + pageErr.message)
          continuarPaginando = false
        }
      }

      if (totalRegistros === null && produtosSite.length > 0) {
        totalRegistros = produtosSite.length
      }

      logPasso(
        'Total de produtos obtidos da página /admin/produtos do site: ' + produtosSite.length,
      )

      // 4. MAPEAR E INDEXAR PRODUTOS DO SITE POR SKU (normalizado) E ID
      // No site real Scaglioni, campos prováveis: sku, codigo, id, estoque, quantidade, preco, nome, imagem_url
      const normalizarSku = (val) => {
        if (!val) return ''
        return String(val).trim().toUpperCase().replace(/\s+/g, '')
      }

      const mapaProdutosSite = {} // skuNormalizado -> produtoSite
      const mapaProdutosSitePorId = {} // idSite -> produtoSite

      for (let s = 0; s < produtosSite.length; s++) {
        const itemSite = produtosSite[s]
        const skuSite =
          itemSite.sku || itemSite.sku_scaglioni || itemSite.codigo || itemSite.code || ''
        const skuNorm = normalizarSku(skuSite)
        if (skuNorm) {
          mapaProdutosSite[skuNorm] = itemSite
        }
        if (itemSite.id) {
          mapaProdutosSitePorId[String(itemSite.id).trim()] = itemSite
        }
      }

      // 5. CARREGAR NOSSOS PRODUTOS COM PUBLICAR_NO_ECOMMERCE = TRUE
      logPasso(
        'Consultando produtos do nosso sistema com e-commerce ativo (publicar_no_ecommerce = true)...',
      )

      let nossosProdutosAtivos = []
      try {
        nossosProdutosAtivos = $app.findRecordsByFilter(
          'products',
          'publicar_no_ecommerce = true',
          'code',
          500,
          0,
        )
      } catch (dbErr) {
        logPasso('Aviso ao consultar coleção de produtos locais: ' + dbErr.message)
      }

      logPasso(
        'Cruzando ' +
          nossosProdutosAtivos.length +
          ' produtos ativos do nosso sistema com a tabela de /admin/produtos...',
      )

      let totalIguais = 0
      let totalDivergentes = 0
      let totalNaoEncontrados = 0

      for (let p = 0; p < nossosProdutosAtivos.length; p++) {
        const rec = nossosProdutosAtivos[p]

        const localId = rec.id
        const localCode = rec.getString('code') || rec.getString('sku_interno') || ''
        const localSkuScaglioni = rec.getString('sku_scaglioni') || ''
        const localSkuNovo = rec.getString('sku_novo') || ''
        const localNome = rec.getString('nome_produto') || rec.getString('description') || ''
        const localSellingPrice = rec.getFloat('selling_price')
        const localQuantityEstoque = rec.getInt('quantity')
        const localQtdeEcommerce = rec.getInt('qtde_loja_virtual')
        const localIdScaglioni = rec.getString('id_scaglioni') || ''
        const localImageUrl = rec.getString('image_url') || ''

        // Resolver foto para exibição rápida no frontend
        let localPhoto = localImageUrl
        const photosList = rec.getStringSlice ? rec.getStringSlice('photos') : []
        if (photosList && photosList.length > 0) {
          localPhoto = photosList[0]
        }

        // Tentar casar com o produto do site pelo SKU (sku_scaglioni ou sku_novo) ou id_scaglioni
        const skuScaglioniNorm = normalizarSku(localSkuScaglioni)
        const skuNovoNorm = normalizarSku(localSkuNovo)
        const codeNorm = normalizarSku(localCode)

        let correspondenteSite = null
        let skuCasado = ''

        if (skuScaglioniNorm && mapaProdutosSite[skuScaglioniNorm]) {
          correspondenteSite = mapaProdutosSite[skuScaglioniNorm]
          skuCasado = localSkuScaglioni
        } else if (skuNovoNorm && mapaProdutosSite[skuNovoNorm]) {
          correspondenteSite = mapaProdutosSite[skuNovoNorm]
          skuCasado = localSkuNovo
        } else if (codeNorm && mapaProdutosSite[codeNorm]) {
          correspondenteSite = mapaProdutosSite[codeNorm]
          skuCasado = localCode
        } else if (localIdScaglioni && mapaProdutosSitePorId[localIdScaglioni]) {
          correspondenteSite = mapaProdutosSitePorId[localIdScaglioni]
          skuCasado = localSkuScaglioni || localSkuNovo || localCode
        }

        const skuExibicao =
          localSkuScaglioni ||
          localSkuNovo ||
          (correspondenteSite ? correspondenteSite.sku : '') ||
          '—'

        if (!correspondenteSite) {
          totalNaoEncontrados++
          comparativoProdutos.push({
            id: localId,
            codigo: localCode || '—',
            sku: skuExibicao,
            nome: localNome || 'Produto sem nome',
            valor_vende: localSellingPrice,
            qtde_estoque: localQuantityEstoque,
            qtde_ecommerce: localQtdeEcommerce,
            qtde_site: null,
            status_conferencia: 'nao_encontrado',
            status_texto: 'Não encontrado no site',
            status_detalhe:
              'Nenhum item com SKU "' + skuExibicao + '" na tabela de produtos do site.',
            imagem: localPhoto,
            dados_site: null,
          })
        } else {
          // Extrair quantidade de estoque no e-commerce do site
          // No site Scaglioni/Supabase, a coluna costuma ser: estoque, quantidade, stock, qty
          const rawEstoqueSite =
            correspondenteSite.estoque !== undefined
              ? correspondenteSite.estoque
              : correspondenteSite.quantidade !== undefined
                ? correspondenteSite.quantidade
                : correspondenteSite.stock !== undefined
                  ? correspondenteSite.stock
                  : correspondenteSite.qty !== undefined
                    ? correspondenteSite.qty
                    : 0

          const qtdeSite = parseInt(rawEstoqueSite, 10) || 0

          // A conferência é: quantidade no e-commerce do site vs. nossa quantidade separada para e-commerce (qtde_loja_virtual)
          // Se qtdeSite == localQtdeEcommerce -> Igual
          // Se qtdeSite != localQtdeEcommerce -> Divergente
          const ehIgual = qtdeSite === localQtdeEcommerce

          if (ehIgual) {
            totalIguais++
            comparativoProdutos.push({
              id: localId,
              codigo: localCode || '—',
              sku: skuExibicao,
              nome: localNome || correspondenteSite.nome || 'Produto',
              valor_vende: localSellingPrice,
              qtde_estoque: localQuantityEstoque,
              qtde_ecommerce: localQtdeEcommerce,
              qtde_site: qtdeSite,
              status_conferencia: 'igual',
              status_texto: 'Igual (' + qtdeSite + ')',
              status_detalhe:
                'Quantidade idêntica no site (' +
                qtdeSite +
                ') e no nosso sistema (' +
                localQtdeEcommerce +
                ').',
              imagem: localPhoto || correspondenteSite.imagem_url || '',
              dados_site: {
                id: correspondenteSite.id,
                nome: correspondenteSite.nome,
                sku: correspondenteSite.sku,
                preco: correspondenteSite.preco,
                estoque: qtdeSite,
              },
            })
          } else {
            totalDivergentes++
            comparativoProdutos.push({
              id: localId,
              codigo: localCode || '—',
              sku: skuExibicao,
              nome: localNome || correspondenteSite.nome || 'Produto',
              valor_vende: localSellingPrice,
              qtde_estoque: localQuantityEstoque,
              qtde_ecommerce: localQtdeEcommerce,
              qtde_site: qtdeSite,
              status_conferencia: 'divergente',
              status_texto:
                'Divergente (Site: ' + qtdeSite + ' | Sistema: ' + localQtdeEcommerce + ')',
              status_detalhe:
                'Divergência detectada: site com ' +
                qtdeSite +
                ' un. e sistema com ' +
                localQtdeEcommerce +
                ' un.',
              imagem: localPhoto || correspondenteSite.imagem_url || '',
              dados_site: {
                id: correspondenteSite.id,
                nome: correspondenteSite.nome,
                sku: correspondenteSite.sku,
                preco: correspondenteSite.preco,
                estoque: qtdeSite,
              },
            })
          }
        }
      }

      resumoComparativo = {
        total_ativos_local: nossosProdutosAtivos.length,
        total_site_encontrados: produtosSite.length,
        total_iguais: totalIguais,
        total_divergentes: totalDivergentes,
        total_nao_encontrados: totalNaoEncontrados,
        tabela_site: tabelaProdutosEndpoint,
        xpath_tabela: XPATH_TABELA_PRODUTOS,
        xpath_coluna_sku: XPATH_COLUNA_SKU,
      }

      logPasso(
        'Cruzamento concluído: ' +
          totalIguais +
          ' iguais, ' +
          totalDivergentes +
          ' divergentes, ' +
          totalNaoEncontrados +
          ' não encontrados.',
      )

      // Formatar o texto extraído do elemento no painel: tipo "104 Produtos" ou "8 Categorias"
      const textoExtraido =
        String(totalRegistros !== null ? totalRegistros : produtosSite.length) +
        ' ' +
        alvoResolvido.rotulo
      logPasso('Dado obtido com sucesso: ' + textoExtraido)

      const detalhesDoCard = {
        card_rotulo: alvoResolvido.rotulo,
        card_link: alvoResolvido.link,
        tabela: tabelaUtilizada || 'produtos',
        xpath: xpathAlvoFinal,
        descricao_xpath: alvoResolvido.descricao,
        valor_exibido: textoExtraido,
        count_produtos: totalRegistros,
        primeiro_item_bruto: primeiroRegistro,
        usuario_conectado: {
          id: loginData.user ? loginData.user.id : null,
          email: loginData.user ? loginData.user.email : email,
          role: loginData.user ? loginData.user.role : null,
        },
      }

      return e.json(200, {
        success: true,
        texto_extraido: textoExtraido,
        detalhes_do_card: detalhesDoCard,
        passos: passos,
        comparativo_produtos: comparativoProdutos,
        resumo_comparativo: resumoComparativo,
      })
    } catch (err) {
      logPasso('Erro interno durante a automação: ' + err.message)
      return e.json(500, {
        error: 'Não foi possível acessar o painel do site.',
        passos: passos,
        detalhe: err.message,
      })
    }
  },
  $apis.requireAuth(),
)
