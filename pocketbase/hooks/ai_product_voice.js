// Hook to interpret voice description of jewelry products using Skip AI Gateway
routerAdd(
  'POST',
  '/backend/v1/ai/interpret-product',
  (e) => {
    const requestInfo = e.requestInfo()
    const body = requestInfo.body || {}
    const description = (body.text || '').trim()

    if (!description) {
      return e.json(400, { error: 'A transcrição da fala é obrigatória.' })
    }

    // Normalização inicial de valores com pausas na transcrição recebida (ex: 78,902 -> 78,92)
    const normalizedDescription = description.replace(
      /\b(\d+)([,.])(\d)0(\d)\b/g,
      (_match, intPart, sep, d1, d2) => `${intPart}${sep}${d1}${d2}`,
    )

    // Load available types, materials, sizes from DB to supply in context
    const types = $app
      .findRecordsByFilter('product_types', '', 'name', 100, 0)
      .map((r) => ({ id: r.id, name: r.getString('name') }))
    const materials = $app
      .findRecordsByFilter('product_materials', '', 'name', 100, 0)
      .map((r) => ({ id: r.id, name: r.getString('name') }))
    const sizes = $app
      .findRecordsByFilter('product_sizes', '', 'name', 100, 0)
      .map((r) => ({ id: r.id, name: r.getString('name') }))

    const typeNames = types.map((t) => t.name).join(', ')
    const materialNames = materials.map((m) => m.name).join(', ')
    const sizeNames = sizes.map((s) => s.name).join(', ')

    const systemPrompt = `Você é um assistente especialista em joalheria para a joalheria "Scaglioni Joias".
Sua tarefa é analisar uma descrição falada de um produto e extrair EXATAMENTE as informações fornecidas, retornando um JSON estrito.

REGRAS CRÍTICAS INVIOLÁVEIS:
1. NUNCA invente preço de venda, valor investido, quantidade ou qualquer outro campo que não tenha sido explicitamente falado ou claramente deduzido da fala. Se não foi falado, deixe como null ou string vazia ("").
2. REGRA DE VALORES MONETÁRIOS E CENTAVOS (MUITO IMPORTANTE):
   - NUNCA retorne mais de 2 casas decimais. Valores monetários devem ter no máximo 2 casas decimais.
   - Quando o usuário falar um valor pausado e a transcrição tiver algo como "78,902" ou "78.902", entenda como 78.92 (o zero entre os centavos é um artefato de fala pausada). Ex: "78,902" -> 78.92.
   - Se o usuário falou por exemplo "investi 20", valor investido é 20.00. Se falou "vendo por 60", preço de venda é 60.00.
3. Se o usuário falou "uma unidade", quantidade é 1. Se falou "cinco", quantidade é 5. Se não mencionou quantidade, retorne null.
4. Tipo de produto (type_name): liste exatamente a opção correspondente dentre: [${typeNames}] se identificável, senão null.
5. Material (material_name):
   - As opções cadastradas são: [${materialNames}].
   - Tente interpretar correspondências mesmo que parciais (ex: se o usuário disser "ouro branco" e a única opção correspondente for "Ouro Branco 18k", use "Ouro Branco 18k"). Se houver dúvida ou mais de uma correspondência possível, retorne o texto falado (ex: "ouro branco") para revisão.
6. Tamanho (size_name): dentre [${sizeNames}] se identificável, senão null.
7. Perfil (target_audience): apenas "feminino", "masculino" ou "unissex" se mencionado ou inferido com alta confiança (ex: "brinco feminino" -> "feminino", "pulseira masculina" -> "masculino"), senão null.
8. REGRA ABSOLUTA DO CAMPO "description" (NUNCA POLUIR COM MATERIAL, TIPO, PERFIL OU TAMANHO):
   - O campo "description" deve conter APENAS E EXCLUSIVAMENTE a descrição estética/detalhes da peça (ex: pedras, detalhes, formato, textura).
   - O MATERIAL (ex: "ouro branco", "ouro 18k", "prata 925", "folheado a ouro", "aço cirúrgico") NUNCA DEVE APARECER na "description", pois já tem o campo próprio "material_name".
   - O TIPO (ex: "brinco", "anel", "colar", "pulseira", "pingente", "gargantilha") NUNCA DEVE APARECER na "description".
   - O PERFIL/SEXO (ex: "feminino", "masculino", "unissex") NUNCA DEVE APARECER na "description".
   - O TAMANHO (ex: "tamanho 20", "tamanho único", "aro 16", "45cm") NUNCA DEVE APARECER na "description".
   - EXEMPLO REAL OBRIGATÓRIO:
     Se o usuário disser: "brinco ouro branco feminino tamanho 20 paguei 51 e 95 vou vender por 138 e 42 comprei 22 unidades ele é de pedras prateadas"
     -> type_name: "Brinco"
     -> material_name: "Ouro Branco 18k"
     -> target_audience: "feminino"
     -> size_name: "20" (ou correspondente)
     -> description: "pedras prateadas" (NUNCA "Ouro branco com pedras prateadas" nem "Brinco de pedras prateadas")
   - Se o usuário disser apenas características do material e tipo sem nenhuma descrição estética adicional (ex: "anel ouro 18k tamanho 16"), a "description" pode ser string vazia ("") ou apenas detalhes se houver (ex: "solitário").
9. Retorne SEMPRE E APENAS um objeto JSON válido, sem texto antes ou depois, sem markdown, sem blocos \`\`\`json.

Formato JSON esperado:
{
  "description": "Apenas detalhes estéticos da peça SEM material, tipo, tamanho ou perfil (ex: pedras prateadas)",
  "type_name": "Nome do tipo ou null",
  "material_name": "Nome do material ou null",
  "size_name": "Nome do tamanho ou null",
  "target_audience": "feminino" | "masculino" | "unissex" | null,
  "invested_value": number | null,
  "selling_price": number | null,
  "quantity": number | null,
  "observations": "Observações adicionais extraídas da fala ou string vazia",
  "missing_fields": ["lista", "de", "campos", "ausentes", "que", "precisam", "de", "revisao"]
}`

    try {
      const aiResponse = $ai.chat({
        model: 'fast',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: 'Descrição falada: ' + normalizedDescription },
        ],
      })

      const rawContent =
        aiResponse.choices && aiResponse.choices[0] && aiResponse.choices[0].message
          ? aiResponse.choices[0].message.content
          : '{}'

      // Clean any markdown formatting if present
      const cleaned = rawContent
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/```$/i, '')
        .trim()
      let parsed = {}
      try {
        parsed = JSON.parse(cleaned)
      } catch (parseErr) {
        console.log('Erro ao parsear JSON da IA:', parseErr.message, 'Conteúdo:', rawContent)
        return e.json(200, {
          raw_text: description,
          description: description,
          warning:
            'Não foi possível estruturar todos os dados automaticamente. Por favor, revise manualmente.',
          missing_fields: ['selling_price', 'quantity'],
        })
      }

      // Função auxiliar inteligente para correspondência de cadastros auxiliares:
      // - Match exato (case-insensitive): match único imediato
      // - Match por prefixo/inclusão (ex: "ouro branco" em "Ouro Branco 18k"):
      //   - Se houver EXATAMENTE 1 candidato: seleciona-o automaticamente
      //   - Se houver MAIS de 1 candidato: retorna null (não escolhe sozinho) e flag ambiguo = true
      function matchAuxiliary(query, list) {
        if (!query || typeof query !== 'string') {
          return { id: null, name: '', ambiguous: false, candidates: [] }
        }
        const q = query.trim().toLowerCase()
        if (!q) return { id: null, name: '', ambiguous: false, candidates: [] }

        // 1. Match exato
        const exact = list.find((item) => item.name.toLowerCase() === q)
        if (exact) {
          return { id: exact.id, name: exact.name, ambiguous: false, candidates: [exact] }
        }

        // 2. Busca por prefixo ou se o nome do cadastro começa com ou contém a query
        const candidates = list.filter((item) => {
          const itemLower = item.name.toLowerCase()
          return itemLower.includes(q) || q.includes(itemLower)
        })

        if (candidates.length === 1) {
          return {
            id: candidates[0].id,
            name: candidates[0].name,
            ambiguous: false,
            candidates,
          }
        }

        if (candidates.length > 1) {
          // Múltiplos candidatos: NÃO escolhe sozinho, deixa para revisão manual
          return {
            id: null,
            name: query, // preserva o que a IA/usuário falou
            ambiguous: true,
            candidates,
          }
        }

        return { id: null, name: query, ambiguous: false, candidates: [] }
      }

      // Match type, material, size IDs
      const typeResult = matchAuxiliary(parsed.type_name, types)
      const materialResult = matchAuxiliary(parsed.material_name, materials)
      const sizeResult = matchAuxiliary(parsed.size_name, sizes)

      const matchedTypeId = typeResult.id
      const resolvedTypeName = typeResult.name || parsed.type_name || ''

      const matchedMaterialId = materialResult.id
      const resolvedMaterialName = materialResult.name || parsed.material_name || ''

      const matchedSizeId = sizeResult.id
      const resolvedSizeName = sizeResult.name || parsed.size_name || ''

      // Sanitização de segurança no backend do campo description:
      // Remove menções ao material, tipo, perfil e tamanho que tenham vazado para a descrição
      function cleanBackendDescription(desc, matName, tName, sName, aud) {
        if (!desc || typeof desc !== 'string') return ''
        let clean = desc

        // Lista de termos do material para remover
        const matTerms = []
        if (matName) {
          matTerms.push(matName)
          // Se tiver "18k", adiciona sem "18k" (ex: "Ouro Branco")
          matTerms.push(matName.replace(/\s*18k\b/gi, '').trim())
        }
        if (parsed.material_name && parsed.material_name !== matName) {
          matTerms.push(parsed.material_name)
        }
        // Materiais comuns genéricos
        matTerms.push(
          'ouro branco',
          'ouro amarelo',
          'ouro rose',
          'ouro rosê',
          'ouro 18k',
          'ouro',
          'prata 925',
          'prata',
          'folheado a ouro',
          'folheado',
          'aço cirúrgico',
          'aço',
        )

        for (const term of matTerms) {
          if (!term || term.length < 3) continue
          const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          // "ouro branco com ...", "ouro branco de ...", "em ouro branco", "de ouro branco", etc.
          clean = clean.replace(
            new RegExp(
              `^(?:peça\\s+)?(?:em\\s+|de\\s+)?${escaped}(?:\\s+(?:com|de|em|e|para)\\s+|[,;:\\-—\\s]+)*`,
              'gi',
            ),
            '',
          )
          clean = clean.replace(
            new RegExp(`(?:\\s*(?:,|\\be\\b|com|em|de)\\s+)?\\b${escaped}\\b`, 'gi'),
            '',
          )
        }

        // Remover tipo (ex: "brinco", "anel", etc.)
        const typeTerms = []
        if (tName) typeTerms.push(tName)
        if (parsed.type_name && parsed.type_name !== tName) typeTerms.push(parsed.type_name)
        typeTerms.push(
          'brinco',
          'anel',
          'colar',
          'pulseira',
          'pingente',
          'gargantilha',
          'choker',
          'joia',
          'peça',
        )
        for (const term of typeTerms) {
          if (!term || term.length < 3) continue
          const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          clean = clean.replace(
            new RegExp(`^${escaped}(?:\\s+(?:com|de|em|e)\\s+|[,;:\\-—\\s]+)*`, 'gi'),
            '',
          )
          clean = clean.replace(
            new RegExp(`(?:\\s*(?:,|\\be\\b|com|em|de)\\s+)?\\b${escaped}\\b`, 'gi'),
            '',
          )
        }

        // Remover perfil (feminino, masculino, unissex)
        clean = clean.replace(/\b(feminino|masculino|unissex)\b/gi, '')

        // Remover tamanho (tamanho 20, tamanho único, etc.)
        if (sName) {
          const escSize = sName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          clean = clean.replace(new RegExp(`\\b(?:tamanho\\s+)?${escSize}\\b`, 'gi'), '')
        }
        clean = clean.replace(/\btamanho\s+(único|unico|\d+)\b/gi, '')

        // Limpeza de conectivos e pontuação sobrando no início ou fim
        clean = clean
          .replace(/,\s*,/g, ',')
          .replace(/,\s*\./g, '.')
          .replace(/\s+/g, ' ')
          .replace(/^\s*(?:com|de|em|e|para|—|-|,|\.)\s+/i, '')
          .replace(/\s*[,.\-—]\s*$/, '')
          .trim()

        return clean
      }

      const backendSanitizedDesc = cleanBackendDescription(
        parsed.description || '',
        resolvedMaterialName,
        resolvedTypeName,
        resolvedSizeName,
        parsed.target_audience,
      )

      // Função de normalização numérica centralizada no servidor para valores monetários
      function normalizeServerCurrency(val) {
        if (val === null || val === undefined) return null
        if (typeof val === 'string') {
          val = val.replace(/\s/g, '').replace(',', '.')
        }
        const str = val.toString()
        // Trata regra "78,902" ou "78.902" -> "78.92"
        const pausedMatch = str.match(/^(\d+)\.(\d)0(\d)$/)
        if (pausedMatch) {
          const fixed = parseFloat(`${pausedMatch[1]}.${pausedMatch[2]}${pausedMatch[3]}`)
          return Math.round(fixed * 100) / 100
        }
        const parsedNum = parseFloat(str)
        if (isNaN(parsedNum)) return null
        return Math.round(parsedNum * 100) / 100
      }

      const normalizedInvested = normalizeServerCurrency(parsed.invested_value)
      const normalizedSelling = normalizeServerCurrency(parsed.selling_price)

      // Detect missing fields list (campos sem valor ou com correspondência ambígua)
      const missing = []
      if (!normalizedSelling) missing.push('selling_price')
      if (!parsed.quantity) missing.push('quantity')
      if (!matchedTypeId) missing.push('type')
      if (!matchedMaterialId) missing.push('material')
      if (!matchedSizeId) missing.push('size')
      if (!parsed.target_audience) missing.push('target_audience')

      return e.json(200, {
        raw_text: description,
        description: backendSanitizedDesc || parsed.description || description,
        type_id: matchedTypeId,
        type_name: resolvedTypeName,
        material_id: matchedMaterialId,
        material_name: resolvedMaterialName,
        size_id: matchedSizeId,
        size_name: resolvedSizeName,
        target_audience: parsed.target_audience || '',
        invested_value: normalizedInvested,
        selling_price: normalizedSelling,
        quantity: typeof parsed.quantity === 'number' ? parsed.quantity : null,
        observations: parsed.observations || '',
        missing_fields: missing,
      })
    } catch (err) {
      console.log('Erro no Skip AI Gateway:', err.message)
      return e.json(500, {
        error: 'Falha ao processar com IA: ' + err.message,
        raw_text: description,
      })
    }
  },
  $apis.requireAuth(),
)
