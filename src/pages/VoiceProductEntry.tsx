import React, { useState, useEffect, useRef } from 'react'
import { productService } from '@/services/productService'
import { Product, ProductType, ProductMaterial, ProductSize } from '@/types'
import {
  formatCurrency,
  getFileUrl,
  getProductDisplayPhoto,
  normalizeCurrencyValue,
  normalizeCurrencyText,
} from '@/lib/formatters'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ImageLightbox } from '@/components/ImageLightbox'
import { VoiceGuidedModal, GuidedProductData } from '@/components/VoiceGuidedModal'
import { VoiceCadIaModal, CadIaProductData } from '@/components/VoiceCadIaModal'
import {
  Mic,
  MicOff,
  Sparkles,
  Camera,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  X,
  Volume2,
  PackageCheck,
  Loader2,
  HelpCircle,
  ZoomIn,
  ShieldAlert,
  ShieldCheck,
  AlertCircle,
  Key,
  RefreshCw,
  ListOrdered,
  Bot,
  FileSpreadsheet,
} from 'lucide-react'
import { toast } from 'sonner'
import { APP_VERSION } from '@/version'

/**
 * Detect supported audio MIME type for MediaRecorder with cross-browser fallbacks.
 * iOS Safari requires audio/mp4 or audio/aac; Chrome/Android prefers audio/webm.
 */
function getSupportedAudioMimeType(): { mimeType: string; extension: string } {
  if (typeof window === 'undefined' || typeof MediaRecorder === 'undefined') {
    return { mimeType: '', extension: 'mp4' }
  }

  const candidates = [
    { mimeType: 'audio/webm;codecs=opus', extension: 'webm' },
    { mimeType: 'audio/webm', extension: 'webm' },
    { mimeType: 'audio/mp4;codecs=mp4a.40.2', extension: 'mp4' },
    { mimeType: 'audio/mp4', extension: 'mp4' },
    { mimeType: 'audio/aac', extension: 'aac' },
    { mimeType: 'audio/ogg;codecs=opus', extension: 'ogg' },
  ]

  for (const candidate of candidates) {
    if (MediaRecorder.isTypeSupported(candidate.mimeType)) {
      return candidate
    }
  }

  // Fallback default
  return { mimeType: '', extension: 'mp4' }
}

