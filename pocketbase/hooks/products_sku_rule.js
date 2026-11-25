// Helper COMPARTILHADO da NOVA regra de SKU e-commerce (v0.0.215) —
// usado pelo hook de criação de produtos (products_code_sequence.js) e pelos
// importadores Tecson/Scaglioni (products_import.js).
//
// REGRA (dono do sistema, verbatim):
//   TIPO (2 letras) + METAL (2 letras) + inicial de cada palavra do NOME LIVRE
//   (trim de espaços) + numerador de 2 dígitos começando em 01, sem separadores.
//   Ex.: BRINCO + OURO + "Liso com pedras vermelhas"  -> BROULCPV01
//        COLAR  + PRATA 925 + "pingente azul"          -> COPRPA01
//
// Mapeamentos fixos: BRINCO=BR, COLAR=CO, PULSEIRA=PU, ANEL=AN; demais tipos:
// 2 primeiras letras. PRATA=PR, OURO=OU; demais metais: 2 primeiras letras.
// Em variações como "PRATA 925", usa o par do metal base (PR).
// Nome livre: inicial de cada palavra, com trim (exclui espaços após a última),
// SEM as palavras de tipo e de metal do próprio nome.
// Numerador: por combinação repetida tipo+metal+iniciais, começa em 01 e
// incrementa (01, 02...), sempre verificando unicidade antes de gravar.

// Normaliza texto: remove acentos, maiúsculas, colapsa espaços
var skuRuleNormalize = function (value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim()
}

var skuRuleTipoMap = { BRINCO: 'BR', COLAR: 'CO', PULSEIRA: 'PU', ANEL: 'AN' }
var skuRuleMetalMap = { PRATA: 'PR', OURO: 'OU', RODIO: 'RO' }

// 2 letras do TIPO: mapa fixo; demais tipos = 2 primeiras letras
var skuRuleTipoLetters = function (tipo) {
  var t = skuRuleNormalize(tipo)
  if (!t) return ''
  if (skuRuleTipoMap[t]) return skuRuleTipoMap[t]
  // Trata variações compostas tipo "BRINCO ARGOLA": usa a primeira palavra
  var words = t.split(' ')
  for (var i = 0; i < words.length; i++) {
    if (skuRuleTipoMap[words[i]]) return skuRuleTipoMap[words[i]]
  }
  return t.replace(/[^A-Z]/g, '').slice(0, 2)
}

// 2 letras do METAL: PRATA=PR, OURO=OU; demais = 2 primeiras letras.
// Variações como "PRATA 925" usam o par do metal base (PR).
var skuRuleMetalLetters = function (metal) {
  var m = skuRuleNormalize(metal)
  if (!m) return ''
  // Usa o PAR do metal base: pega a primeira palavra reconhecida
  var words = m.split(' ')
  for (var i = 0; i < words.length; i++) {
    if (skuRuleMetalMap[words[i]]) return skuRuleMetalMap[words[i]]
  }
  // Demais metais: 2 primeiras letras da primeira palavra
  var clean = m.replace(/[^A-Z]/g, '')
  return clean.slice(0, 2)
}

// Iniciais do NOME LIVRE: inicial de cada palavra, com trim final
var skuRuleNomeLivreLetters = function (nomeLivre) {
  var n = skuRuleNormalize(nomeLivre)
  if (!n) return ''
  var words = n.split(' ').filter(Boolean)
  var out = ''
  for (var i = 0; i < words.length; i++) {
    var clean = words[i].replace(/[^A-Z]/g, '')
    if (clean) out += clean.charAt(0)
  }
  return out
}

// Monta o PREFIXO (tipo+metal+iniciais do nome livre) — sem o numerador
var skuRuleBuildPrefix = function (tipo, metal, nomeLivre) {
  var t = skuRuleTipoLetters(tipo)
  var m = skuRuleMetalLetters(metal)
  var n = skuRuleNomeLivreLetters(nomeLivre)
  if (!t && !m && !n) return ''
  return t + m + n
}

// Um nome de categoria/keyword indica METAL? (grupos vazios da importação antiga
// trouxeram PRATA etc. sem group — tratamos pelo nome)
var skuRuleIsMetalName = function (nomeNorm) {
  return /PRATA|OURO|RODIO|ACO|INOX|BANHO|DOURAD/.test(skuRuleNormalize(nomeNorm))
}

// Detecta a palavra de TIPO no nome do produto (aceita plural simples: BRINCOS)
var skuRuleDetectTipo = function (nomeNorm) {
  var words = skuRuleNormalize(nomeNorm).split(' ').filter(Boolean)
  for (var i = 0; i < words.length; i++) {
    var w = words[i]
    var singular = w.replace(/S$/, '')
    if (skuRuleTipoMap[w]) return w
    if (skuRuleTipoMap[singular]) return singular
  }
  return ''
}

