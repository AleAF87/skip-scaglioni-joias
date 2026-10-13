// Hook to transcribe audio sent from client using OpenAI Whisper / STT provider
routerAdd(
  'POST',
  '/backend/v1/ai/transcribe-audio',
  (e) => {
    // 1. Check for OpenAI or Whisper API key in environment
    const openaiKey =
      $os.getenv('OPENAI_API_KEY') || $os.getenv('WHISPER_API_KEY') || $os.getenv('STT_API_KEY')

    if (!openaiKey) {
      return e.json(503, {
        error:
          'Chave de API de transcrição (OPENAI_API_KEY) não está configurada no servidor. Por favor configure a variável de ambiente OPENAI_API_KEY para habilitar a transcrição de áudio por IA.',
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

    // Determine safe extension and filename for OpenAI Whisper
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
      // 3. Prepare multipart FormData for OpenAI Whisper API
      const formData = new FormData()
      formData.append('model', 'whisper-1')
      formData.append('language', 'pt')
      formData.append('response_format', 'json')
      formData.append(
        'prompt',
        'Transcrição de descrição de joias, semijoias e peças para joalheria Scaglioni Joias. Valores em reais, quantidades, tipos, tamanhos e materiais.',
      )
      formData.append('file', audioFile, fileName)

      const apiBase = $os.getenv('OPENAI_API_BASE') || 'https://api.openai.com/v1'
      const response = $http.send({
        url: `${apiBase}/audio/transcriptions`,
        method: 'POST',
        headers: {
          Authorization: `Bearer ${openaiKey}`,
        },
        body: formData,
        timeout: 60,
      })

      if (response.statusCode < 200 || response.statusCode >= 300) {
        let errorDetail = 'Falha no serviço de transcrição.'
        if (response.json && response.json.error && response.json.error.message) {
          errorDetail = response.json.error.message
        } else if (response.json && response.json.error) {
          errorDetail = String(response.json.error)
        }
        console.log('Erro retornado pela API Whisper:', response.statusCode, errorDetail)
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