export default function VoiceProductEntry() {
  // Main voice recording & transcription state (Server-side STT via MediaRecorder)
  const [isRecording, setIsRecording] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [transcriptionError, setTranscriptionError] = useState<{
    type: 'info' | 'error'
    message: string
  } | null>(null)
  const [isSttConfigured, setIsSttConfigured] = useState<boolean | null>(null)
  const [transcribedText, setTranscribedText] = useState('')
  const [recordingSeconds, setRecordingSeconds] = useState(0)
  const [isAiProcessing, setIsAiProcessing] = useState(false)

  // Last recorded audio blob for retry
  const lastRecordedBlobRef = useRef<{ blob: Blob; ext: string } | null>(null)

  // Microphone permission state: 'granted' | 'prompt' | 'denied' | 'unknown'
  const [micPermissionState, setMicPermissionState] = useState<
    'granted' | 'prompt' | 'denied' | 'unknown'
  >('unknown')
  const [isRequestingPermission, setIsRequestingPermission] = useState(false)

  // Observations specific speech recording
  const [isRecordingNotes, setIsRecordingNotes] = useState(false)
  const [isTranscribingNotes, setIsTranscribingNotes] = useState(false)

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
  const [initialQuantity, setInitialQuantity] = useState<string>('')
  const [quantity, setQuantity] = useState<string>('')
  const [publishEcommerce, setPublishEcommerce] = useState<boolean>(true)
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

  // MediaRecorder refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioStreamRef = useRef<MediaStream | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const timerIntervalRef = useRef<any>(null)
  const recordingStartTimeRef = useRef<number>(0)

  // Notes MediaRecorder refs
  const notesMediaRecorderRef = useRef<MediaRecorder | null>(null)
  const notesAudioStreamRef = useRef<MediaStream | null>(null)
  const notesAudioChunksRef = useRef<Blob[]>([])

  // Guided Voice Modal State
  const [guidedModalOpen, setGuidedModalOpen] = useState(false)

  // Cad IA Modal State (3º formato de cadastro por voz)
  const [cadIaModalOpen, setCadIaModalOpen] = useState(false)

  // Lightbox
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [lightboxPhotos, setLightboxPhotos] = useState<string[]>([])
  const [lightboxTitle, setLightboxTitle] = useState('')
  const [lightboxIndex, setLightboxIndex] = useState(0)

  const fileInputRef = useRef<HTMLInputElement>(null)

  // SpeechRecognition instance ref for Web Speech API fallback/hybrid
  const speechRecognitionRef = useRef<any>(null)
  const [hasBrowserSpeechRecognition, setHasBrowserSpeechRecognition] = useState(false)
  const [speechRecognitionActive, setSpeechRecognitionActive] = useState(false)

  // Check microphone permissions & browser speech support
  const checkMicPermission = async () => {
    // Check SpeechRecognition support in browser
    if (typeof window !== 'undefined') {
      const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
      if (SpeechRec) {
        setHasBrowserSpeechRecognition(true)
      }
    }

    try {
      if (navigator.permissions && navigator.permissions.query) {
        const status = await navigator.permissions.query({ name: 'microphone' as PermissionName })
        setMicPermissionState(status.state as 'granted' | 'prompt' | 'denied')
        status.onchange = () => {
          setMicPermissionState(status.state as 'granted' | 'prompt' | 'denied')
        }
      } else {
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

  // Initialize data on mount
  useEffect(() => {
    loadAuxiliaries()
    loadRecentProducts()
    generateSuggestedCode()
    checkMicPermission()

    return () => {
      // Clean up any active recording stream on unmount
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current)
      }
      try {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
          mediaRecorderRef.current.stop()
        }
      } catch {
        // ignore
      }
      try {
        audioStreamRef.current?.getTracks().forEach((t) => t.stop())
      } catch {
        // ignore
      }
      try {
        if (notesMediaRecorderRef.current && notesMediaRecorderRef.current.state !== 'inactive') {
          notesMediaRecorderRef.current.stop()
        }
      } catch {
        // ignore
      }
      try {
        notesAudioStreamRef.current?.getTracks().forEach((t) => t.stop())
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
      setCode('10000')
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

  // Start native browser SpeechRecognition as parallel / direct STT
  const startBrowserSpeechRecognition = (onResult: (text: string) => void) => {
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRec) return null

    try {
      const recognition = new SpeechRec()
      recognition.lang = 'pt-BR'
      recognition.continuous = true
      recognition.interimResults = true
      recognition.maxAlternatives = 1

      let accumulated = ''

      recognition.onresult = (event: any) => {
        let currentTranscript = ''
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript
          if (event.results[i].isFinal) {
            accumulated += (accumulated ? ' ' : '') + transcript
          } else {
            currentTranscript += transcript
          }
        }
        const rawFull = (accumulated + ' ' + currentTranscript).trim()
        const normalized = normalizeCurrencyText(rawFull)
        if (normalized) {
          onResult(normalized)
        }
      }

      recognition.onerror = (event: any) => {
        console.warn('SpeechRecognition event error:', event.error)
      }

      recognition.start()
      return recognition
    } catch (err) {
      console.warn('SpeechRecognition start failed:', err)
      return null
    }
  }

  // Send audio Blob to server-side transcription
  const processAudioBlob = async (audioBlob: Blob, extension: string) => {
    // If browser speech recognition already captured text while speaking, keep it as fallback/preview
    const existingBrowserText = normalizeCurrencyText(transcribedText.trim())

    setIsTranscribing(true)
    setTranscriptionError(null)

    const filename = `fala_${Date.now()}.${extension}`

    try {
      const res = await productService.transcribeAudio(audioBlob, filename)

      if (res.configured !== false) {
        setIsSttConfigured(true)
        const text = normalizeCurrencyText((res.text || '').trim())

        if (text) {
          setTranscribedText(text)
          toast.success(
            'Áudio transcrito com sucesso! Revise ou clique em "Preencher Formulário com IA".',
          )
        } else if (existingBrowserText) {
          setTranscribedText(existingBrowserText)
          toast.success(
            'Fala transcrita diretamente pelo navegador! Revise ou clique em "Preencher Formulário com IA".',
          )
        } else {
          toast.warning('O áudio gravado não contém fala compreensível. Tente gravar novamente.')
        }
      } else {
        // Servidor retornou 503 com configured: false (capturado de forma limpa pelo productService)
        setIsSttConfigured(false)
        if (existingBrowserText) {
          setTranscribedText(existingBrowserText)
          setTranscriptionError({
            type: 'info',
            message:
              'Transcrição no servidor ainda não está configurada. O texto reconhecido no aparelho foi aproveitado — revise e edite antes de continuar.',
          })
          toast.info(
            'Texto reconhecido no aparelho aproveitado. Revise e edite antes de continuar.',
          )
        } else {
          setTranscriptionError({
            type: 'info',
            message:
              'Transcrição no servidor ainda não está configurada. Digite a descrição abaixo ou grave novamente pelo microfone do aparelho.',
          })
          toast.info('Grave novamente ou digite a descrição da joia no campo abaixo.')
        }
      }
    } catch (err: any) {
      console.info('[STT Transcrição]', err?.message || 'Falha na conexão de transcrição')
      const errorMsg =
        err?.data?.error ||
        err?.message ||
        'Falha ao transcrever o áudio no servidor. Verifique a conexão.'

      // Detect if server-side STT is not configured
      if (
        err?.status === 503 ||
        err?.data?.configured === false ||
        err?.data?.useBrowserStt ||
        errorMsg.includes('Speech-to-Text') ||
        errorMsg.includes('OPENAI_API_KEY') ||
        errorMsg.includes('GROQ_API_KEY') ||
        errorMsg.includes('SKIP_AI_GATEWAY_API_KEY')
      ) {
        setIsSttConfigured(false)
        if (existingBrowserText) {
          setTranscribedText(existingBrowserText)
          setTranscriptionError({
            type: 'info',
            message:
              'Transcrição no servidor ainda não está configurada. O texto reconhecido no aparelho foi aproveitado — revise e edite antes de continuar.',
          })
          toast.info('Texto reconhecido no aparelho aproveitado!')
        } else {
          setTranscriptionError({
            type: 'info',
            message:
              'Transcrição no servidor ainda não está configurada. Digite a descrição abaixo ou grave novamente pelo microfone do aparelho.',
          })
          toast.info('Grave novamente ou digite a descrição no campo abaixo.')
        }
      } else {
        // Outro erro inesperado
        if (existingBrowserText) {
          setTranscribedText(existingBrowserText)
          toast.info('Transcrição local do navegador preservada.')
        } else {
          setTranscriptionError({
            type: 'error',
            message: errorMsg,
          })
          toast.error(`Erro ao transcrever áudio: ${errorMsg}`)
        }
      }
    } finally {
      setIsTranscribing(false)
    }
  }

  // Retry last transcription
  const handleRetryTranscription = () => {
    if (lastRecordedBlobRef.current) {
      processAudioBlob(lastRecordedBlobRef.current.blob, lastRecordedBlobRef.current.ext)
    }
  }

  // Start recording with dual MediaRecorder + Browser SpeechRecognition (for real-time STT support)
  const startRecording = async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      toast.error('Seu navegador não suporta captura de microfone.')
      return
    }

    try {
      setTranscriptionError(null)
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })
      audioStreamRef.current = stream
      setMicPermissionState('granted')

      const { mimeType, extension } = getSupportedAudioMimeType()
      const options: MediaRecorderOptions = mimeType ? { mimeType } : {}

      let recorder: MediaRecorder
      try {
        recorder = new MediaRecorder(stream, options)
      } catch {
        recorder = new MediaRecorder(stream)
      }

      mediaRecorderRef.current = recorder
      audioChunksRef.current = []

      // Also start SpeechRecognition in parallel if available (real-time dictation)
      if (hasBrowserSpeechRecognition) {
        const recognition = startBrowserSpeechRecognition((recognizedText) => {
          setTranscribedText(recognizedText)
        })
        speechRecognitionRef.current = recognition
        setSpeechRecognitionActive(!!recognition)
      }

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      recorder.onstop = () => {
        // Stop browser SpeechRecognition if active
        if (speechRecognitionRef.current) {
          try {
            speechRecognitionRef.current.stop()
          } catch {
            // ignore
          }
          speechRecognitionRef.current = null
          setSpeechRecognitionActive(false)
        }

        // Release mic tracks
        stream.getTracks().forEach((track) => track.stop())
        audioStreamRef.current = null

        const duration = (Date.now() - recordingStartTimeRef.current) / 1000
        const blobType = recorder.mimeType || mimeType || 'audio/mp4'
        const audioBlob = new Blob(audioChunksRef.current, { type: blobType })

        // Check if recording is empty or too short (< 0.5s or empty blob)
        if (audioBlob.size < 500 || duration < 0.5) {
          toast.warning('Gravação muito curta ou vazia. Por favor, segure ou fale por mais tempo.')
          return
        }

        lastRecordedBlobRef.current = { blob: audioBlob, ext: extension }
        processAudioBlob(audioBlob, extension)
      }

      recordingStartTimeRef.current = Date.now()
      recorder.start(500) // collect chunks every 500ms
      setIsRecording(true)
      setRecordingSeconds(0)

      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current)
      }
      timerIntervalRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1)
      }, 1000)

      toast.info('Gravando áudio... Clique no botão vermelho quando terminar de falar.')
    } catch (err: any) {
      console.error('Falha ao iniciar gravação de áudio:', err)
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setMicPermissionState('denied')
        toast.error(
          'Permissão de microfone negada. Clique em "Permitir microfone" ou nas configurações do navegador.',
        )
      } else {
        toast.error(`Falha ao acessar o microfone: ${err.message || 'verifique as permissões.'}`)
      }
      setIsRecording(false)
    }
  }

  // Stop real MediaRecorder & SpeechRecognition
  const stopRecording = () => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current)
      timerIntervalRef.current = null
    }

    if (speechRecognitionRef.current) {
      try {
        speechRecognitionRef.current.stop()
      } catch {
        // ignore
      }
      speechRecognitionRef.current = null
      setSpeechRecognitionActive(false)
    }

    setIsRecording(false)

    try {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop()
      }
    } catch (err) {
      console.warn('Erro ao parar MediaRecorder:', err)
    }
  }

  // Toggle main recording
  const toggleRecording = () => {
    if (isRecording) {
      stopRecording()
    } else {
      startRecording()
    }
  }

  // Dictate Observations with server-side STT & native fallback
  const toggleNotesRecording = async () => {
    if (isRecordingNotes) {
      // Stop notes recording
      setIsRecordingNotes(false)
      try {
        if (notesMediaRecorderRef.current && notesMediaRecorderRef.current.state !== 'inactive') {
          notesMediaRecorderRef.current.stop()
        }
      } catch (err) {
        console.warn('Erro ao parar gravação de notas:', err)
      }
    } else {
      // Start notes recording
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        toast.error('Navegador sem suporte à captura de áudio.')
        return
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        notesAudioStreamRef.current = stream

        const { mimeType, extension } = getSupportedAudioMimeType()
        const options: MediaRecorderOptions = mimeType ? { mimeType } : {}

        let recorder: MediaRecorder
        try {
          recorder = new MediaRecorder(stream, options)
        } catch {
          recorder = new MediaRecorder(stream)
        }

        notesMediaRecorderRef.current = recorder
        notesAudioChunksRef.current = []

        let browserNotesText = ''
        let notesRecognition: any = null
        if (hasBrowserSpeechRecognition) {
          notesRecognition = startBrowserSpeechRecognition((recognizedText) => {
            browserNotesText = recognizedText
          })
        }

        recorder.ondataavailable = (event) => {
          if (event.data && event.data.size > 0) {
            notesAudioChunksRef.current.push(event.data)
          }
        }

        recorder.onstop = async () => {
          if (notesRecognition) {
            try {
              notesRecognition.stop()
            } catch {
              // ignore
            }
          }
          stream.getTracks().forEach((track) => track.stop())
          notesAudioStreamRef.current = null

          const blobType = recorder.mimeType || mimeType || 'audio/mp4'
          const audioBlob = new Blob(notesAudioChunksRef.current, { type: blobType })

          if (audioBlob.size < 500 && !browserNotesText) {
            toast.warning('Gravação de observação muito curta.')
            return
          }

          setIsTranscribingNotes(true)
          try {
            const res = await productService.transcribeAudio(
              audioBlob,
              `obs_${Date.now()}.${extension}`,
            )
            const text = (res.text || '').trim() || browserNotesText.trim()
            if (text) {
              setObservations((prev) => (prev ? `${prev} | ${text}` : text))
              toast.success('Observação transcrita e adicionada!')
            }
          } catch (err: any) {
            console.error('Erro ao transcrever observação:', err)
            if (browserNotesText.trim()) {
              setObservations((prev) =>
                prev ? `${prev} | ${browserNotesText.trim()}` : browserNotesText.trim(),
              )
              toast.success('Observação transcrita pelo navegador e adicionada!')
            } else {
              toast.error(
                'Erro ao transcrever observação: ' + (err?.data?.error || err?.message || 'falha'),
              )
            }
          } finally {
            setIsTranscribingNotes(false)
          }
        }

        recorder.start(500)
        setIsRecordingNotes(true)
        toast.info('Gravando observação... Clique novamente para finalizar.')
      } catch (err: any) {
        console.error('Falha ao iniciar gravação de notas:', err)
        toast.error('Não foi possível acessar o microfone para a observação.')
        setIsRecordingNotes(false)
      }
    }
  }

  // Atualização do Estoque Inicial no cadastro: sugere 30% como mínimo e sincroniza o estoque atual se este estiver vazio ou igual ao anterior
  const handleInitialQuantityChange = (newInitQtyStr: string) => {
    setInitialQuantity(newInitQtyStr)
    const numInit = parseInt(newInitQtyStr, 10)
    if (!isNaN(numInit) && numInit >= 0) {
      // Sugere 30% de alerta de estoque mínimo (mínimo 1 unidade se > 0)
      const thirtyPercent = numInit > 0 ? Math.max(1, Math.round(numInit * 0.3)) : 0
      setMinimumQuantity(thirtyPercent > 0 ? thirtyPercent.toString() : '')
    } else {
      setMinimumQuantity('')
    }
    // Se a quantidade atual ainda não foi preenchida ou era vazia, reflete o valor inicial
    if (!quantity || quantity === initialQuantity) {
      setQuantity(newInitQtyStr)
    }
  }

  // Handle quantity changes: estoque atual / disponível
  const handleQuantityChange = (newQtyStr: string) => {
    setQuantity(newQtyStr)
    if (!initialQuantity) {
      setInitialQuantity(newQtyStr)
      const num = parseInt(newQtyStr, 10)
      if (!isNaN(num) && num > 0) {
        const thirtyPercent = Math.max(1, Math.round(num * 0.3))
        setMinimumQuantity(thirtyPercent.toString())
      }
    }
  }

  // Apply data returned from Guided Voice Modal
  const handleApplyGuidedData = (guidedData: GuidedProductData) => {
    // 1. Description
    if (guidedData.description) {
      setDescription(guidedData.description)
    }

    // 2. Auxiliaries
    if (guidedData.typeId) {
      setSelectedType(guidedData.typeId)
    } else if (guidedData.typeName) {
      const matchT = types.find((t) => t.name.toLowerCase() === guidedData.typeName.toLowerCase())
      if (matchT) setSelectedType(matchT.id)
    }

    if (guidedData.materialId) {
      setSelectedMaterial(guidedData.materialId)
    } else if (guidedData.materialName) {
      const matchM = materials.find(
        (m) => m.name.toLowerCase() === guidedData.materialName.toLowerCase(),
      )
      if (matchM) setSelectedMaterial(matchM.id)
    }

    if (guidedData.sizeId) {
      setSelectedSize(guidedData.sizeId)
    } else if (guidedData.sizeName) {
      const matchS = sizes.find((s) => s.name.toLowerCase() === guidedData.sizeName.toLowerCase())
      if (matchS) setSelectedSize(matchS.id)
    }

    // 3. Target Audience
    if (guidedData.targetAudience) {
      setTargetAudience(guidedData.targetAudience)
    }

    // 4. Financials
    if (guidedData.investedValue) {
      const norm = normalizeCurrencyValue(guidedData.investedValue)
      setInvestedValue(norm !== null ? norm.toFixed(2) : '')
    }

    if (guidedData.sellingPrice) {
      const norm = normalizeCurrencyValue(guidedData.sellingPrice)
      setSellingPrice(norm !== null ? norm.toFixed(2) : '')
    }

    // 5. Quantity & min stock
    if (guidedData.quantity) {
      setInitialQuantity(guidedData.quantity)
      setQuantity(guidedData.quantity)
      if (guidedData.minimumQuantity) {
        setMinimumQuantity(guidedData.minimumQuantity)
      } else {
        const num = parseInt(guidedData.quantity, 10)
        if (!isNaN(num) && num > 0) {
          const thirtyPercent = Math.max(1, Math.round(num * 0.3))
          setMinimumQuantity(thirtyPercent.toString())
        }
      }
    }

    // 6. Observations
    if (guidedData.observations) {
      setObservations((prev) =>
        prev ? `${prev} | ${guidedData.observations}` : guidedData.observations,
      )
    }

    // 7. Scroll and focus form for review
    setTimeout(() => {
      formReviewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      descriptionInputRef.current?.focus()
    }, 150)
  }

  // Format seconds to mm:ss
  const formatTimer = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60)
    const secs = totalSeconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  // Helper to sanitize description: remove repeated material, type, size and audience if present
  const sanitizeDescription = (
    desc: string,
    materialName?: string,
    typeName?: string,
    sizeName?: string,
    audience?: string,
  ) => {
    if (!desc) return ''
    let cleaned = desc

    // 1. Remove material references (ex: "Ouro branco com ...", "Ouro Branco 18k", "em ouro branco", etc.)
    const matTerms: string[] = []
    if (materialName) {
      matTerms.push(materialName)
      matTerms.push(materialName.replace(/\s*18k\b/gi, '').trim())
    }
    matTerms.push(
      'ouro branco',
      'ouro amarelo',
      'ouro rose',
      'ouro rosê',
      'ouro 18k',
      'ouro',
      'prata 925',
      'prata',
      'folheado a ouro',
      'folheado',
      'aço cirúrgico',
      'aço',
    )

    for (const term of matTerms) {
      if (!term || term.length < 3) continue
      const esc = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      // Se a descrição começar com o material (ex.: "Ouro branco com ...", "Ouro branco de ...", etc.)
      cleaned = cleaned.replace(
        new RegExp(
          `^(?:peça\\s+)?(?:em\\s+|de\\s+)?${esc}(?:\\s+(?:com|de|em|e|para)\\s+|[,;:\\-—\\s]+)*`,
          'gi',
        ),
        '',
      )
      // Se contiver a menção ao material em qualquer lugar
      cleaned = cleaned.replace(
        new RegExp(`(?:\\s*(?:,|\\be\\b|com|em|de)\\s+)?\\b${esc}\\b`, 'gi'),
        '',
      )
    }

    // 2. Remove type references (ex: "brinco", "anel", etc.)
    const typeTerms: string[] = []
    if (typeName) typeTerms.push(typeName)
    typeTerms.push(
      'brinco',
      'anel',
      'colar',
      'pulseira',
      'pingente',
      'gargantilha',
      'choker',
      'joia',
      'peça',
    )
    for (const term of typeTerms) {
      if (!term || term.length < 3) continue
      const esc = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      cleaned = cleaned.replace(
        new RegExp(`^${esc}(?:\\s+(?:com|de|em|e)\\s+|[,;:\\-—\\s]+)*`, 'gi'),
        '',
      )
      cleaned = cleaned.replace(
        new RegExp(`(?:\\s*(?:,|\\be\\b|com|em|de)\\s+)?\\b${esc}\\b`, 'gi'),
        '',
      )
    }

    // 3. Remove audience references
    if (audience) {
      const audRegex = new RegExp(`\\b(${audience}|feminino|masculino|unissex)\\b`, 'gi')
      cleaned = cleaned.replace(audRegex, '')
    } else {
      cleaned = cleaned.replace(/\b(feminino|masculino|unissex)\b/gi, '')
    }

    // 4. Remove size references if size was detected
    if (sizeName) {
      const esc = sizeName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const sizeRegex = new RegExp(`\\b(tamanho\\s+)?${esc}\\b`, 'gi')
      cleaned = cleaned.replace(sizeRegex, '')
    }
    // Also remove generic "tamanho único" or "tamanho 20"
    cleaned = cleaned.replace(/\btamanho\s+(único|unico|\d+)\b/gi, '')

    // 5. Clean up dangling prepositions, commas, dots, extra spaces
    cleaned = cleaned
      .replace(/,\s*,/g, ',')
      .replace(/,\s*\./g, '.')
      .replace(/\s+/g, ' ')
      .replace(/^\s*(?:com|de|em|e|para|—|-|,|\.)\s+/i, '')
      .replace(/\s*[,.\-—]\s*$/, '')
      .trim()

    return cleaned || desc
  }

  // Handler para aplicar dados retornados pelo Cad IA (3º formato)
  const handleApplyCadIaData = (guidedData: CadIaProductData) => {
    if (guidedData.typeName) {
      const foundType = types.find((t) => t.id === guidedData.typeId)
      if (foundType) setSelectedType(foundType.id)
      else if (guidedData.typeId) setSelectedType(guidedData.typeId)
    }

    if (guidedData.materialName) {
      const foundMat = materials.find((m) => m.id === guidedData.materialId)
      if (foundMat) setSelectedMaterial(foundMat.id)
      else if (guidedData.materialId) setSelectedMaterial(guidedData.materialId)
    }

    if (guidedData.targetAudience) {
      setTargetAudience(guidedData.targetAudience)
    }

    if (guidedData.sizeName) {
      const foundSize = sizes.find((s) => s.id === guidedData.sizeId)
      if (foundSize) setSelectedSize(foundSize.id)
      else if (guidedData.sizeId) setSelectedSize(guidedData.sizeId)
    }

    if (guidedData.description) {
      setDescription(guidedData.description)
    }

    if (guidedData.investedValue) {
      const normInv = normalizeCurrencyValue(guidedData.investedValue)
      setInvestedValue(normInv !== null ? normInv.toFixed(2) : '')
    }

    if (guidedData.sellingPrice) {
      const normSell = normalizeCurrencyValue(guidedData.sellingPrice)
      setSellingPrice(normSell !== null ? normSell.toFixed(2) : '')
    }

    if (guidedData.quantity) {
      setInitialQuantity(guidedData.quantity)
      setQuantity(guidedData.quantity)
      if (guidedData.minimumQuantity) {
        setMinimumQuantity(guidedData.minimumQuantity)
      } else {
        const numQty = parseInt(guidedData.quantity, 10)
        if (!isNaN(numQty) && numQty > 0) {
          const thirty = Math.max(1, Math.round(numQty * 0.3))
          setMinimumQuantity(thirty.toString())
        }
      }
    }

    if (guidedData.observations) {
      setObservations((prev) =>
        prev ? `${prev} | ${guidedData.observations}` : guidedData.observations,
      )
    }

    setTranscribedText(
      `${guidedData.description} • ${guidedData.materialName} • ${guidedData.typeName}`,
    )

    // Scroll e foco no formulário para revisão final do usuário
    setTimeout(() => {
      formReviewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      descriptionInputRef.current?.focus()
    }, 120)
  }

  // Process text with Skip AI Gateway (fast model)
  const handleProcessWithAi = async () => {
    if (isRecording) {
      stopRecording()
    }

    const textToAnalyze = transcribedText.trim()

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
        result.material_name,
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
        const normInv = normalizeCurrencyValue(result.invested_value)
        setInvestedValue(normInv !== null ? normInv.toFixed(2) : '')
      }
      if (typeof result.selling_price === 'number') {
        const normSell = normalizeCurrencyValue(result.selling_price)
        setSellingPrice(normSell !== null ? normSell.toFixed(2) : '')
      }
      if (typeof result.quantity === 'number') {
        setInitialQuantity(result.quantity.toString())
        setQuantity(result.quantity.toString())
        // Padrão de 30% do estoque inicial (mínimo 1 unidade), liberado para edição
        const thirtyPercent = Math.max(1, Math.round(result.quantity * 0.3))
        setMinimumQuantity(thirtyPercent.toString())
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

  // Clear form with confirmation
  const handleClearForm = () => {
    if (window.confirm('Deseja limpar todos os campos preenchidos?')) {
      if (isRecording) {
        stopRecording()
      }
      setTranscribedText('')
      setTranscriptionError(null)
      setRecordingSeconds(0)
      generateSuggestedCode()
      setDescription('')
      setSelectedType('')
      setSelectedMaterial('')
      setSelectedSize('')
      setTargetAudience('')
      setInvestedValue('')
      setSellingPrice('')
      setInitialQuantity('')
      setQuantity('')
      setPublishEcommerce(true)
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

    // Validations (O código é gerado de forma atômica no servidor ao salvar)
    if (!description.trim()) {
      toast.error('A descrição do produto é obrigatória.')
      return
    }
    const normSellingPrice = normalizeCurrencyValue(sellingPrice)
    if (normSellingPrice === null || normSellingPrice <= 0) {
      toast.error('Informe um preço de venda válido maior que zero.')
      return
    }
    const normInvestedValue = normalizeCurrencyValue(investedValue)

    const numQuantity = parseInt(quantity, 10)
    if (isNaN(numQuantity) || numQuantity < 0) {
      toast.error('Informe um estoque atual válido.')
      return
    }

    const numInitialQuantity = parseInt(initialQuantity || quantity, 10)
    if (isNaN(numInitialQuantity) || numInitialQuantity < 0) {
      toast.error('Informe um estoque inicial válido.')
      return
    }

    setIsSaving(true)
    try {
      const formData = new FormData()
      // O código sequencial é gerado automaticamente no servidor.
      // Não enviamos o campo 'code' vazio para não violar regras de schema ou unicidade de strings vazias.
      formData.append('description', description.trim())
      if (selectedType) formData.append('type', selectedType)
      if (selectedMaterial) formData.append('material', selectedMaterial)
      if (selectedSize) formData.append('size', selectedSize)
      if (targetAudience) formData.append('target_audience', targetAudience)
      if (normInvestedValue !== null)
        formData.append('invested_value', normInvestedValue.toFixed(2))
      formData.append('selling_price', normSellingPrice.toFixed(2))
      formData.append('qtde_inicial', numInitialQuantity.toString())
      formData.append('quantity', numQuantity.toString())
      // qtde_loja_virtual é apenas o interruptor de publicação (1 = publicado)
      formData.append('qtde_loja_virtual', publishEcommerce ? '1' : '0')
      formData.append('publicar_no_ecommerce', publishEcommerce ? 'true' : 'false')
      if (minimumQuantity) {
        const numMin = parseInt(minimumQuantity, 10)
        if (!isNaN(numMin) && numMin >= 0) {
          formData.append('minimum_quantity', numMin.toString())
        }
      }
      if (observations) formData.append('observations', observations.trim())
      formData.append('status', numQuantity > 0 ? 'available' : 'unavailable')

      photos.forEach((file) => {
        formData.append('photos', file)
      })

      const created = await productService.createProduct(formData)
      toast.success(`Joia "${created.description}" cadastrada com sucesso!`)

      // Reset and reload recent
      setTranscribedText('')
      setTranscriptionError(null)
      generateSuggestedCode()
      setDescription('')
      setSelectedType('')
      setSelectedMaterial('')
      setSelectedSize('')
      setTargetAudience('')
      setInvestedValue('')
      setSellingPrice('')
      setInitialQuantity('')
      setQuantity('')
      setVirtualStoreQuantity('0')
      setVirtualStoreQtyError(null)
      setMinimumQuantity('')
      setObservations('')
      setPhotos([])
      setPhotoPreviews([])
      setMissingFields([])

      loadRecentProducts()
    } catch (err: any) {
      console.error('Erro ao salvar produto:', err)
      // Formatação clara de erros do PocketBase por campo
      let message = ''
      const fieldData = err?.response?.data || err?.data?.data || err?.data
      if (fieldData && typeof fieldData === 'object') {
        const fieldErrors: string[] = []
        for (const [key, val] of Object.entries(fieldData)) {
          if (val && typeof val === 'object' && 'message' in (val as any)) {
            fieldErrors.push(`${key}: ${(val as any).message}`)
          } else if (typeof val === 'string') {
            fieldErrors.push(`${key}: ${val}`)
          }
        }
        if (fieldErrors.length > 0) {
          message = fieldErrors.join(' | ')
        }
      }
      if (!message) {
        message = err?.message || 'Falha ao salvar produto.'
      }
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
            Grave o áudio descrevendo a joia com precisão. O áudio é gravado de forma estável e
            transcrito no servidor com Inteligência Artificial, funcionando perfeitamente no Android
            e iOS (Safari).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Botão Baixar CSV Modelo */}
          <a
            href="/modelo-importacao-produtos.csv"
            download="modelo-importacao-produtos.csv"
            className="inline-flex items-center"
          >
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="border-[#C6A664] text-[#7A5C2E] hover:bg-[#F3EAD8] font-medium"
              title="Baixar planilha CSV modelo para importação de joias"
            >
              <FileSpreadsheet className="h-4 w-4 mr-1.5 text-[#2E7D4F]" />
              Baixar CSV Modelo
            </Button>
          </a>

          {/* Permission Button - only shown when permission is not granted */}
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

          {micPermissionState === 'granted' && (
            <div className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#2E7D4F]/10 border border-[#2E7D4F]/30 text-[#2E7D4F] text-xs font-medium">
              <ShieldCheck className="h-3.5 w-3.5" /> Microfone liberado
            </div>
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

      {/* STT Configuration Notice if missing server key */}
      {isSttConfigured === false && (
        <div className="p-4 rounded-xl bg-[#B26A00]/10 border border-[#B26A00]/30 text-sm text-[#B26A00] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <Key className="h-5 w-5 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Transcrição de áudio por IA aguardando configuração</p>
              <p className="text-xs text-[#2D2A26] mt-0.5">
                Para ativar a transcrição automática no servidor, verifique a variável de ambiente{' '}
                <code className="font-mono bg-white/70 px-1 py-0.5 rounded border border-[#B26A00]/30">
                  SKIP_AI_GATEWAY_API_KEY
                </code>{' '}
                no Skip Cloud. Enquanto isso, você pode digitar ou colar a descrição no campo abaixo
                e usar normalmente o botão "Preencher Formulário com IA".
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Voice Assistant Anchor Section (Mobile-First Hero) */}
      <Card className="border-[#E5DFD5] bg-gradient-to-br from-[#FFFFFF] via-[#FDFBF7] to-[#F3EAD8]/40 shadow-md">
        <CardHeader className="text-center pb-2">
          <Badge
            variant="outline"
            className="w-fit mx-auto border-[#C6A664] text-[#7A5C2E] bg-[#C6A664]/10 font-medium tracking-wide mb-2"
          >
            <Sparkles className="h-3 w-3 mr-1" /> Gravação Direta + Transcrição no Servidor
          </Badge>
          <CardTitle className="font-serif text-xl md:text-2xl text-[#2D2A26]">
            Descreva a joia gravando seu áudio
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
          {/* Triple Action Recording Zone: Gravação Livre + Cadastro Guiado + Cad IA (3º Formato) */}
          <div className="flex flex-col items-center justify-center py-4 space-y-4">
            <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6">
              {/* Botão 1: Gravação Livre existente (MediaRecorder real) */}
              <div className="flex flex-col items-center">
                <button
                  type="button"
                  onClick={toggleRecording}
                  disabled={isTranscribing}
                  aria-label={isRecording ? 'Parar gravação' : 'Iniciar gravação livre'}
                  title={isRecording ? 'Parar gravação' : 'Gravação livre contínua'}
                  className={`relative h-24 w-24 md:h-28 md:w-28 rounded-full flex items-center justify-center text-white transition-all duration-300 shadow-xl cursor-pointer ${
                    isRecording
                      ? 'bg-[#B3261E] ring-8 ring-[#B3261E]/30 scale-105 animate-pulse'
                      : isTranscribing
                        ? 'bg-[#8C8275] cursor-not-allowed opacity-80'
                        : 'bg-gradient-to-tr from-[#7A5C2E] via-[#C6A664] to-[#E8D5A3] hover:scale-105 hover:shadow-2xl'
                  }`}
                >
                  {isTranscribing ? (
                    <Loader2 className="h-10 w-10 md:h-12 md:w-12 animate-spin" />
                  ) : isRecording ? (
                    <MicOff className="h-10 w-10 md:h-12 md:w-12" />
                  ) : (
                    <Mic className="h-10 w-10 md:h-12 md:w-12" />
                  )}
                </button>
                <span className="text-xs font-semibold text-[#2D2A26] mt-2">Gravação Livre</span>
              </div>

              {/* Botão 2: Cadastro Guiado campo por campo (existente) */}
              <div className="flex flex-col items-center">
                <button
                  type="button"
                  onClick={() => {
                    // Se a gravação livre estiver rodando, para antes de abrir o modal guiado
                    if (isRecording) {
                      stopRecording()
                    }
                    setGuidedModalOpen(true)
                  }}
                  disabled={isTranscribing}
                  aria-label="Abrir cadastro guiado campo por campo"
                  title="Abrir assistente guiado campo por campo"
                  className="relative h-24 w-24 md:h-28 md:w-28 rounded-full flex flex-col items-center justify-center text-[#2D2A26] bg-gradient-to-tr from-[#FDFBF7] via-[#FFFFFF] to-[#F3EAD8] border-2 border-[#C6A664] hover:border-[#7A5C2E] hover:bg-[#F3EAD8]/60 transition-all duration-300 shadow-xl cursor-pointer hover:scale-105 hover:shadow-2xl group"
                >
                  <div className="p-2.5 rounded-full bg-[#C6A664]/15 text-[#7A5C2E] group-hover:bg-[#C6A664]/25 transition-colors">
                    <ListOrdered className="h-7 w-7 md:h-8 md:w-8" />
                  </div>
                  <span className="text-[10px] font-bold text-[#7A5C2E] uppercase tracking-wider mt-1">
                    Passo a Passo
                  </span>
                </button>
                <span className="text-xs font-semibold text-[#7A5C2E] mt-2 flex items-center gap-1">
                  <Sparkles className="h-3 w-3 text-[#C6A664]" /> Cadastro Guiado
                </span>
              </div>

              {/* Botão 3: Cad IA (NOVO - 3º Formato solicitado pelo usuário) */}
              <div className="flex flex-col items-center">
                <button
                  type="button"
                  onClick={() => {
                    if (isRecording) {
                      stopRecording()
                    }
                    setCadIaModalOpen(true)
                  }}
                  disabled={isTranscribing}
                  aria-label="Abrir Cad IA (3º formato de cadastro por voz)"
                  title="Cad IA: fale tudo de uma vez com interpretação inteligente no servidor"
                  className="relative h-24 w-24 md:h-28 md:w-28 rounded-full flex flex-col items-center justify-center text-white bg-gradient-to-tr from-[#1D1B18] via-[#2D2A26] to-[#7A5C2E] border-2 border-[#C6A664] hover:border-[#E8D5A3] transition-all duration-300 shadow-xl cursor-pointer hover:scale-105 hover:shadow-2xl group ring-2 ring-[#C6A664]/30"
                >
                  <div className="p-2.5 rounded-full bg-[#C6A664]/20 text-[#E8D5A3] group-hover:bg-[#C6A664]/35 transition-colors">
                    <Bot className="h-7 w-7 md:h-8 md:w-8" />
                  </div>
                  <span className="text-[10px] font-bold text-[#E8D5A3] uppercase tracking-wider mt-1">
                    IA Servidor
                  </span>
                </button>
                <span className="text-xs font-semibold text-[#2D2A26] mt-2 flex items-center gap-1">
                  <Sparkles className="h-3 w-3 text-[#C6A664]" /> Cad IA
                  <Badge
                    variant="outline"
                    className="border-[#C6A664]/60 text-[#7A5C2E] text-[9px] px-1 py-0 ml-0.5"
                  >
                    Novo
                  </Badge>
                </span>
              </div>
            </div>

            {/* Status indicators for continuous recording */}
            {isRecording ? (
              <div className="mt-1 flex flex-col items-center gap-1">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#B3261E]/10 border border-[#B3261E]/30 text-[#B3261E] text-xs font-semibold">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#B3261E] opacity-75" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#B3261E]" />
                  </span>
                  <span>
                    GRAVANDO ÁUDIO ({formatTimer(recordingSeconds)})
                    {speechRecognitionActive && ' • DITADO ATIVO'}
                  </span>
                </div>
                <p className="text-xs text-[#6B655E] mt-1 font-medium">
                  Fale a descrição da joia. Clique no botão vermelho quando terminar para concluir.
                </p>
              </div>
            ) : isTranscribing ? (
              <div className="mt-1 flex flex-col items-center gap-1">
                <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#C6A664]/20 border border-[#C6A664]/50 text-[#7A5C2E] text-xs font-semibold">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>TRANSCREVENDO NO SERVIDOR POR IA...</span>
                </div>
                <p className="text-xs text-[#6B655E] mt-0.5">
                  Processando o áudio completo. Aguarde alguns instantes.
                </p>
              </div>
            ) : (
              <div className="text-center space-y-1">
                <p className="text-xs sm:text-sm font-semibold text-[#2D2A26]">
                  Escolha como prefere cadastrar (3 formatos disponíveis):
                </p>
                <p className="text-xs text-[#6B655E] max-w-xl mx-auto">
                  <strong>Gravação Livre:</strong> fala direta com botão de preenchimento.{' '}
                  <span className="hidden sm:inline">|</span> <strong>Cadastro Guiado:</strong>{' '}
                  assistente interativo pergunta campo a campo.{' '}
                  <span className="hidden sm:inline">|</span> <strong>Cad IA:</strong> fala tudo em
                  uma única captura com interpretação semântica profunda e revisão antes de salvar.
                </p>
              </div>
            )}

            {/* Transcription notice / error box */}
            {transcriptionError && !isTranscribing && (
              <div
                className={`mt-3 max-w-lg w-full p-3 rounded-xl border text-xs flex items-center justify-between gap-3 ${
                  transcriptionError.type === 'info'
                    ? 'bg-[#C6A664]/10 border-[#C6A664]/40 text-[#7A5C2E]'
                    : 'bg-[#B3261E]/10 border-[#B3261E]/30 text-[#B3261E]'
                }`}
              >
                <div className="flex items-start gap-2">
                  {transcriptionError.type === 'info' ? (
                    <HelpCircle className="h-4 w-4 shrink-0 mt-0.5 text-[#C6A664]" />
                  ) : (
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  )}
                  <span className="leading-relaxed">{transcriptionError.message}</span>
                </div>
                {lastRecordedBlobRef.current && transcriptionError.type === 'error' && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={handleRetryTranscription}
                    className="h-7 text-xs border-[#B3261E]/40 text-[#B3261E] hover:bg-[#B3261E]/10 shrink-0"
                  >
                    <RefreshCw className="h-3 w-3 mr-1" /> Tentar de novo
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* Editable Transcription Area */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold text-[#6B655E] uppercase tracking-wider flex items-center gap-1.5">
                <Volume2 className="h-3.5 w-3.5 text-[#C6A664]" /> Texto transcrito da fala
                (Editável)
              </Label>
              {transcribedText && (
                <span className="text-xs text-[#7A5C2E] font-medium">
                  {transcribedText.split(' ').filter(Boolean).length} palavras
                </span>
              )}
            </div>

            <Textarea
              value={transcribedText}
              onChange={(e) => setTranscribedText(e.target.value)}
              placeholder="O texto transcrito pelo servidor aparecerá aqui após a gravação. Você também pode digitar ou corrigir o texto antes de enviar para a IA..."
              rows={3}
              disabled={isTranscribing}
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
              disabled={isAiProcessing || isTranscribing || !transcribedText.trim()}
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
              {/* Código Automático do Produto (compacto / informativo) */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-[#FDFBF7] border border-[#E5DFD5]">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-[#C6A664] shrink-0" />
                  <span className="text-xs font-semibold text-[#2D2A26]">Código do Produto:</span>
                  <span className="font-mono font-bold text-xs text-[#7A5C2E]">
                    {code ? `${code} (automático)` : 'Gerado automaticamente ao salvar'}
                  </span>
                </div>
                <span className="text-[10px] text-[#8C8275] hidden sm:inline">
                  Sequencial único oficial
                </span>
              </div>

              {/* Ordem solicitada: Tipo, Material, Perfil, Tamanho */}
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

              {/* Descrição da Joia */}
              <div>
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

              {/* Ordem: Valor Investido (R$), Preço de Venda (R$), Quantidade em Estoque */}
              <div className="grid grid-cols-1 sm:grid-cols-3 md:grid-cols-4 gap-4 p-4 rounded-xl bg-[#FDFBF7] border border-[#E5DFD5]">
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
                  <div className="flex items-center justify-between">
                    <Label htmlFor="initQty" className="text-xs font-semibold text-[#2D2A26]">
                      Estoque Inicial *
                    </Label>
                    <span className="text-[10px] text-[#7A5C2E] font-medium">Entrada</span>
                  </div>
                  <Input
                    id="initQty"
                    type="number"
                    min="0"
                    step="1"
                    value={initialQuantity}
                    onChange={(e) => handleInitialQuantityChange(e.target.value)}
                    placeholder="1"
                    required
                    className="mt-1 bg-white border-[#C6A664]/60 focus-visible:ring-[#C6A664] font-semibold text-[#2D2A26]"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="qty" className="text-xs font-semibold text-[#2D2A26]">
                      Estoque Atual *
                    </Label>
                    <span className="text-[10px] text-[#6B655E]">Disponível</span>
                  </div>
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
                    <Label htmlFor="publishEcom" className="text-xs font-semibold text-[#2D2A26]">
                      Publicar no E-commerce
                    </Label>
                    <span
                      className={`text-[10px] font-semibold ${
                        publishEcommerce ? 'text-[#2E7D4F]' : 'text-[#6B655E]'
                      }`}
                    >
                      {publishEcommerce ? 'Ativado' : 'Desativado'}
                    </span>
                  </div>
                  <button
                    type="button"
                    id="publishEcom"
                    onClick={() => setPublishEcommerce((v) => !v)}
                    className={`mt-1 w-full inline-flex items-center justify-between px-3 py-2 rounded-md border text-xs font-semibold transition-colors ${
                      publishEcommerce
                        ? 'border-[#2E7D4F] bg-[#2E7D4F]/10 text-[#2E7D4F]'
                        : 'border-[#E5DFD5] bg-white text-[#6B655E]'
                    }`}
                    title="Publica ou retira esta peça da loja virtual (não altera o estoque)"
                  >
                    <span>{publishEcommerce ? 'Publicado no e-commerce' : 'Não publicado'}</span>
                    <span
                      className={`inline-flex h-4 w-8 rounded-full p-0.5 transition-colors ${
                        publishEcommerce ? 'bg-[#2E7D4F]' : 'bg-[#E5DFD5]'
                      }`}
                    >
                      <span
                        className={`h-3 w-3 rounded-full bg-white shadow-sm transition-transform ${
                          publishEcommerce ? 'translate-x-4' : ''
                        }`}
                      />
                    </span>
                  </button>
                </div>

                <div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="minQty" className="text-xs font-semibold text-[#6B655E]">
                      Alerta Estoque Mínimo
                    </Label>
                    <span className="text-[10px] text-[#7A5C2E] font-medium">(30% inicial)</span>
                  </div>
                  <Input
                    id="minQty"
                    type="number"
                    min="0"
                    step="1"
                    value={minimumQuantity}
                    onChange={(e) => setMinimumQuantity(e.target.value)}
                    placeholder="30% do inicial"
                    className="mt-1 bg-white border-[#E5DFD5] focus-visible:ring-[#C6A664]"
                  />
                </div>
              </div>

              {/* Row 4: Observations with Server-side Audio Dictate button */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <Label htmlFor="obs" className="text-xs font-semibold text-[#2D2A26]">
                    Observações e Detalhes
                  </Label>
                  <button
                    type="button"
                    onClick={toggleNotesRecording}
                    disabled={isTranscribingNotes}
                    className={`text-xs flex items-center gap-1 font-medium transition-colors ${
                      isRecordingNotes
                        ? 'text-[#B3261E] animate-pulse font-bold'
                        : isTranscribingNotes
                          ? 'text-[#C6A664]'
                          : 'text-[#7A5C2E] hover:underline'
                    }`}
                  >
                    {isTranscribingNotes ? (
                      <>
                        <Loader2 className="h-3 w-3 animate-spin" /> Transcrevendo observação...
                      </>
                    ) : isRecordingNotes ? (
                      <>
                        <MicOff className="h-3 w-3" /> Parar gravação de observação
                      </>
                    ) : (
                      <>
                        <Mic className="h-3 w-3" /> Gravar observação por voz
                      </>
                    )}
                  </button>
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

      {/* Recently Added Products List */}
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
                    const photo = getProductDisplayPhoto(p)
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

      {/* Modal de Cadastro Guiado por Voz */}
      <VoiceGuidedModal
        open={guidedModalOpen}
        onOpenChange={setGuidedModalOpen}
        types={types}
        materials={materials}
        sizes={sizes}
        onApplyToForm={handleApplyGuidedData}
        onAuxiliaryCreated={() => {
          // Atualiza lista do formulário pai em background para ficar disponível nos selects
          loadAuxiliaries()
        }}
      />

      {/* Modal Cad IA: 3º Formato de Cadastro por Voz (fala completa + interpretação no servidor) */}
      <VoiceCadIaModal
        open={cadIaModalOpen}
        onOpenChange={setCadIaModalOpen}
        types={types}
        materials={materials}
        sizes={sizes}
        onApplyToForm={handleApplyCadIaData}
        onAuxiliaryCreated={() => {
          loadAuxiliaries()
        }}
      />
    </div>
  )
}