// Detecta a palavra de METAL no nome do produto (ex.: "Brinco prata 925")
var skuRuleDetectMetal = function (nomeNorm) {
  var words = skuRuleNormalize(nomeNorm).split(' ').filter(Boolean)
  for (var i = 0; i < words.length; i++) {
    if (skuRuleMetalMap[words[i]]) return words[i]
  }
  return ''
}

// Remove a PRIMEIRA ocorrência de cada frase (palavra(s) inteiras) do nome
var skuRuleStripWords = function (nomeNorm, phrases) {
  var out = skuRuleNormalize(nomeNorm)
  for (var i = 0; i < phrases.length; i++) {
    var p = skuRuleNormalize(phrases[i])
    if (!p) continue
    var esc = p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    out = out
      .replace(new RegExp('(^|\\s)' + esc + '(?=\\s|$)'), ' ')
      .replace(/\s+/g, ' ')
      .trim()
  }
  return out
}

// Resolve o ID da relação type/material para a categoria marcada: categorias
// (CAIXA ALTA) são casadas com as relações (Nome Próprio) por chave de letras
// e números, sem acentos; fallback pelo slug ("ouro-18k" -> "OURO 18K").
var skuRuleKeyOf = function (text) {
  return skuRuleNormalize(text).replace(/[^A-Z0-9]/g, '')
}

var skuRuleFindTypeId = function (app, catName, catSlug) {
  var wantedKey = skuRuleKeyOf(catName)
  var wantedSlug = skuRuleKeyOf(String(catSlug || '').replace(/-/g, ' '))
  if (!wantedKey && !wantedSlug) return ''
  try {
    var list = app.findRecordsByFilter('product_types', '', '', 200, 0)
    for (var i = 0; i < list.length; i++) {
      var nmKey = skuRuleKeyOf(list[i].getString('name'))
      if (wantedKey && nmKey === wantedKey) return list[i].id
      if (wantedSlug && nmKey === wantedSlug) return list[i].id
    }
  } catch (_) {}
  return ''
}

var skuRuleFindMaterialId = function (app, catName, catSlug) {
  var wantedKey = skuRuleKeyOf(catName)
  var wantedSlug = skuRuleKeyOf(String(catSlug || '').replace(/-/g, ' '))
  if (!wantedKey && !wantedSlug) return ''
  try {
    var list = app.findRecordsByFilter('product_materials', '', '', 200, 0)
    for (var i = 0; i < list.length; i++) {
      var nmKey = skuRuleKeyOf(list[i].getString('name'))
      if (wantedKey && nmKey === wantedKey) return list[i].id
      if (wantedSlug && nmKey === wantedSlug) return list[i].id
    }
  } catch (_) {}
  return ''
}

