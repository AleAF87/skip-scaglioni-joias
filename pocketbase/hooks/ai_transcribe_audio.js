// Hook to transcribe audio sent from client using Skip AI Gateway / OpenAI-compatible STT endpoint
routerAdd(
  'POST',
  '/backend/v1/ai/transcribe-audio',
  (e) => {
    // 1. Resolve AI Gateway credentials:
    // Primary: SKIP_AI_GATEWAY_API_KEY and SKIP_AI_GATEWAY_URL from environment
    // Fallback: OPENAI_API_KEY / WHISPER_API_KEY / STT_API_KEY and OPENAI_API_BASE
    const gatewayKey =
      $os.getenv('SKIP_AI_GATEWAY_API_KEY') ||
      $os.getenv('OPENAI_API_KEY') ||
      $os.getenv('WHISPER_API_KEY') ||
      $os.getenv('STT_API_KEY')

    let gatewayUrl =
      $os.getenv('SKIP_AI_GATEWAY_URL') ||
      $os.getenv('OPENAI_API_BASE') ||
      'https://api.openai.com/v1'

    if (!gatewayKey) {
      return e.json(503, {
        error:
          'Chave da Skip AI Gateway (SKIP_AI_GATEWAY_API_KEY) não está configurada no servidor. Por favor verifique as variáveis de ambiente para habilitar a transcrição de áudio por IA.',
        configured: false,
      })
    }

    // 2. Extract uploaded audio file
    const uploadedFiles = e.findUploadedFiles('audio') || e.findUploadedFiles('file')
    if (!uploadedFiles || uploadedFiles.length === 0) {
      return e.json(400, {
        error: 'Nenhum arquivo de áudio foi enviado na requisição.',
      })
    }

    const audioFile = uploadedFiles[0]
    const originalName = audioFile.name || 'audio.mp4'

    // Determine safe extension and filename for Whisper / STT endpoint
    let fileName = originalName
    const lower = originalName.toLowerCase()
    if (
      !lower.endsWith('.webm') &&
      !lower.endsWith('.mp4') &&
      !lower.endsWith('.m4a') &&
      !lower.endsWith('.mp3') &&
      !lower.endsWith('.wav') &&
      !lower.endsWith('.aac') &&
      !lower.endsWith('.ogg')
    ) {
      fileName = `${originalName}.mp4`
    }

    try {
      // 3. Prepare multipart FormData for OpenAI-compatible Whisper endpoint
      const formData = new FormData()
      formData.append('model', 'whisper-1')
      formData.append('language', 'pt')
      formData.append('response_format', 'json')
      formData.append(
        'prompt',
        'Transcrição de descrição de joias, semijoias e peças para joalheria Scaglioni Joias. Valores em reais, quantidades, tipos, tamanhos e materiais.',
      )
      formData.append('file', audioFile, fileName)

      // Normalize base URL: strip trailing slash
      let baseUrl = gatewayUrl.trim().replace(/\/+$/, '')
      let endpoint = `${baseUrl}/audio/transcriptions`
      // If gatewayUrl already points to an audio/transcriptions endpoint
      if (baseUrl.endsWith('/audio/transcriptions')) {
        endpoint = baseUrl
      }

      const headers = {
        Authorization: `Bearer ${gatewayKey}`,
      }

      // Also include api-key header for gateways that accept Azure / custom style
      // while preserving standard Bearer token
      const response = $http.send({
        url: endpoint,
        method: 'POST',
        headers: headers,
        body: formData,
        timeout: 60,
      })

      if (response.statusCode < 200 || response.statusCode >= 300) {
        let errorDetail = 'Falha no serviço de transcrição.'
        if (response.json && response.json.error && response.json.error.message) {
          errorDetail = response.json.error.message
        } else if (response.json && response.json.error) {
          errorDetail =
            typeof response.json.error === 'string'
              ? response.json.error
              : JSON.stringify(response.json.error)
        } else if (response.raw) {
          errorDetail = response.raw.slice(0, 300)
        }
        console.log('Erro retornado pela API de transcrição:', response.statusCode, errorDetail)
        return e.json(response.statusCode >= 400 && response.statusCode < 500 ? 400 : 502, {
          error: `Erro ao transcrever áudio: ${errorDetail}`,
        })
      }

      const text = (response.json && response.json.text ? response.json.text : '').trim()

      return e.json(200, {
        text,
        configured: true,
      })
    } catch (err) {
      console.log('Exceção ao chamar serviço de transcrição:', err.message)
      return e.json(500, {
        error: `Falha ao processar áudio: ${err.message}`,
      })
    }
  },
  $apis.requireAuth(),
)
