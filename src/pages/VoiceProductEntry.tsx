import React, { useState, useEffect, useRef } from 'react'
import { productService } from '@/services/productService'
import { Product, ProductType, ProductMaterial, ProductSize } from '@/types'
import { formatCurrency, getFileUrl } from '@/lib/formatters'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ImageLightbox } from '@/components/ImageLightbox'
import {
  Mic,
  MicOff,
  Sparkles,
  Camera,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Upload,
  X,
  Volume2,
  PackageCheck,
  Loader2,
  HelpCircle,
  ZoomIn,
  ShieldAlert,
  ShieldCheck,
  Radio,
} from 'lucide-react'
import { toast } from 'sonner'
import { APP_VERSION } from '@/version'

export default function VoiceProductEntry() {
  // Voice transcription state
  const [isListening, setIsListening] = useState(false)
  const [transcribedText, setTranscribedText] = useState('')
  const [interimText, setInterimText] = useState('')
  const [speechSupported, setSpeechSupported] = useState(true)
  const [isAiProcessing, setIsAiProcessing] = useState(false)
  const [recordingSeconds, setRecordingSeconds] = useState(0)

  // Microphone permission state: 'granted' | 'prompt' | 'denied' | 'unknown'
  const [micPermissionState, setMicPermissionState] = useState<
    'granted' | 'prompt' | 'denied' | 'unknown'
  >('unknown')
  const [isRequestingPermission, setIsRequestingPermission] = useState(false)

  // Observations specific speech dictation
  const [isDictatingNotes, setIsDictatingNotes] = useState(false)

  // Auxiliaries data
  const [types, setTypes] = useState<ProductType[]>([])
  const [materials, setMaterials] = useState<ProductMaterial[]>([])
  const [sizes, setSizes] = useState<ProductSize[]>([])

  // Form Fields
  const [code, setCode] = useState('')
  const [description, setDescription] = useState('')
  const [selectedType, setSelectedType] = useState('')
  const [selectedMaterial, setSelectedMaterial] = useState('')
  const [selectedSize, setSelectedSize] = useState('')
  const [targetAudience, setTargetAudience] = useState<string>('')
  const [investedValue, setInvestedValue] = useState<string>('')
  const [sellingPrice, setSellingPrice] = useState<string>('')
  const [quantity, setQuantity] = useState<string>('')
  const [minimumQuantity, setMinimumQuantity] = useState<string>('')
  const [observations, setObservations] = useState('')
  const [photos, setPhotos] = useState<File[]>([])
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([])

  // UI status & Form scroll target
  const [missingFields, setMissingFields] = useState<string[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [recentProducts, setRecentProducts] = useState<Product[]>([])
  const formReviewRef = useRef<HTMLDivElement>(null)
  const descriptionInputRef = useRef<HTMLInputElement>(null)

  // Speech Recognition state refs to avoid closure stale state & duplicate loops
  const recognitionRef = useRef<any>(null)
  const isListeningRef = useRef(false)
  const manualStopRequestedRef = useRef(true) // Starts true: stopped until explicit user start
  const finalSegmentsRef = useRef<string[]>([])
  const timerIntervalRef = useRef<any>(null)
  const restartTimeoutRef = useRef<any>(null)
  const notesRecRef = useRef<any>(null)

  // Lightbox
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [lightboxPhotos, setLightboxPhotos] = useState<string[]>([])
  const [lightboxTitle, setLightboxTitle] = useState('')
  const [lightboxIndex, setLightboxIndex] = useState(0)

  const fileInputRef = useRef<HTMLInputElement>(null)

  // Check microphone permissions
  const checkMicPermission = async () => {
    try {
      if (navigator.permissions && navigator.permissions.query) {
        const status = await navigator.permissions.query({ name: 'microphone' as PermissionName })
        setMicPermissionState(status.state as 'granted' | 'prompt' | 'denied')
        status.onchange = () => {
          setMicPermissionState(status.state as 'granted' | 'prompt' | 'denied')
        }
      } else {
        // Fallback for browsers without permissions.query for mic
        setMicPermissionState('unknown')
      }
    } catch {
      setMicPermissionState('unknown')
    }
  }

  // Explicit user permission request
  const requestMicrophonePermission = async () => {
    setIsRequestingPermission(true)
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        toast.error('Seu navegador não tem suporte à captura de áudio.')
        return
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      // Permission granted, release tracks immediately
      stream.getTracks().forEach((track) => track.stop())
      setMicPermissionState('granted')
      toast.success('Permissão de microfone concedida com sucesso!')
    } catch (err: any) {
      console.warn('Microphone permission request error:', err)
      setMicPermissionState('denied')
      toast.error(
        'Permissão negada. Clique no ícone de cadeado na barra de endereço do navegador para liberar o microfone.',
      )
    } finally {
      setIsRequestingPermission(false)
    }
  }

  // Initialize Speech Recognition & Auxiliary data
  useEffect(() => {
    loadAuxiliaries()
    loadRecentProducts()
    generateSuggestedCode()
    checkMicPermission()

    // Check Speech Recognition support
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) {
      setSpeechSupported(false)
    }

    return () => {
      manualStopRequestedRef.current = true
      isListeningRef.current = false
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current)
      }
      if (restartTimeoutRef.current) {
        clearTimeout(restartTimeoutRef.current)
      }
      try {
        recognitionRef.current?.abort?.()
      } catch {
        // ignore
      }
      try {
        notesRecRef.current?.abort?.()
      } catch {
        // ignore
      }
    }
  }, [])

  const generateSuggestedCode = async () => {
    try {
      const nextCode = await productService.getNextProductCode()
      setCode(nextCode)
    } catch {
      const random = Math.floor(100000 + Math.random() * 900000)
      setCode(`${random}`)
    }
  }

  const loadAuxiliaries = async () => {
    try {
      const data = await productService.getAuxiliaryData()
      setTypes(data.types)
      setMaterials(data.materials)
      setSizes(data.sizes)
    } catch (err) {
      console.error('Erro ao carregar dados auxiliares:', err)
    }
  }

  const loadRecentProducts = async () => {
    try {
      const res = await productService.getProducts({ perPage: 5 })
      setRecentProducts(res.items)
    } catch (err) {
      console.error('Erro ao carregar produtos recentes:', err)
    }
  }

  // Robust Speech Recognition instance manager
  // Keeps visual recording active without any flicker or restart of timer
  const startRecognitionEngine = () => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) return

    try {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort()
        } catch {
          // ignore
        }
        recognitionRef.current = null
      }

      const rec = new SpeechRecognition()
      rec.continuous = true
      rec.interimResults = true
      rec.lang = 'pt-BR'
      rec.maxAlternatives = 1

      rec.onstart = () => {
        // Visual state is already true and never reset on underlying engine reconnect
        setMicPermissionState('granted')
      }

      rec.onresult = (event: any) => {
        let interimChunk = ''

        // Reconstruct from event.resultIndex strictly
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const item = event.results[i]
          const text = item[0]?.transcript || ''

          if (item.isFinal) {
            const trimmed = text.trim()
            if (trimmed) {
              finalSegmentsRef.current.push(trimmed)
              // Update persistent text
              const fullText = finalSegmentsRef.current.join(' ')
              setTranscribedText(fullText)
            }
          } else {
            interimChunk += text
          }
        }

        setInterimText(interimChunk.trim())
      }

      rec.onerror = (event: any) => {
        console.warn('Speech engine event error:', event.error)

        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          // User denied permission - explicitly stop
          manualStopRequestedRef.current = true
          isListeningRef.current = false
          setIsListening(false)
          setMicPermissionState('denied')
          if (timerIntervalRef.current) {
            clearInterval(timerIntervalRef.current)
          }
          toast.error(
            'Permissão de microfone negada. Clique no botão de permitir microfone ou nas configurações do navegador.',
          )
          return
        }

        // For 'no-speech', 'audio-capture', 'network':
        // Web Speech API will call onend right after.
        // We will transparently revive it in onend if manualStopRequestedRef is false.
      }

      rec.onend = () => {
        // If stopped by user, stop cleanly
        if (manualStopRequestedRef.current) {
          isListeningRef.current = false
          setIsListening(false)
          setInterimText('')
          if (timerIntervalRef.current) {
            clearInterval(timerIntervalRef.current)
          }
          return
        }

        // The browser automatically ended the recognition session after a pause.
        // Visual recording stays TRUE without flickering.
        // Transparently reconnect the engine.
        if (restartTimeoutRef.current) {
          clearTimeout(restartTimeoutRef.current)
        }

        restartTimeoutRef.current = setTimeout(() => {
          if (!manualStopRequestedRef.current) {
            try {
              rec.start()
            } catch {
              // If reviving the same instance fails, recreate a fresh engine instance
              try {
                startRecognitionEngine()
              } catch (err) {
                console.error('Erro ao reconectar motor de reconhecimento:', err)
              }
            }
          }
        }, 150)
      }

      recognitionRef.current = rec
      rec.start()
    } catch (err) {
      console.error('Falha ao instanciar SpeechRecognition:', err)
      // Only tear down state if user hadn't already cancelled
      if (!manualStopRequestedRef.current) {
        // Re-attempt after short delay
        restartTimeoutRef.current = setTimeout(() => {
          if (!manualStopRequestedRef.current) {
            try {
              startRecognitionEngine()
            } catch {
              manualStopRequestedRef.current = true
              isListeningRef.current = false
              setIsListening(false)
            }
          }
        }, 500)
      }
    }
  }

  // Toggle main speech recording
  const toggleListening = () => {
    if (!speechSupported) {
      toast.warning('Seu navegador não suporta reconhecimento de voz. Por favor, digite o texto.')
      return
    }

    if (isListeningRef.current) {
      // User clicked explicitly to STOP
      manualStopRequestedRef.current = true
      isListeningRef.current = false
      setIsListening(false)
      setInterimText('')

      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current)
      }
      if (restartTimeoutRef.current) {
        clearTimeout(restartTimeoutRef.current)
      }

      try {
        recognitionRef.current?.stop()
      } catch {
        // ignore
      }

      const finalText = finalSegmentsRef.current.join(' ').trim()
      setTranscribedText(finalText)
      toast.info('Gravação finalizada. Revise ou clique em Preencher com IA.')
    } else {
      // User clicked explicitly to START
      manualStopRequestedRef.current = false
      isListeningRef.current = true
      setIsListening(true)
      finalSegmentsRef.current = []
      setTranscribedText('')
      setInterimText('')
      setRecordingSeconds(0)

      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current)
      }
      timerIntervalRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1)
      }, 1000)

      if (restartTimeoutRef.current) {
        clearTimeout(restartTimeoutRef.current)
      }

      startRecognitionEngine()
      toast.info(
        'Gravador ligado. Ele continuará gravando ininterruptamente até você clicar em Parar.',
      )
    }
  }

  // Handle quantity changes: automatically set minimumQuantity to 10% of initial quantity (editable)
  const handleQuantityChange = (newQtyStr: string) => {
    setQuantity(newQtyStr)
    const num = parseInt(newQtyStr, 10)
    if (!isNaN(num) && num > 0) {
      // 10% do estoque inicial (mínimo 1 unidade)
      const tenPercent = Math.max(1, Math.round(num * 0.1))
      setMinimumQuantity(tenPercent.toString())
    } else {
      setMinimumQuantity('')
    }
  }

  // Format seconds to mm:ss
  const formatTimer = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60)
    const secs = totalSeconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  // Helper to sanitize description: remove repeated type, size and audience if present
  const sanitizeDescription = (
    desc: string,
    typeName?: string,
    sizeName?: string,
    audience?: string,
  ) => {
    if (!desc) return ''
    let cleaned = desc

    // Remove audience references
    if (audience) {
      const audRegex = new RegExp(`\\b(${audience}|feminino|masculino|unissex)\\b`, 'gi')
      cleaned = cleaned.replace(audRegex, '')
    } else {
      cleaned = cleaned.replace(/\b(feminino|masculino|unissex)\b/gi, '')
    }

    // Remove size references if size was detected
    if (sizeName) {
      const esc = sizeName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const sizeRegex = new RegExp(`\\b(tamanho\\s+)?${esc}\\b`, 'gi')
      cleaned = cleaned.replace(sizeRegex, '')
    }
    // Also remove generic "tamanho único"
    cleaned = cleaned.replace(/\btamanho\s+(único|unico)\b/gi, '')

    // Clean up trailing/leading commas, dots, extra spaces
    cleaned = cleaned
      .replace(/,\s*,/g, ',')
      .replace(/,\s*\./g, '.')
      .replace(/\s+/g, ' ')
      .replace(/^\s*[,.\-—]\s*/, '')
      .replace(/\s*[,.\-—]\s*$/, '')
      .trim()

    return cleaned || desc
  }

  // Process text with Skip AI Gateway (fast model)
  const handleProcessWithAi = async () => {
    // If still recording, stop first
    if (isListeningRef.current) {
      toggleListening()
    }

    const currentCombined = [
      ...finalSegmentsRef.current,
      ...(interimText ? [interimText.trim()] : []),
    ]
      .join(' ')
      .trim()

    const textToAnalyze = (transcribedText.trim() || currentCombined).trim()

    if (!textToAnalyze) {
      toast.error('Grave ou digite uma descrição falada antes de interpretar com IA.')
      return
    }

    setIsAiProcessing(true)
    try {
      const result = await productService.interpretVoiceDescription(textToAnalyze)

      // Apply interpreted values to state without overwriting non-empty fields arbitrarily
      const cleanDesc = sanitizeDescription(
        result.description,
        result.type_name,
        result.size_name,
        result.target_audience || '',
      )

      if (cleanDesc) setDescription(cleanDesc)
      if (result.type_id) setSelectedType(result.type_id)
      if (result.material_id) setSelectedMaterial(result.material_id)
      if (result.size_id) setSelectedSize(result.size_id)
      if (result.target_audience) setTargetAudience(result.target_audience)

      if (typeof result.invested_value === 'number') {
        setInvestedValue(result.invested_value.toString())
      }
      if (typeof result.selling_price === 'number') {
        setSellingPrice(result.selling_price.toString())
      }
      if (typeof result.quantity === 'number') {
        setQuantity(result.quantity.toString())
        // Alerta de estoque mínimo pré-definido para 10% do estoque inicial
        const tenPercent = Math.max(1, Math.round(result.quantity * 0.1))
        setMinimumQuantity(tenPercent.toString())
      }
      if (result.observations) {
        setObservations((prev) => (prev ? `${prev} | ${result.observations}` : result.observations))
      }

      setMissingFields(result.missing_fields || [])

      // Rolar e focar nos campos do formulário com destaque
      setTimeout(() => {
        formReviewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        descriptionInputRef.current?.focus()
      }, 100)

      if (result.missing_fields && result.missing_fields.length > 0) {
        toast.info(
          'Descrição interpretada! A tela foi posicionada nos campos do formulário para revisão.',
        )
      } else {
        toast.success('Produto interpretado com sucesso pela IA! Revise os campos antes de salvar.')
      }
    } catch (err: any) {
      console.error('Erro ao interpretar com IA:', err)
      toast.error('Erro ao conectar com o serviço de IA: ' + (err.message || 'tente novamente.'))
    } finally {
      setIsAiProcessing(false)
    }
  }

  // Handle Photo addition (supports capture="environment" for camera on mobile)
  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newFiles = Array.from(e.target.files)
      const updatedPhotos = [...photos, ...newFiles].slice(0, 5)
      setPhotos(updatedPhotos)

      // Generate previews
      const newPreviews = updatedPhotos.map((file) => URL.createObjectURL(file))
      setPhotoPreviews(newPreviews)
      toast.success(`${newFiles.length} foto(s) capturada(s).`)
    }
  }

  const handleRemovePhoto = (index: number) => {
    const updatedPhotos = photos.filter((_, i) => i !== index)
    const updatedPreviews = photoPreviews.filter((_, i) => i !== index)
    setPhotos(updatedPhotos)
    setPhotoPreviews(updatedPreviews)
  }

  // Dictate notes
  const toggleNotesDictation = () => {
    if (!speechSupported) return
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) return

    if (isDictatingNotes) {
      try {
        notesRecRef.current?.stop()
      } catch {
        // ignore
      }
      setIsDictatingNotes(false)
    } else {
      try {
        const notesRec = new SpeechRecognition()
        notesRecRef.current = notesRec
        notesRec.lang = 'pt-BR'
        notesRec.continuous = false
        notesRec.interimResults = false
        notesRec.onstart = () => setIsDictatingNotes(true)
        notesRec.onresult = (ev: any) => {
          let chunk = ''
          for (let i = 0; i < ev.results.length; ++i) {
            if (ev.results[i].isFinal) {
              const text = ev.results[i][0]?.transcript || ''
              if (text.trim()) {
                chunk += (chunk ? ' ' : '') + text.trim()
              }
            }
          }
          const cleanChunk = chunk.trim()
          if (cleanChunk) {
            setObservations((prev) => (prev ? `${prev} | ${cleanChunk}` : cleanChunk))
          }
        }
        notesRec.onerror = (err: any) => {
          console.warn('Erro ao ditar observações:', err)
          setIsDictatingNotes(false)
        }
        notesRec.onend = () => setIsDictatingNotes(false)
        notesRec.start()
      } catch (err) {
        console.error('Falha ao iniciar ditado de notas:', err)
        setIsDictatingNotes(false)
      }
    }
  }

  // Clear form with confirmation
  const handleClearForm = () => {
    if (window.confirm('Deseja limpar todos os campos preenchidos?')) {
      if (isListeningRef.current) {
        toggleListening()
      }
      finalSegmentsRef.current = []
      setTranscribedText('')
      setInterimText('')
      setRecordingSeconds(0)
      generateSuggestedCode()
      setDescription('')
      setSelectedType('')
      setSelectedMaterial('')
      setSelectedSize('')
      setTargetAudience('')
      setInvestedValue('')
      setSellingPrice('')
      setQuantity('')
      setMinimumQuantity('')
      setObservations('')
      setPhotos([])
      setPhotoPreviews([])
      setMissingFields([])
      toast.info('Formulário resetado.')
    }
  }

  // Save product
  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault()

    // Validations
    if (!code.trim()) {
      toast.error('O código do produto é obrigatório.')
      return
    }
    if (!description.trim()) {
      toast.error('A descrição do produto é obrigatória.')
      return
    }
    const numSellingPrice = parseFloat(sellingPrice)
    if (isNaN(numSellingPrice) || numSellingPrice <= 0) {
      toast.error('Informe um preço de venda válido maior que zero.')
      return
    }
    const numQuantity = parseInt(quantity, 10)
    if (isNaN(numQuantity) || numQuantity < 0) {
      toast.error('Informe uma quantidade válida.')
      return
    }

    setIsSaving(true)
    try {
      const formData = new FormData()
      formData.append('code', code.trim().toUpperCase())
      formData.append('description', description.trim())
      if (selectedType) formData.append('type', selectedType)
      if (selectedMaterial) formData.append('material', selectedMaterial)
      if (selectedSize) formData.append('size', selectedSize)
      if (targetAudience) formData.append('target_audience', targetAudience)
      if (investedValue) formData.append('invested_value', investedValue)
      formData.append('selling_price', numSellingPrice.toString())
      formData.append('quantity', numQuantity.toString())
      if (minimumQuantity) formData.append('minimum_quantity', minimumQuantity)
      if (observations) formData.append('observations', observations.trim())
      formData.append('status', numQuantity > 0 ? 'available' : 'unavailable')

      photos.forEach((file) => {
        formData.append('photos', file)
      })

      const created = await productService.createProduct(formData)
      toast.success(`Joia "${created.description}" cadastrada com sucesso!`)

      // Reset and reload recent
      setTranscribedText('')
      generateSuggestedCode()
      setDescription('')
      setSelectedType('')
      setSelectedMaterial('')
      setSelectedSize('')
      setTargetAudience('')
      setInvestedValue('')
      setSellingPrice('')
      setQuantity('')
      setObservations('')
      setPhotos([])
      setPhotoPreviews([])
      setMissingFields([])

      loadRecentProducts()
    } catch (err: any) {
      console.error('Erro ao salvar produto:', err)
      const message = err?.data?.data?.code?.message || err?.message || 'Falha ao salvar produto.'
      toast.error(`Erro ao salvar: ${message}`)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Page Title */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#E5DFD5] pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-lg bg-[#C6A664]/20 text-[#7A5C2E]">
              <Mic className="h-5 w-5" />
            </span>
            <h1 className="font-serif text-2xl md:text-3xl font-bold text-[#2D2A26]">
              Cadastro Rápido por Voz
            </h1>
            <Badge
              variant="outline"
              className="border-[#C6A664]/50 text-[#7A5C2E] text-[10px] ml-2"
            >
              v{APP_VERSION}
            </Badge>
          </div>
          <p className="text-sm text-[#6B655E] mt-1">
            Fale a descrição da joia em uma frase e a IA estruturará o cadastro. O microfone
            permanece gravando continuamente até você clicar no botão vermelho.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Permission Button - only shown when permission is not granted ('prompt', 'denied' or 'unknown') */}
          {micPermissionState !== 'granted' && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={requestMicrophonePermission}
              disabled={isRequestingPermission}
              className={`${
                micPermissionState === 'denied'
                  ? 'border-[#B3261E] bg-[#B3261E]/10 text-[#B3261E] hover:bg-[#B3261E]/20'
                  : 'border-[#C6A664] bg-[#C6A664]/10 text-[#7A5C2E] hover:bg-[#C6A664]/20'
              } font-medium`}
            >
              <ShieldAlert className="h-4 w-4 mr-1.5" />
              {isRequestingPermission
                ? 'Solicitando...'
                : micPermissionState === 'denied'
                  ? 'Liberar Microfone no Navegador'
                  : 'Permitir Microfone'}
            </Button>
          )}

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleClearForm}
            className="border-[#E5DFD5] hover:bg-[#F3EAD8] text-[#6B655E]"
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            Limpar Tudo
          </Button>
        </div>
      </div>

      {/* Permission alert banner if denied */}
      {micPermissionState === 'denied' && (
        <div className="p-4 rounded-xl bg-[#B3261E]/10 border border-[#B3261E]/30 text-sm text-[#B3261E] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <ShieldAlert className="h-5 w-5 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">
                O microfone está bloqueado nas permissões deste navegador.
              </p>
              <p className="text-xs text-[#2D2A26] mt-0.5">
                Para gravar, clique no ícone de <strong>cadeado/configurações</strong> ao lado da
                barra de endereço (URL), altere <em>Microfone</em> para <strong>Permitir</strong> e
                recarregue a página.
              </p>
            </div>
          </div>
          <Button
            type="button"
            size="sm"
            onClick={requestMicrophonePermission}
            className="bg-[#B3261E] text-white hover:bg-[#921E17] shrink-0 text-xs"
          >
            Tentar Novamente
          </Button>
        </div>
      )}

      {/* Voice Assistant Anchor Section (Mobile-First Hero) */}
      <Card className="border-[#E5DFD5] bg-gradient-to-br from-[#FFFFFF] via-[#FDFBF7] to-[#F3EAD8]/40 shadow-md">
        <CardHeader className="text-center pb-2">
          <Badge
            variant="outline"
            className="w-fit mx-auto border-[#C6A664] text-[#7A5C2E] bg-[#C6A664]/10 font-medium tracking-wide mb-2"
          >
            <Sparkles className="h-3 w-3 mr-1" /> Inteligência Artificial Skip AI
          </Badge>
          <CardTitle className="font-serif text-xl md:text-2xl text-[#2D2A26]">
            Descreva a joia falando pelo microfone
          </CardTitle>
          <CardDescription className="text-xs md:text-sm text-[#6B655E] max-w-lg mx-auto">
            Exemplo:{' '}
            <span className="italic font-medium text-[#7A5C2E]">
              "Brinco folheado a ouro, feminino, tamanho único, investi 20, vendo por 60, uma
              unidade"
            </span>
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6 pt-2">
          {/* Giant Microphone Recording Button — Estado estável garantido sem flicker */}
          <div className="flex flex-col items-center justify-center py-4">
            <button
              type="button"
              onClick={toggleListening}
              aria-label={isListening ? 'Parar gravação' : 'Iniciar gravação'}
              className={`relative h-24 w-24 md:h-28 md:w-28 rounded-full flex items-center justify-center text-white transition-all duration-300 shadow-xl cursor-pointer ${
                isListening
                  ? 'bg-[#B3261E] ring-8 ring-[#B3261E]/30 scale-105'
                  : 'bg-gradient-to-tr from-[#7A5C2E] via-[#C6A664] to-[#E8D5A3] hover:scale-105 hover:shadow-2xl'
              }`}
            >
              {isListening ? (
                <MicOff className="h-10 w-10 md:h-12 md:w-12" />
              ) : (
                <Mic className="h-10 w-10 md:h-12 md:w-12" />
              )}
            </button>

            {/* Timer and uninterrupted status banner */}
            {isListening ? (
              <div className="mt-3 flex flex-col items-center gap-1">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#B3261E]/10 border border-[#B3261E]/30 text-[#B3261E] text-xs font-semibold">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#B3261E] opacity-75" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#B3261E]" />
                  </span>
                  <span>GRAVANDO CONTINUAMENTE ({formatTimer(recordingSeconds)})</span>
                </div>
                <p className="text-xs text-[#6B655E] mt-1 font-medium">
                  O gravador não desligará sozinho. Clique no botão vermelho quando terminar de
                  falar.
                </p>
              </div>
            ) : (
              <p className="mt-3 text-sm font-semibold text-[#2D2A26]">
                Clique no microfone para gravar (permanece ativo até você parar)
              </p>
            )}

            {!speechSupported && (
              <p className="text-xs text-[#B3261E] mt-2">
                Reconhecimento de fala não suportado neste navegador. Digite no campo abaixo.
              </p>
            )}
          </div>

          {/* Editable Transcription Area */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold text-[#6B655E] uppercase tracking-wider flex items-center gap-1.5">
                <Volume2 className="h-3.5 w-3.5 text-[#C6A664]" /> Texto transcrito da fala
                (Editável)
              </Label>
              <div className="flex items-center gap-2">
                {isListening && interimText && (
                  <span className="text-[11px] text-[#2E7D4F] italic flex items-center gap-1">
                    <Radio className="h-3 w-3 animate-pulse" /> Ouvindo agora...
                  </span>
                )}
                {transcribedText && (
                  <span className="text-xs text-[#7A5C2E] font-medium">
                    {transcribedText.split(' ').filter(Boolean).length} palavras
                  </span>
                )}
              </div>
            </div>

            <Textarea
              value={
                isListening && interimText
                  ? transcribedText
                    ? `${transcribedText} [ouvindo: ${interimText}]`
                    : `[ouvindo: ${interimText}]`
                  : transcribedText
              }
              onChange={(e) => {
                setTranscribedText(e.target.value)
                finalSegmentsRef.current = e.target.value ? [e.target.value] : []
              }}
              placeholder="Sua fala aparecerá aqui automaticamente. Você também pode digitar ou corrigir o texto antes de enviar para a IA..."
              rows={3}
              className="bg-white border-[#E5DFD5] focus-visible:ring-[#C6A664] text-base resize-none"
            />
          </div>

          {/* Interpret with AI Action Button */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 border-t border-[#E5DFD5]">
            <p className="text-xs text-[#6B655E] flex items-center gap-1">
              <HelpCircle className="h-3.5 w-3.5 text-[#C6A664]" /> A IA nunca inventa preços ou
              quantidades não informados.
            </p>
            <Button
              type="button"
              onClick={handleProcessWithAi}
              disabled={isAiProcessing || !transcribedText.trim()}
              className="w-full sm:w-auto bg-gradient-to-r from-[#7A5C2E] to-[#C6A664] hover:opacity-90 text-white font-semibold shadow-sm px-6"
            >
              {isAiProcessing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Interpretando com IA...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" /> Preencher Formulário com IA
                </>
              )}
            </Button>
          </div>

          {/* Missing fields warning banner */}
          {missingFields.length > 0 && (
            <div className="p-3.5 rounded-xl bg-[#B26A00]/10 border border-[#B26A00]/30 flex items-start gap-3 text-sm text-[#B26A00]">
              <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold">Atenção para revisão:</span> Alguns campos não foram
                detectados na fala e precisam ser preenchidos manualmente:
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {missingFields.map((f) => (
                    <Badge
                      key={f}
                      variant="secondary"
                      className="bg-[#B26A00]/15 text-[#B26A00] border-none text-xs"
                    >
                      {f === 'selling_price'
                        ? 'Preço de venda'
                        : f === 'quantity'
                          ? 'Quantidade'
                          : f === 'type'
                            ? 'Tipo'
                            : f === 'material'
                              ? 'Material'
                              : f === 'size'
                                ? 'Tamanho'
                                : f === 'target_audience'
                                  ? 'Perfil'
                                  : f}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Main Review and Save Form com Ref para foco e scroll da IA */}
      <div ref={formReviewRef}>
        <form onSubmit={handleSaveProduct} className="space-y-6">
          <Card className="border-[#E5DFD5] bg-white shadow-sm">
            <CardHeader className="border-b border-[#E5DFD5] pb-4">
              <CardTitle className="font-serif text-lg md:text-xl text-[#2D2A26] flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-[#2E7D4F]" />
                Revisão dos Dados da Joia
              </CardTitle>
              <CardDescription className="text-xs md:text-sm text-[#6B655E]">
                Nada é salvo automaticamente. Valide todas as informações antes de confirmar o
                cadastro.
              </CardDescription>
            </CardHeader>

            <CardContent className="pt-6 space-y-5">
              {/* Row 1: Code & Description */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="code" className="text-xs font-semibold text-[#2D2A26]">
                    Código do Produto *
                  </Label>
                  <Input
                    id="code"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    placeholder="Ex: 100001"
                    required
                    className="mt-1 border-[#E5DFD5] focus-visible:ring-[#C6A664] uppercase font-mono font-bold"
                  />
                </div>

                <div className="md:col-span-2">
                  <Label htmlFor="desc" className="text-xs font-semibold text-[#2D2A26]">
                    Descrição da Joia *
                  </Label>
                  <Input
                    ref={descriptionInputRef}
                    id="desc"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Ex: Brinco folheado a ouro com zircônia redonda"
                    required
                    className="mt-1 border-[#E5DFD5] focus-visible:ring-[#C6A664]"
                  />
                </div>
              </div>

              {/* Ordem obrigatória: Tipo, Material, Perfil, Tamanho (sem ' / Medida') */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <Label className="text-xs font-semibold text-[#2D2A26]">Tipo</Label>
                  <select
                    value={selectedType}
                    onChange={(e) => setSelectedType(e.target.value)}
                    className="mt-1 w-full rounded-md border border-[#E5DFD5] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C6A664]"
                  >
                    <option value="">Selecione...</option>
                    {types.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <Label className="text-xs font-semibold text-[#2D2A26]">Material</Label>
                  <select
                    value={selectedMaterial}
                    onChange={(e) => setSelectedMaterial(e.target.value)}
                    className="mt-1 w-full rounded-md border border-[#E5DFD5] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C6A664]"
                  >
                    <option value="">Selecione...</option>
                    {materials.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <Label className="text-xs font-semibold text-[#2D2A26]">Perfil</Label>
                  <select
                    value={targetAudience}
                    onChange={(e) => setTargetAudience(e.target.value)}
                    className="mt-1 w-full rounded-md border border-[#E5DFD5] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C6A664]"
                  >
                    <option value="">Selecione...</option>
                    <option value="feminino">Feminino</option>
                    <option value="masculino">Masculino</option>
                    <option value="unissex">Unissex</option>
                  </select>
                </div>

                <div>
                  <Label className="text-xs font-semibold text-[#2D2A26]">Tamanho</Label>
                  <select
                    value={selectedSize}
                    onChange={(e) => setSelectedSize(e.target.value)}
                    className="mt-1 w-full rounded-md border border-[#E5DFD5] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C6A664]"
                  >
                    <option value="">Selecione...</option>
                    {sizes.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Row 3: Invested value, Selling price, Quantity, Min stock */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 rounded-xl bg-[#FDFBF7] border border-[#E5DFD5]">
                <div>
                  <Label htmlFor="invested" className="text-xs font-semibold text-[#6B655E]">
                    Valor Investido (R$)
                  </Label>
                  <Input
                    id="invested"
                    type="number"
                    step="0.01"
                    min="0"
                    value={investedValue}
                    onChange={(e) => setInvestedValue(e.target.value)}
                    placeholder="0,00"
                    className="mt-1 bg-white border-[#E5DFD5] focus-visible:ring-[#C6A664]"
                  />
                </div>

                <div>
                  <Label htmlFor="selling" className="text-xs font-semibold text-[#2D2A26]">
                    Preço de Venda (R$) *
                  </Label>
                  <Input
                    id="selling"
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={sellingPrice}
                    onChange={(e) => setSellingPrice(e.target.value)}
                    placeholder="0,00"
                    required
                    className="mt-1 bg-white border-[#C6A664] focus-visible:ring-[#C6A664] font-semibold text-[#7A5C2E]"
                  />
                </div>

                <div>
                  <Label htmlFor="qty" className="text-xs font-semibold text-[#2D2A26]">
                    Quantidade em Estoque *
                  </Label>
                  <Input
                    id="qty"
                    type="number"
                    min="0"
                    step="1"
                    value={quantity}
                    onChange={(e) => handleQuantityChange(e.target.value)}
                    placeholder="1"
                    required
                    className="mt-1 bg-white border-[#E5DFD5] focus-visible:ring-[#C6A664] font-semibold"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="minQty" className="text-xs font-semibold text-[#6B655E]">
                      Alerta Estoque Mínimo
                    </Label>
                    <span className="text-[10px] text-[#7A5C2E] font-medium">(10% sugerido)</span>
                  </div>
                  <Input
                    id="minQty"
                    type="number"
                    min="0"
                    step="1"
                    value={minimumQuantity}
                    onChange={(e) => setMinimumQuantity(e.target.value)}
                    placeholder="Auto 10%"
                    className="mt-1 bg-white border-[#E5DFD5] focus-visible:ring-[#C6A664]"
                  />
                </div>
              </div>

              {/* Row 4: Observations with Dictate button */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <Label htmlFor="obs" className="text-xs font-semibold text-[#2D2A26]">
                    Observações e Detalhes
                  </Label>
                  {speechSupported && (
                    <button
                      type="button"
                      onClick={toggleNotesDictation}
                      className={`text-xs flex items-center gap-1 font-medium transition-colors ${
                        isDictatingNotes
                          ? 'text-[#B3261E] animate-pulse'
                          : 'text-[#7A5C2E] hover:underline'
                      }`}
                    >
                      <Mic className="h-3 w-3" />
                      {isDictatingNotes ? 'Ouvindo observações...' : 'Ditar observação por voz'}
                    </button>
                  )}
                </div>
                <Textarea
                  id="obs"
                  value={observations}
                  onChange={(e) => setObservations(e.target.value)}
                  placeholder="Ex: Cravação reforçada, banho 10 milésimos, garantia de 1 ano..."
                  rows={2}
                  className="border-[#E5DFD5] focus-visible:ring-[#C6A664]"
                />
              </div>

              {/* Row 5: Camera & Photo capture */}
              <div className="space-y-3 pt-2">
                <Label className="text-xs font-semibold text-[#2D2A26] block">
                  Fotos do Produto (Câmera do celular ou arquivo)
                </Label>

                <div className="flex flex-wrap items-center gap-3">
                  {/* Mobile Camera capture trigger */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    multiple
                    onChange={handlePhotoSelect}
                    className="hidden"
                  />

                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    className="border-[#C6A664] text-[#7A5C2E] hover:bg-[#F3EAD8]"
                  >
                    <Camera className="h-4 w-4 mr-2" />
                    Fotografar / Anexar Fotos
                  </Button>

                  <span className="text-xs text-[#6B655E]">Máx. 5 fotos (JPG, PNG, WebP)</span>
                </div>

                {/* Photos Previews */}
                {photoPreviews.length > 0 && (
                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-3 pt-2">
                    {photoPreviews.map((preview, index) => (
                      <div
                        key={index}
                        className="relative group rounded-xl overflow-hidden border border-[#E5DFD5] aspect-square bg-[#FDFBF7]"
                      >
                        <img
                          src={preview}
                          alt={`Prévia ${index + 1}`}
                          className="w-full h-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => handleRemovePhoto(index)}
                          className="absolute top-1 right-1 p-1 rounded-full bg-black/60 text-white hover:bg-[#B3261E] transition-colors"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Submit Actions */}
          <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={handleClearForm}
              className="w-full sm:w-auto text-[#6B655E]"
            >
              Cancelar / Limpar
            </Button>

            <Button
              type="submit"
              disabled={isSaving}
              className="w-full sm:w-auto bg-[#2E7D4F] hover:bg-[#256640] text-white font-semibold shadow-md px-8 py-2.5"
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Salvando Joia...
                </>
              ) : (
                <>
                  <PackageCheck className="h-4 w-4 mr-2" /> Salvar Produto no Estoque
                </>
              )}
            </Button>
          </div>
        </form>
      </div>

      {/* Recently Added Products List — Com colunas separadas para Tipo, Tamanho e Perfil */}
      <div className="pt-6 border-t border-[#E5DFD5]">
        <h2 className="font-serif text-lg md:text-xl font-bold text-[#2D2A26] mb-4 flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-[#C6A664]" />
          Últimos Produtos Cadastrados
        </h2>

        {recentProducts.length === 0 ? (
          <p className="text-sm text-[#6B655E] italic">Nenhum produto cadastrado ainda.</p>
        ) : (
          <Card className="border-[#E5DFD5] bg-white shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-[#F3EAD8] text-[#2D2A26] border-b border-[#E5DFD5] font-semibold uppercase tracking-wider">
                    <th className="py-2.5 px-3">Foto</th>
                    <th className="py-2.5 px-3">Código</th>
                    <th className="py-2.5 px-3">Tipo</th>
                    <th className="py-2.5 px-3">Material</th>
                    <th className="py-2.5 px-3">Perfil</th>
                    <th className="py-2.5 px-3">Tamanho</th>
                    <th className="py-2.5 px-3 min-w-[200px]">Descrição Completa</th>
                    <th className="py-2.5 px-3 text-right">Preço</th>
                    <th className="py-2.5 px-3 text-center">Estoque</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5DFD5]">
                  {recentProducts.map((p) => {
                    const photo =
                      p.photos && p.photos.length > 0
                        ? getFileUrl('products', p.id, p.photos[0])
                        : null
                    const hasPhoto = Boolean(photo)

                    return (
                      <tr key={p.id} className="hover:bg-[#FDFBF7]">
                        <td className="py-2.5 px-3">
                          <button
                            type="button"
                            onClick={() => {
                              if (!hasPhoto || !p.photos) return
                              const urls = p.photos.map((ph) => getFileUrl('products', p.id, ph))
                              setLightboxPhotos(urls)
                              setLightboxTitle(`${p.code} — ${p.description}`)
                              setLightboxIndex(0)
                              setLightboxOpen(true)
                            }}
                            disabled={!hasPhoto}
                            className={`relative group h-10 w-10 rounded-lg bg-[#F3EAD8] overflow-hidden flex items-center justify-center shrink-0 border border-[#E5DFD5] ${
                              hasPhoto ? 'cursor-pointer hover:border-[#C6A664]' : 'cursor-default'
                            }`}
                            title={hasPhoto ? 'Clique para ampliar foto' : 'Sem foto'}
                          >
                            {photo ? (
                              <>
                                <img
                                  src={photo}
                                  alt={p.description}
                                  className="h-full w-full object-cover group-hover:scale-105 transition-transform"
                                />
                                <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white">
                                  <ZoomIn className="h-3.5 w-3.5" />
                                </div>
                              </>
                            ) : (
                              <PackageCheck className="h-4 w-4 text-[#C6A664]" />
                            )}
                          </button>
                        </td>

                        <td className="py-2.5 px-3 font-mono font-bold text-[#7A5C2E]">{p.code}</td>

                        {/* Ordem: Tipo, Material, Perfil, Tamanho, Descrição Completa */}
                        <td className="py-2.5 px-3 font-medium text-[#2D2A26]">
                          {p.expand?.type?.name || '—'}
                        </td>

                        <td className="py-2.5 px-3 text-[#6B655E]">
                          {p.expand?.material?.name || '—'}
                        </td>

                        <td className="py-2.5 px-3">
                          <span className="capitalize px-2 py-0.5 rounded-full bg-[#F3EAD8] text-[#7A5C2E] inline-block font-medium">
                            {p.target_audience || 'Unissex'}
                          </span>
                        </td>

                        <td className="py-2.5 px-3 text-[#6B655E]">
                          {p.expand?.size?.name || 'Único'}
                        </td>

                        <td className="py-2.5 px-3">
                          <div className="font-medium text-[#2D2A26] whitespace-normal break-words leading-relaxed">
                            {p.description}
                          </div>
                        </td>

                        <td className="py-2.5 px-3 text-right font-bold text-[#2E7D4F]">
                          {formatCurrency(p.selling_price)}
                        </td>

                        <td className="py-2.5 px-3 text-center">
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                            {p.quantity} unid.
                          </Badge>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>

      {/* Lightbox Modal Reutilizável */}
      <ImageLightbox
        open={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
        photos={lightboxPhotos}
        initialIndex={lightboxIndex}
        title={lightboxTitle}
      />
    </div>
  )
}
