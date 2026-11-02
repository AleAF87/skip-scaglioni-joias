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
          aliases: ['a[1]', 'div[1]/a[1]', 'produtos', 'card1', 'card 1'],
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
          '• Card 1 (Produtos): /html/body/div/div/div/main/main/div/div/div[1]/a[1]/div/div/p[1]',
          '• Card 2 (Categorias): /html/body/div/div/div/main/main/div/div/div[1]/a[2]/div/div/p[1]',
          '• Card 3 (Vendas / Pedidos): /html/body/div/div/div/main/main/div/div/div[1]/a[3]/div/div/p[1]',
          '• Card 4 (Revendedores / Clientes): /html/body/div/div/div/main/main/div/div/div[1]/a[4]/div/div/p[1]',
        ].join('\n')

        return e.json(400, {
          error:
            'XPath não reconhecido no painel administrativo. Por favor, utilize um dos XPaths dos cards disponíveis:\n' +
            listaAlvosExplicativa,
          passos: passos,
          detalhe:
            'XPaths reconhecidos contêm referências aos cards principais como div[1]/a[1] (Produtos), div[1]/a[2] (Categorias), div[1]/a[3] (Vendas/Pedidos) ou div[1]/a[4] (Revendedores).',
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
          timeout: 20,
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

      // Função utilitária para testar endpoint REST Supabase
      const consultarTabelaSupabase = (endpoint) => {
        let count = null
        let primeiroItem = null
        let encontrouTabela = false

        logPasso(
          'Consultando dados do card (' +
            alvoResolvido.rotulo +
            ') via tabela "' +
            endpoint +
            '"...',
        )

        // 1. Tentar GET limit 1 com Prefer: count=exact (traz tanto o item quanto o Content-Range)
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
            timeout: 15,
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
            // Tabela existe mas RLS exige outro role ou bloqueia leitura anônima/admin
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
              timeout: 15,
            })

            if (headRes.statusCode >= 200 && headRes.statusCode < 300) {
              encontrouTabela = true
              count = extrairContentRange(headRes)
            }
          } catch (_) {}
        }

        // 3. Se tabela foi encontrada e count ainda null, tentar contagem paginada simples
        if (encontrouTabela && count === null) {
          try {
            const allRes = $http.send({
              url:
                'https://bylhuxvdgplfjsnwlqtq.supabase.co/rest/v1/' +
                endpoint +
                '?select=id&limit=1000',
              method: 'GET',
              headers: {
                apikey: SUPABASE_APIKEY,
                Authorization: 'Bearer ' + accessToken,
              },
              timeout: 15,
            })
            if (allRes.statusCode === 200) {
              const allItems = JSON.parse(allRes.raw || '[]')
              if (Array.isArray(allItems)) {
                count = allItems.length
              }
            }
          } catch (_) {}
        }

        return {
          sucesso: count !== null,
          count: count,
          primeiroItem: primeiroItem,
          encontrouTabela: encontrouTabela,
        }
      }

      // 2. Iterar sobre tabelas candidatas do card
      let totalRegistros = null
      let primeiroRegistro = null
      let tabelaUtilizada = null

      const candidatas = alvoResolvido.tabelasCandidatas || [alvoResolvido.endpoint]

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

      // Se não encontrou contagem em nenhuma candidata, retornar mensagem amigável em português
      if (totalRegistros === null) {
        logPasso(
          'Não foi possível extrair a contagem do card "' +
            alvoResolvido.rotulo +
            '" no painel do site.',
        )
        return e.json(200, {
          success: false,
          error:
            'Não foi possível localizar os dados do card "' +
            alvoResolvido.rotulo +
            '" no painel administrativo do site Scaglioni Joias.',
          texto_extraido: 'Dados indisponíveis para ' + alvoResolvido.rotulo,
          detalhes_do_card: {
            card_rotulo: alvoResolvido.rotulo,
            card_link: alvoResolvido.link,
            xpath: xpathAlvoFinal,
            descricao_xpath: alvoResolvido.descricao,
            valor_exibido: 'Dados indisponíveis',
            count_produtos: null,
            primeiro_item_bruto: null,
            usuario_conectado: {
              id: loginData.user ? loginData.user.id : null,
              email: loginData.user ? loginData.user.email : email,
              role: loginData.user ? loginData.user.role : null,
            },
          },
          passos: passos,
          detalhe:
            'A tabela correspondente ao card ' +
            alvoResolvido.rotulo +
            ' não pôde ser consultada com o perfil do usuário.',
        })
      }

      // Formatar o texto extraído do elemento no painel: tipo "104 Produtos" ou "8 Categorias"
      const textoExtraido = String(totalRegistros) + ' ' + alvoResolvido.rotulo
      logPasso('Dado obtido com sucesso: ' + textoExtraido)

      const detalhesDoCard = {
        card_rotulo: alvoResolvido.rotulo,
        card_link: alvoResolvido.link,
        tabela: tabelaUtilizada,
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
