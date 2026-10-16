/**
 * Converte um valor numérico para sua representação monetária por extenso
 * em língua portuguesa (Brasil), conforme as normas gramaticais.
 * Exemplo: 138.42 -> "cento e trinta e oito reais e quarenta e dois centavos"
 */

const UNIDADES = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove']

const ESPECIAIS_DEZ = [
  'dez',
  'onze',
  'doze',
  'treze',
  'quatorze',
  'quinze',
  'dezesseis',
  'dezessete',
  'dezoito',
  'dezenove',
]

const DEZENAS = [
  '',
  '',
  'vinte',
  'trinta',
  'quarenta',
  'cinquenta',
  'sessenta',
  'setenta',
  'oitenta',
  'noventa',
]

const CENTENAS = [
  '',
  'cento',
  'duzentos',
  'trezentos',
  'quatrocentos',
  'quinhentos',
  'seiscentos',
  'setecentos',
  'oitocentos',
  'novecentos',
]

function converterGrupoAte999(n: number): string {
  if (n === 0) return ''
  if (n === 100) return 'cem'

  const c = Math.floor(n / 100)
  const d = Math.floor((n % 100) / 10)
  const u = n % 10

  const partes: string[] = []

  if (c > 0) {
    partes.push(CENTENAS[c])
  }

  const dezenaUnidade = n % 100
  if (dezenaUnidade >= 10 && dezenaUnidade <= 19) {
    partes.push(ESPECIAIS_DEZ[dezenaUnidade - 10])
  } else {
    if (d >= 2) {
      partes.push(DEZENAS[d])
    }
    if (u > 0) {
      partes.push(UNIDADES[u])
    }
  }

  return partes.join(' e ')
}

export function valorPorExtenso(valor: number): string {
  if (isNaN(valor) || valor < 0) return 'zero reais'

  // Arredondar para duas casas decimais
  const valorFixado = Math.round(valor * 100) / 100
  const inteira = Math.floor(valorFixado)
  const centavos = Math.round((valorFixado - inteira) * 100)

  if (inteira === 0 && centavos === 0) {
    return 'zero reais'
  }

  const partesTexto: string[] = []

  if (inteira > 0) {
    // Escalas: bilhões, milhões, milhares, unidades
    const bilhoes = Math.floor(inteira / 1_000_000_000) % 1000
    const milhoes = Math.floor(inteira / 1_000_000) % 1000
    const milhares = Math.floor(inteira / 1_000) % 1000
    const unidades = inteira % 1000

    const grupos: Array<{ valor: number; singular: string; plural: string }> = [
      { valor: bilhoes, singular: 'bilhão', plural: 'bilhões' },
      { valor: milhoes, singular: 'milhão', plural: 'milhões' },
      { valor: milhares, singular: 'mil', plural: 'mil' },
      { valor: unidades, singular: '', plural: '' },
    ]

    const pedacosReais: string[] = []

    for (const g of grupos) {
      if (g.valor > 0) {
        const textoGrupo = converterGrupoAte999(g.valor)
        if (g.singular) {
          const sufixo = g.valor === 1 ? g.singular : g.plural
          // Se for "mil", apenas "mil" ou "um mil"? Em PT-BR "mil" é comum, mas "um mil" é aceito; usaremos "um mil" se for 1.
          pedacosReais.push(`${textoGrupo} ${sufixo}`.trim())
        } else {
          pedacosReais.push(textoGrupo)
        }
      }
    }

    let textoInteiro = pedacosReais.join(' e ')

    // Adiciona moeda
    if (inteira === 1) {
      textoInteiro += ' real'
    } else {
      // Se termina em milhão ou bilhão sem unidades/milhares, adiciona "de reais"
      if ((milhoes > 0 || bilhoes > 0) && milhares === 0 && unidades === 0) {
        textoInteiro += ' de reais'
      } else {
        textoInteiro += ' reais'
      }
    }

    partesTexto.push(textoInteiro)
  }

  if (centavos > 0) {
    const textoCentavos = converterGrupoAte999(centavos)
    const sufixoCentavos = centavos === 1 ? 'centavo' : 'centavos'
    partesTexto.push(`${textoCentavos} ${sufixoCentavos}`)
  }

  return partesTexto.join(' e ')
}
