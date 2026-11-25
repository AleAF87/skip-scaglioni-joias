/**
 * Captura o quadro atual de um elemento <video> e devolve um JPEG comprimido.
 * Redimensiona para largura máxima (padrão 1600px) para não estourar o limite
 * de upload com fotos de celular.
 */
export function captureVideoFrameAsJpeg(
  video: HTMLVideoElement,
  maxWidth = 1600,
  quality = 0.8,
): Promise<Blob> {
  const srcW = video.videoWidth
  const srcH = video.videoHeight
  if (!srcW || !srcH) {
    return Promise.reject(new Error('Sem quadro de vídeo disponível'))
  }

  const scale = Math.min(1, maxWidth / srcW)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(srcW * scale)
  canvas.height = Math.round(srcH * scale)

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    return Promise.reject(new Error('Canvas indisponível'))
  }
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Falha ao gerar a imagem'))),
      'image/jpeg',
      quality,
    )
  })
}

/** Mensagem clara em português para erros de câmera (permissão, ausência, uso por outro app). */
export function describeCameraError(err: unknown): string {
  const name = (err as { name?: string })?.name
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'Permissão para a câmera negada. Verifique as permissões do navegador e tente novamente.'
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return 'Nenhuma câmera disponível neste dispositivo.'
  }
  if (name === 'NotReadableError') {
    return 'A câmera está em uso por outro aplicativo. Feche-o e tente novamente.'
  }
  return 'Não foi possível acessar a câmera. Verifique as permissões do navegador.'
}
