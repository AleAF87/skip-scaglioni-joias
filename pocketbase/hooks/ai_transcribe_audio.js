// Hook to transcribe audio sent from client using Skip AI Gateway / OpenAI-compatible STT endpoint
routerAdd(
  'POST',
  '/backend/v1/ai/transcribe-audio',
  (e) => {
    // 1. Resolve AI Gateway credentials:
    // Primary: SKIP_AI_GATEWAY_API_KEY and SKIP_AI_GATEWAY_URL from environment
    // Fallback: OPENAI_API_KEY / WHISPER_API_KEY / STT_API_KEY and OPENAI_API_BASE
    // 1. Resolve transcription provider credentials:
    // User / Custom keys: OPENAI_API_KEY, GROQ_API_KEY, WHISPER_API_KEY, STT_API_KEY
    // Or Skip AI Gateway URL / Key if configured
    const userOpenAiKey =
      $os.getenv('OPENAI_API_KEY') || $os.getenv('WHISPER_API_KEY') || $os.getenv('STT_API_KEY')
    const groqKey = $os.getenv('GROQ_API_KEY')
    const skipGatewayKey = $os.getenv('SKIP_AI_GATEWAY_API_KEY')
    const customGatewayUrl = $os.getenv('OPENAI_API_BASE') || $os.getenv('STT_API_URL')

    // Determine target endpoint and key
    let endpoint = ''
    let activeKey = ''
    let modelName = 'whisper-1'

    if (userOpenAiKey) {
      activeKey = userOpenAiKey
      const base = (customGatewayUrl || 'https://api.openai.com/v1').trim().replace(/\/+$/, '')
      endpoint = `${base}/audio/transcriptions`
      modelName = 'whisper-1'
    } else if (groqKey) {
      activeKey = groqKey
      endpoint = 'https://api.groq.com/openai/v1/audio/transcriptions'
      modelName = 'whisper-large-v3'
    } else if (customGatewayUrl && skipGatewayKey) {
      // Custom endpoint explicitly configured with gateway key
      activeKey = skipGatewayKey
      const base = customGatewayUrl.trim().replace(/\/+$/, '')
      endpoint = `${base}/audio/transcriptions`
      modelName = 'whisper-1'
    } else {
      // Skip AI Gateway currently proxies chat/completions ($ai.chat) and embeddings ($ai.embed),
      // but does NOT host /audio/transcriptions (returned 404).
      // Return clear, user-friendly 503 so frontend activates the Web Speech API and guides the user.
      return e.json(503, {
        error:
          'O endpoint de transcrição de áudio por IA requer uma chave de Speech-to-Text (como OPENAI_API_KEY ou GROQ_API_KEY) configurada nas variáveis do servidor, pois a Skip AI Gateway nativa foca em chat e embeddings. Enquanto isso, o reconhecimento de voz nativo do navegador pode ser utilizado diretamente.',
        configured: false,
        useBrowserStt: true,
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

    // Determine safe extension and filename for Whisper endpoint
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
      const formData = new FormData()
      formData.append('model', modelName)
      formData.append('language', 'pt')
      formData.append('response_format', 'json')
      formData.append(
        'prompt',
        'Transcrição de descrição de joias, semijoias e peças para joalheria Scaglioni Joias. Valores em reais, quantidades, tipos, tamanhos e materiais.',
      )
      formData.append('file', audioFile, fileName)

      const response = $http.send({
        url: endpoint,
        method: 'POST',
        headers: {
          Authorization: `Bearer ${activeKey}`,
        },
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
        // Return 502/503 for upstream errors so frontend knows it's a gateway issue, not a 400 user error
        return e.json(502, {
          error: `Falha no provedor de transcrição (${response.statusCode}): ${errorDetail}`,
          configured: true,
        })
      }

      const text = (response.json && response.json.text ? response.json.text : '').trim()

      return e.json(200, {
        text,
        configured: true,
      })
    } catch (err) {
      console.log('Exceção ao chamar serviço de transcrição:', err.message)
      return e.json(502, {
        error: `Falha ao processar áudio no provedor: ${err.message}`,
        configured: true,
      })
    }
  },
  $apis.requireAuth(),
)
