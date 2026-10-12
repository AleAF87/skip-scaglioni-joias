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
2. Se o usuário falou por exemplo "investi 20", valor investido é 20.00. Se falou "vendo por 60", preço de venda é 60.00.
3. Se o usuário falou "uma unidade", quantidade é 1. Se falou "cinco", quantidade é 5. Se não mencionou quantidade, retorne null.
4. Tipo de produto (type_name): deve casar com uma das opções cadastradas: [${typeNames}] se identificável, senão null.
5. Material (material_name): deve casar com uma das opções cadastradas: [${materialNames}] se identificável, senão null.
6. Tamanho (size_name): deve casar com uma das opções cadastradas: [${sizeNames}] se identificável, senão null.
7. Perfil (target_audience): apenas "feminino", "masculino" ou "unissex" se mencionado ou inferido com alta confiança (ex: "brinco feminino" -> "feminino", "pulseira masculina" -> "masculino"), senão null.
8. REGRA CRUCIAL DO CAMPO "description": O campo "description" deve conter SOMENTE a descrição real/estética da peça (ex: "Brinco folheado a ouro com cristais" ou "Anel solitário com zircônia redonda").
   NUNCA inclua o tipo ("brinco", "anel"), o tamanho ("tamanho único", "18cm", "aro 16") nem o perfil ("feminino", "masculino", "unissex") repetidos dentro de "description", pois já existem campos próprios para cada um deles. Se o usuário disser "brinco folheado a ouro, feminino, tamanho único", a "description" deve ser apenas "Folheado a ouro" ou "Brinco folheado a ouro" (sem as palavras ", feminino, tamanho único").
9. Retorne SEMPRE E APENAS um objeto JSON válido, sem texto antes ou depois, sem markdown, sem blocos \`\`\`json.

Formato JSON esperado:
{
  "description": "Texto limpo da peça SEM tipo, tamanho ou perfil (ex: Brinco folheado a ouro com pedras de rubi)",
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
          { role: 'user', content: 'Descrição falada: ' + description },
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

      // Match type, material, size IDs
      let matchedTypeId = null
      if (parsed.type_name) {
        const match = types.find((t) => t.name.toLowerCase() === parsed.type_name.toLowerCase())
        if (match) matchedTypeId = match.id
      }

      let matchedMaterialId = null
      if (parsed.material_name) {
        const match = materials.find(
          (m) => m.name.toLowerCase() === parsed.material_name.toLowerCase(),
        )
        if (match) matchedMaterialId = match.id
      }

      let matchedSizeId = null
      if (parsed.size_name) {
        const match = sizes.find((s) => s.name.toLowerCase() === parsed.size_name.toLowerCase())
        if (match) matchedSizeId = match.id
      }

      // Detect missing fields list
      const missing = []
      if (!parsed.selling_price) missing.push('selling_price')
      if (!parsed.quantity) missing.push('quantity')
      if (!matchedTypeId) missing.push('type')
      if (!matchedMaterialId) missing.push('material')
      if (!matchedSizeId) missing.push('size')
      if (!parsed.target_audience) missing.push('target_audience')

      return e.json(200, {
        raw_text: description,
        description: parsed.description || description,
        type_id: matchedTypeId,
        type_name: parsed.type_name || '',
        material_id: matchedMaterialId,
        material_name: parsed.material_name || '',
        size_id: matchedSizeId,
        size_name: parsed.size_name || '',
        target_audience: parsed.target_audience || '',
        invested_value: typeof parsed.invested_value === 'number' ? parsed.invested_value : null,
        selling_price: typeof parsed.selling_price === 'number' ? parsed.selling_price : null,
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
