/**
 * Compressão de assinatura desenhada (canvas → data URL) antes de enviar ao
 * backend. Rede de segurança contra limites residuais de tamanho no campo
 * signature_data (text) de reseller_deliveries: data URLs base64 de canvas
 * podem passar de 5000 caracteres; aqui a imagem é reescalada para largura
 * máxima de 400px e codificada como JPEG de qualidade baixa, mantendo fundo
 * branco (a assinatura é traço escuro sobre fundo claro).
 *
 * Se a entrada já estiver abaixo do limite ou não puder ser decodificada,
 * devolve a string original sem alteração (nunca quebra o fluxo de assinatura).
 */
const MAX_SIGNATURE_URL_LENGTH = 4500
const MAX_SIGNATURE_WIDTH = 400
const JPEG_QUALITY_STEPS = [0.7, 0.5, 0.35, 0.2]

export async function compressSignatureDataUrl(dataUrl: string): Promise<string> {
  if (!dataUrl || dataUrl.length <= MAX_SIGNATURE_URL_LENGTH) return dataUrl

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image()
      image.onload = () => resolve(image)
      image.onerror = () => reject(new Error('decode failed'))
      image.src = dataUrl
    })

    const scale = Math.min(1, MAX_SIGNATURE_WIDTH / img.width)
    const targetW = Math.max(1, Math.round(img.width * scale))
    const targetH = Math.max(1, Math.round(img.height * scale))

    const canvas = document.createElement('canvas')
    canvas.width = targetW
    canvas.height = targetH
    const ctx = canvas.getContext('2d')
    if (!ctx) return dataUrl

    // Fundo branco: JPEG não tem canal alfa e o traço da assinatura é escuro.
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, targetW, targetH)
    ctx.drawImage(img, 0, 0, targetW, targetH)

    for (const quality of JPEG_QUALITY_STEPS) {
      const out = canvas.toDataURL('image/jpeg', quality)
      if (out.length <= MAX_SIGNATURE_URL_LENGTH) return out
    }
    // Qualidade mínima ainda acima do teto: devolve a menor alcançada.
    return canvas.toDataURL('image/jpeg', JPEG_QUALITY_STEPS[JPEG_QUALITY_STEPS.length - 1])
  } catch {
    return dataUrl
  }
}
