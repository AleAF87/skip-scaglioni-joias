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
// Nome livre: inicial de cada palavra, com trim (exclui espaços após a última).
// Numerador: por combinação repetida tipo+metal+iniciais, começa em 01 e
// incrementa (01, 02...).

// Normaliza texto: remove acentos, maiúsculas, colapsa espaços
var skuRuleNormalize = function (value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim()
}

// 2 letras do TIPO: mapa fixo; demais tipos = 2 primeiras letras
var skuRuleTipoLetters = function (tipo) {
  var t = skuRuleNormalize(tipo)
  if (!t) return ''
  var map = { BRINCO: 'BR', COLAR: 'CO', PULSEIRA: 'PU', ANEL: 'AN' }
  if (map[t]) return map[t]
  // Trata variações compostas tipo "BRINCO ARGOLA": usa a primeira palavra
  var firstWord = t.split(' ')[0]
  if (map[firstWord]) return map[firstWord]
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
    var w = words[i]
    if (w === 'PRATA' || w === 'OURO' || w === 'RODIO') {
      var base = { PRATA: 'PR', OURO: 'OU', RODIO: 'RO' }
      return base[w]
    }
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

// Gera a SKU completa para um record de produto, procurando o próximo
// numerador de 2 dígitos livre para a combinação. Retorna a SKU ou ''.
var skuRuleGenerate = function (app, record, tipoHint, metalHint, nomeLivreHint) {
  if (!record) return ''

  // Dicas explícitas do chamador (modal manual / importador) têm prioridade
  var tipo = tipoHint || ''
  var metal = metalHint || ''
  var nomeLivre = nomeLivreHint || ''

  // Sem dicas: deriva do próprio record (campos diretos, quando existirem)
  if (!tipo) tipo = record.getString('tipo') || record.getString('tipo_produto') || ''
  if (!metal) metal = record.getString('metal') || record.getString('material') || ''
  if (!nomeLivre) {
    nomeLivre =
      record.getString('nome_livre') ||
      record.getString('nome_produto') ||
      record.getString('description') ||
      ''
  }

  var prefix = skuRuleBuildPrefix(tipo, metal, nomeLivre)
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

// Compat: nome usado pelos hooks que consomem este arquivo via /// import
var $app_skuRule = {
  normalize: skuRuleNormalize,
  tipoLetters: skuRuleTipoLetters,
  metalLetters: skuRuleMetalLetters,
  nomeLivreLetters: skuRuleNomeLivreLetters,
  buildPrefix: skuRuleBuildPrefix,
  generate: skuRuleGenerate,
  generateForRecord: function (record, tipoHint, metalHint, nomeLivreHint, app) {
    return skuRuleGenerate(app || $app, record, tipoHint, metalHint, nomeLivreHint)
  },
}
