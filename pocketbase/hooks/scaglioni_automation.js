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
        logPasso('Falha na conexão de rede com o site Scaglioni Joias.')
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

      // 2. Buscar dados do primeiro card do painel admin
      // No painel do site (admin.index-C8fqU55z.js):
      // O primeiro card corresponde ao resumo de "Produtos" (rotulo: 'Produtos', valor: count produtos)
      // O elemento correspondente no xpath "/html/body/div/div/div/main/main/div/div/div[1]/a[1]/div/div/p[1]"
      // é o parágrafo do valor: `<p className="text-2xl font-bold">{e.valor ?? "—"}</p>`
      // gerado por: await r.from('produtos').select('*', { count: 'exact', head: true })
      const SUPABASE_REST_PRODUTOS =
        'https://bylhuxvdgplfjsnwlqtq.supabase.co/rest/v1/produtos?select=*'

      logPasso('Consultando dados do primeiro card (Produtos) no painel admin...')

      let restResponse
      try {
        restResponse = $http.send({
          url: SUPABASE_REST_PRODUTOS,
          method: 'HEAD',
          headers: {
            apikey: SUPABASE_APIKEY,
            Authorization: 'Bearer ' + accessToken,
            Prefer: 'count=exact',
          },
          timeout: 20,
        })
      } catch (restErr) {
        logPasso('Erro ao consultar REST do painel admin via HEAD: ' + restErr.message)
      }

      let totalProdutos = null
      if (restResponse && restResponse.statusCode >= 200 && restResponse.statusCode < 300) {
        // Tentar extrair o count do Content-Range (ex: "0-0/42" ou "*/42")
        const contentRange =
          (restResponse.headers &&
            (restResponse.headers['Content-Range'] || restResponse.headers['content-range'])) ||
          ''
        if (contentRange && contentRange.indexOf('/') !== -1) {
          const parts = contentRange.split('/')
          const parsed = parseInt(parts[1], 10)
          if (!isNaN(parsed)) {
            totalProdutos = parsed
          }
        }
      }

      // Se HEAD não trouxe ou se preferir confirmação via GET com limit 1
      if (totalProdutos === null) {
        try {
          const getRes = $http.send({
            url: 'https://bylhuxvdgplfjsnwlqtq.supabase.co/rest/v1/produtos?select=id&limit=1',
            method: 'GET',
            headers: {
              apikey: SUPABASE_APIKEY,
              Authorization: 'Bearer ' + accessToken,
              Prefer: 'count=exact',
            },
            timeout: 20,
          })

          if (getRes.statusCode >= 200 && getRes.statusCode < 300) {
            const contentRange =
              (getRes.headers &&
                (getRes.headers['Content-Range'] || getRes.headers['content-range'])) ||
              ''
            if (contentRange && contentRange.indexOf('/') !== -1) {
              const parts = contentRange.split('/')
              const parsed = parseInt(parts[1], 10)
              if (!isNaN(parsed)) {
                totalProdutos = parsed
              }
            }
          }
        } catch (_) {}
      }

      // Também buscar o primeiro registro de produtos caso queira conferência detalhada
      let primeiroRegistro = null
      try {
        const itemRes = $http.send({
          url: 'https://bylhuxvdgplfjsnwlqtq.supabase.co/rest/v1/produtos?limit=1',
          method: 'GET',
          headers: {
            apikey: SUPABASE_APIKEY,
            Authorization: 'Bearer ' + accessToken,
          },
          timeout: 20,
        })
        if (itemRes.statusCode === 200) {
          const parsedItems = JSON.parse(itemRes.raw || '[]')
          if (Array.isArray(parsedItems) && parsedItems.length > 0) {
            primeiroRegistro = parsedItems[0]
          }
        }
      } catch (_) {}

      if (totalProdutos === null && !primeiroRegistro) {
        logPasso('Não foi possível extrair a contagem ou os registros do primeiro card.')
        return e.json(500, {
          error: 'Não foi possível localizar o dado no painel.',
          passos: passos,
        })
      }

      const textoExtraido = totalProdutos !== null ? String(totalProdutos) : '—'
      logPasso('Dado obtido com sucesso: ' + textoExtraido)

      const detalhesDoCard = {
        card_rotulo: 'Produtos',
        card_link: '/admin/produtos',
        xpath: '/html/body/div/div/div/main/main/div/div/div[1]/a[1]/div/div/p[1]',
        descricao_xpath:
          'Primeiro card do painel admin (Produtos) -> primeiro <p> (quantidade total)',
        valor_exibido: textoExtraido,
        count_produtos: totalProdutos,
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
