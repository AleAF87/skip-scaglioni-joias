// Funções PURAS da regra de SKU — SEM dependências de $app, $os, require ou global.
// Fonte única de verdade textual: pocketbase/hooks/products_sku_rule.js
// (documentação/comentário — o código NÃO é carregado daqui na JSVM: cada hook
// consumidor declara estas funções dentro do próprio handler, pois handlers
// rodam em contexto isolado — nem globals nem require funcionam, v0.0.257).
// REGRA: TIPO (2 letras) + METAL (2 letras) + inicial de cada palavra do NOME
// LIVRE + numerador de 2 dígitos (01, 02...) com verificação de unicidade.
// Ex.: BRINCO + OURO + "Liso com pedras vermelhas" -> BROULCPV01
module.exports = { docOnly: true }
