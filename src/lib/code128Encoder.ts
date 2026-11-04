// Gerador padrão Code 128 (Subset B)
// Retorna um padrão de barras (bits '1' e '0') para renderização precisa em SVG ou Canvas

// Tabela oficial de padrões do Code 128 (107 símbolos: 0 a 106)
// Cada símbolo tem 11 módulos (exceto o stop com 13 módulos)
const CODE128_PATTERNS = [
  '212222',
  '222122',
  '222221',
  '121223',
  '121322',
  '131222',
  '122213',
  '122312',
  '132212',
  '221213',
  '221312',
  '231212',
  '112232',
  '122132',
  '122231',
  '113222',
  '123122',
  '123221',
  '223211',
  '221132',
  '221231',
  '213212',
  '223112',
  '312131',
  '311222',
  '321122',
  '321221',
  '312212',
  '322112',
  '322211',
  '212123',
  '212321',
  '232121',
  '111323',
  '131123',
  '131321',
  '112313',
  '132113',
  '132311',
  '211313',
  '231113',
  '231311',
  '112133',
  '112331',
  '132131',
  '113123',
  '113321',
  '133121',
  '313121',
  '211331',
  '231131',
  '213113',
  '213311',
  '213131',
  '311123',
  '311321',
  '331121',
  '312113',
  '312311',
  '332111',
  '314111',
  '221411',
  '431111',
  '111224',
  '111422',
  '121124',
  '121421',
  '141122',
  '141221',
  '112214',
  '112412',
  '122114',
  '122411',
  '142112',
  '142211',
  '241211',
  '221114',
  '413111',
  '241112',
  '134111',
  '111242',
  '121142',
  '121241',
  '114212',
  '124112',
  '124211',
  '411212',
  '421112',
  '421211',
  '212141',
  '214121',
  '412121',
  '111143',
  '111341',
  '131141',
  '114113',
  '114311',
  '411113',
  '411311',
  '113141',
  '114131',
  '311141',
  '411131',
  '211412',
  '211214',
  '211232',
  '2331112', // 106 Stop (13 módulos)
]

const START_B = 104
const STOP = 106

export function encodeCode128B(text: string): { modules: boolean[]; text: string } {
  const safeText = (text || '0').trim()
  const charCodes: number[] = []

  // Converte caracteres ASCII válidos para Code 128 Subset B (ASCII 32..126)
  for (let i = 0; i < safeText.length; i++) {
    const code = safeText.charCodeAt(i)
    if (code >= 32 && code <= 126) {
      charCodes.push(code - 32)
    } else {
      // Fallback para caractere não-ASCII
      charCodes.push(0) // espaço
    }
  }

  // Checksum do Code 128:
  // Checksum = (StartB + Sum(char_i * (i + 1))) % 103
  let checksum = START_B
  for (let i = 0; i < charCodes.length; i++) {
    checksum += charCodes[i] * (i + 1)
  }
  checksum = checksum % 103

  const sequence = [START_B, ...charCodes, checksum, STOP]
  const modules: boolean[] = []

  for (const sym of sequence) {
    const pattern = CODE128_PATTERNS[sym]
    if (!pattern) continue
    let isBar = true
    for (let p = 0; p < pattern.length; p++) {
      const width = parseInt(pattern[p], 10)
      for (let m = 0; m < width; m++) {
        modules.push(isBar)
      }
      isBar = !isBar
    }
  }

  return { modules, text: safeText }
}