// Resolve {tipo, metal, nomeLivre, typeId, materialId} de um produto:
//   1. dicas explícitas do chamador (modal manual / importador)
//   2. categorias vinculadas (product_category_links -> product_categories,
//      group 'metal' / 'tipo' / vazio) — gravando também os IDs das relações
//      type/material (match por nome ou slug)
//   3. relações diretas (material -> product_materials, type -> product_types)
//   4. campo texto tipo_produto_bruto (importação)
//   5. detecção das palavras no próprio nome
// O NOME LIVRE é o nome do produto sem as palavras de tipo e metal.
var skuRuleResolveParts = function (app, record, tipoHint, metalHint, nomeLivreHint) {
  var fullName = skuRuleNormalize(
    record.getString('nome_produto') || record.getString('description') || '',
  )
  var tipo = skuRuleNormalize(tipoHint)
  var metal = skuRuleNormalize(metalHint)
  var tipoWords = []
  var metalWords = []

  if (tipo) tipoWords.push(tipo)
  if (metal) metalWords.push(metal)

  // 2. Categorias vinculadas (produto já existente)
  if (record.id) {
    try {
      var links = app.findRecordsByFilter(
        'product_category_links',
        "product = '" + record.id + "'",
        '',
        50,
        0,
      )
      for (var i = 0; i < links.length; i++) {
        var catId = links[i].getString('category')
        if (!catId) continue
        var cat = null
        try {
          cat = app.findRecordById('product_categories', catId)
        } catch (_) {}
        if (!cat) continue
        var cname = skuRuleNormalize(cat.getString('name'))
        var cgroup = skuRuleNormalize(cat.getString('group'))
        if (!cname) continue
        if (cgroup === 'metal' || (!cgroup && skuRuleIsMetalName(cname))) {
          if (!metal) metal = cname
          metalWords.push(cname)
          // Grava a relação material quando ainda está vazia (match por nome
          // ou slug — o slug cobre nomes acentados das relações de estoque)
          if (!record.getString('material')) {
            var matId = skuRuleFindMaterialId(
              app,
              cat.getString('name'),
              cat.getString('slug') || '',
            )
            if (matId) record.set('material', matId)
          }
        } else {
          if (!tipo) tipo = cname
          tipoWords.push(cname)
          // Grava a relação type quando ainda está vazia
          if (!record.getString('type')) {
            var tId = skuRuleFindTypeId(app, cat.getString('name'), cat.getString('slug') || '')
            if (tId) record.set('type', tId)
          }
        }
      }
    } catch (_) {}
  }

  // 3. Relação material (product_materials)
  if (!metal) {
    var matId = record.getString('material') || ''
    if (matId) {
      try {
        var mat = app.findRecordById('product_materials', matId)
        if (mat) {
          var mname = skuRuleNormalize(mat.getString('name'))
          if (mname) {
            metal = mname
            metalWords.push(mname)
          }
        }
      } catch (_) {}
    }
  }

  // 3b. Relação type (product_types)
  if (!tipo) {
    var typeId = record.getString('type') || ''
    if (typeId) {
      try {
        var tRec = app.findRecordById('product_types', typeId)
        if (tRec) {
          var tname = skuRuleNormalize(tRec.getString('name'))
          if (tname) {
            tipo = tname
            tipoWords.push(tname)
          }
        }
      } catch (_) {}
    }
  }

  // 4. Campo texto tipo_produto_bruto
  if (!tipo) {
    var bruto = skuRuleNormalize(record.getString('tipo_produto_bruto') || '')
    if (bruto) {
      tipo = bruto
      tipoWords.push(bruto)
    }
  }

  // 5. Detecção no próprio nome
  if (!tipo) {
    var detTipo = skuRuleDetectTipo(fullName)
    if (detTipo) {
      tipo = detTipo
      tipoWords.push(detTipo)
    }
  }
  if (!metal) {
    var detMetal = skuRuleDetectMetal(fullName)
    if (detMetal) {
      metal = detMetal
      metalWords.push(detMetal)
    }
  }

  var nomeLivre = skuRuleNormalize(nomeLivreHint)
  if (!nomeLivre) {
    nomeLivre = skuRuleStripWords(fullName, tipoWords.concat(metalWords))
  }

  return {
    tipo: tipo,
    metal: metal,
    nomeLivre: nomeLivre,
    typeId: record.getString('type') || '',
    materialId: record.getString('material') || '',
  }
}

// Verifica se um candidato já está ocupado por OUTRO produto
var skuRuleIsTaken = function (app, candidate, excludeId) {
  try {
    var rec = app.findFirstRecordByFilter(
      'products',
      "sku_ecommerce = '" + candidate.replace(/'/g, "\\'") + "'",
    )
    if (rec && (!excludeId || rec.id !== excludeId)) return true
  } catch (_) {}
  return false
}

// Gera a SKU completa para um record de produto (nova regra), procurando o
// próximo numerador de 2 dígitos livre para a combinação. Retorna a SKU ou ''.
var skuRuleGenerate = function (app, record, tipoHint, metalHint, nomeLivreHint) {
  if (!record) return ''
  var parts = skuRuleResolveParts(app, record, tipoHint, metalHint, nomeLivreHint)
  var prefix = skuRuleBuildPrefix(parts.tipo, parts.metal, parts.nomeLivre)
  if (!prefix) return ''

  var excludeId = record.id || ''
  var n = 1
  while (n < 100) {
    var candidate = prefix + (n < 10 ? '0' + n : String(n))
    if (!skuRuleIsTaken(app, candidate, excludeId)) {
      record.set('sku_ecommerce', candidate)
      return candidate
    }
    n++
  }
  return ''
}

// Compat: nome usado pelos hooks que consomem este arquivo via require()
// IMPORTANTE (JSVM): cada handler roda em contexto isolado — variáveis de
// nível superior NUNCA são visíveis dentro do handler. Por isso este arquivo
// é um módulo CommonJS: os consumidores fazem require() DENTRO do handler.
var $app_skuRule = {
  normalize: skuRuleNormalize,
  tipoLetters: skuRuleTipoLetters,
  metalLetters: skuRuleMetalLetters,
  nomeLivreLetters: skuRuleNomeLivreLetters,
  buildPrefix: skuRuleBuildPrefix,
  isMetalName: skuRuleIsMetalName,
  detectTipo: skuRuleDetectTipo,
  detectMetal: skuRuleDetectMetal,
  stripWords: skuRuleStripWords,
  resolveParts: skuRuleResolveParts,
  generate: skuRuleGenerate,
  generateForRecord: function (record, tipoHint, metalHint, nomeLivreHint, app) {
    return skuRuleGenerate(app || $app, record, tipoHint, metalHint, nomeLivreHint)
  },
}

module.exports = $app_skuRule
