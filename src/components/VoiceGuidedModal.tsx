import React, { useState, useEffect, useRef, useCallback } from 'react'
import { ProductType, ProductMaterial, ProductSize } from '@/types'
import {
  matchAuxiliaryItem,
  parseTargetAudience,
  parseQuantityText,
  parseCurrencySpeech,
  cleanSpokenDescription,
} from '@/lib/guidedVoiceParser'
import { normalizeCurrencyValue, formatCurrency } from '@/lib/formatters'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Mic,
  MicOff,
  ArrowRight,
  ArrowLeft,
  SkipForward,
  Check,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  RotateCcw,
  Sparkles,
  ShieldAlert,
  Loader2,
  Volume2,
  Pencil,
  FileCheck,
  Plus,
  X,
  XCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import pb from '@/lib/pocketbase/client'

export interface GuidedProductData {
  typeId: string
  typeName: string
  materialId: string
  materialName: string
  targetAudience: 'feminino' | 'masculino' | 'unissex' | ''
  sizeId: string
  sizeName: string
  description: string
  investedValue: string
  sellingPrice: string
  quantity: string
  minimumQuantity: string
  observations: string
}

interface VoiceGuidedModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  types: ProductType[]
  materials: ProductMaterial[]
  sizes: ProductSize[]
  onApplyToForm: (data: GuidedProductData) => void
  onAuxiliaryCreated?: (
    collection: 'product_types' | 'product_materials' | 'product_sizes',
    item: { id: string; name: string },
  ) => void
}

type StepKey =
  | 'type'
  | 'material'
  | 'audience'
  | 'size'
  | 'description'
  | 'invested'
  | 'selling'
  | 'quantity'
  | 'observations'
  | 'review'

interface StepConfig {
  key: StepKey
  title: string
  question: string
  hint: string
  example: string
  required: boolean
}

const STEPS: StepConfig[] = [
  {
    key: 'type',
    title: 'Tipo da Joia',
    question: 'Qual é o tipo da joia?',
    hint: 'Diga o tipo da peça: brinco, anel, colar, pulseira, pingente, gargantilha...',
    example: 'Ex: "Brinco", "Anel solitário", "Colar"',
    required: true,
  },
  {
    key: 'material',
    title: 'Material',
    question: 'Qual é o material?',
    hint: 'Diga o material principal da peça.',
    example: 'Ex: "Ouro branco 18k", "Ouro 18k", "Prata 925", "Folheado a ouro", "Aço cirúrgico"',
    required: true,
  },
  {
    key: 'audience',
    title: 'Perfil',
    question: 'Qual é o perfil da joia?',
    hint: 'Diga se a peça é feminina, masculina ou unissex.',
    example: 'Ex: "Feminino", "Masculino" ou "Unissex"',
    required: false,
  },
  {
    key: 'size',
    title: 'Tamanho',
    question: 'Qual é o tamanho?',
    hint: 'Diga o aro (14 a 22), comprimento (45cm, 50cm, 60cm), P, M, G ou Único.',
    example: 'Ex: "Aro 18", "Tamanho único", "45 centímetros", "Médio"',
    required: false,
  },
  {
    key: 'description',
    title: 'Descrição dos Detalhes',
    question: 'Como você descreve os detalhes da joia?',
    hint: 'Diga apenas as características da peça (pedras, cravação, formato, acabamento), sem repetir tipo, material, perfil ou tamanho.',
    example:
      'Ex: "Com zircônia redonda central e acabamento polido", "Pingente em formato de coração"',
    required: true,
  },
  {
    key: 'invested',
    title: 'Valor Investido',
    question: 'Qual foi o valor investido?',
    hint: 'Diga quanto você pagou ou investiu na peça (opcional).',
    example: 'Ex: "Vinte reais", "51 e 95", "120"',
    required: false,
  },
  {
    key: 'selling',
    title: 'Preço de Venda',
    question: 'Qual é o preço de venda?',
    hint: 'Diga o preço final para o cliente.',
    example: 'Ex: "Sessenta reais", "138 e 42", "250"',
    required: true,
  },
  {
    key: 'quantity',
    title: 'Quantidade',
    question: 'Quantas unidades?',
    hint: 'Diga quantas peças você comprou ou tem no estoque.',
    example: 'Ex: "Uma unidade", "5 peças", "10"',
    required: true,
  },
  {
    key: 'observations',
    title: 'Observações',
    question: 'Alguma observação adicional?',
    hint: 'Garantia, fornecedor, cuidados ou detalhes extras (opcional).',
    example: 'Ex: "Banho 10 milésimos, garantia de 1 ano"',
    required: false,
  },
]

export function VoiceGuidedModal({
  open,
  onOpenChange,
  types,
  materials,
  sizes,
  onApplyToForm,
  onAuxiliaryCreated,
}: VoiceGuidedModalProps) {
  // Local lists to reflect immediately newly added items
  const [localTypes, setLocalTypes] = useState<ProductType[]>(types)
  const [localMaterials, setLocalMaterials] = useState<ProductMaterial[]>(materials)
  const [localSizes, setLocalSizes] = useState<ProductSize[]>(sizes)

  // Keep synced if parent props change
  useEffect(() => {
    setLocalTypes(types)
  }, [types])
  useEffect(() => {
    setLocalMaterials(materials)
  }, [materials])
  useEffect(() => {
    setLocalSizes(sizes)
  }, [sizes])

  // Navigation
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(0)
  const isReview = currentStepIndex >= STEPS.length
  const currentStep = !isReview ? STEPS[currentStepIndex] : null

  // Guided Data State
  const [data, setData] = useState<GuidedProductData>({
    typeId: '',
    typeName: '',
    materialId: '',
    materialName: '',
    targetAudience: '',
    sizeId: '',
    sizeName: '',
    description: '',
    investedValue: '',
    sellingPrice: '',
    quantity: '',
    minimumQuantity: '',
    observations: '',
  })

  // Speech Recognition state
  const [isListening, setIsListening] = useState(false)
  const [liveTranscript, setLiveTranscript] = useState('')
  const [micError, setMicError] = useState<string | null>(null)
  const [stepError, setStepError] = useState<string | null>(null)
  const [ambiguousCandidates, setAmbiguousCandidates] = useState<
    Array<{ id: string; name: string }>
  >([])

  // State when no match was found: lets user pick from existing list or add new item
  const [unmatchedState, setUnmatchedState] = useState<{
    key: 'type' | 'material' | 'size'
    spokenTerm: string
  } | null>(null)
  const [isCreatingAuxiliary, setIsCreatingAuxiliary] = useState(false)

  // Feedback visual de pré-seleção identificado automaticamente
  const [preSelectionFeedback, setPreSelectionFeedback] = useState<{
    label: string
    value: string
  } | null>(null)

  // Mensagem breve de auto-limpeza (ex: "Não entendi. Fale de novo…")
  const [clearingNotice, setClearingNotice] = useState<string | null>(null)

  // Manual editing inline for current step
  const [manualInput, setManualInput] = useState('')
  // Rastreador se o usuário está digitando ativamente no input
  const isManuallyTypingRef = useRef<boolean>(false)

  // Refs
  const recognitionRef = useRef<any>(null)
  const activeStreamRef = useRef<MediaStream | null>(null)
  const restartTimerRef = useRef<any>(null)
  const autoClearTimerRef = useRef<any>(null)
  const currentStepIndexRef = useRef(currentStepIndex)
  currentStepIndexRef.current = currentStepIndex

  // Keep a ref to latest state/data
  const dataRef = useRef(data)
  dataRef.current = data
  const localTypesRef = useRef(localTypes)
  localTypesRef.current = localTypes
  const localMaterialsRef = useRef(localMaterials)
  localMaterialsRef.current = localMaterials
  const localSizesRef = useRef(localSizes)
  localSizesRef.current = localSizes

  // Keep a ref to latest live transcript to avoid stale closures
  const liveTranscriptRef = useRef(liveTranscript)
  liveTranscriptRef.current = liveTranscript

  // Check if browser has SpeechRecognition
  const getSpeechRecClass = () => {
    if (typeof window === 'undefined') return null
    return (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null
  }

  // Stop listening cleanly
  const stopListening = useCallback(() => {
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current)
      restartTimerRef.current = null
    }

    if (recognitionRef.current) {
      try {
        recognitionRef.current.onresult = null
        recognitionRef.current.onerror = null
        recognitionRef.current.onend = null
        recognitionRef.current.stop()
      } catch {
        // ignore
      }
      recognitionRef.current = null
    }

    if (activeStreamRef.current) {
      try {
        activeStreamRef.current.getTracks().forEach((t) => t.stop())
      } catch {
        // ignore
      }
      activeStreamRef.current = null
    }

    setIsListening(false)
  }, [])

  // Start speech recognition for the current step
  const startListening = useCallback(async () => {
    stopListening()
    setMicError(null)

    const SpeechRec = getSpeechRecClass()
    if (!SpeechRec) {
      setMicError(
        'Seu navegador não suporta reconhecimento de voz direto. Você pode digitar no campo abaixo.',
      )
      return
    }

    // Request getUserMedia first to ensure permission is active and stream kept alive
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        activeStreamRef.current = stream
      }
    } catch (err: any) {
      console.warn('Microphone permission check failed:', err)
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setMicError(
          'Permissão de microfone negada. Clique no cadeado da barra de endereço para permitir o microfone.',
        )
        return
      }
    }

    try {
      const recognition = new SpeechRec()
      recognition.lang = 'pt-BR'
      recognition.continuous = true
      recognition.interimResults = true
      recognition.maxAlternatives = 1

      let accumulated = ''

      recognition.onresult = (event: any) => {
        let currentTranscript = ''
        let hasFinalResult = false
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const t = event.results[i][0].transcript
          if (event.results[i].isFinal) {
            accumulated += (accumulated ? ' ' : '') + t
            hasFinalResult = true
          } else {
            currentTranscript += t
          }
        }
        const full = (accumulated + ' ' + currentTranscript).trim()
        if (full) {
          setLiveTranscript(full)
          if (!isManuallyTypingRef.current) {
            setManualInput(full)
          }

          // Quando uma frase final for reconhecida (ou conforme a fala avança),
          // roda o processamento de pré-seleção / detecção para listas
          if (hasFinalResult || full.length > 2) {
            processSpokenInput(full)
          }
        }
      }

      recognition.onerror = (event: any) => {
        console.warn('Guided SpeechRecognition error:', event.error)
        if (event.error === 'not-allowed') {
          setMicError(
            'Microfone bloqueado. Permita o acesso ao microfone no navegador para continuar.',
          )
          stopListening()
        } else if (event.error === 'network') {
          setMicError('Falha de conexão com o serviço de voz. Digite abaixo se preferir.')
        }
      }

      recognition.onend = () => {
        // Se a modal ainda estiver aberta e em uma etapa de pergunta, reinicia automaticamente
        if (open && currentStepIndexRef.current < STEPS.length) {
          restartTimerRef.current = setTimeout(() => {
            try {
              if (recognitionRef.current) {
                recognition.start()
              }
            } catch {
              // ignore
            }
          }, 300)
        } else {
          setIsListening(false)
        }
      }

      recognition.start()
      recognitionRef.current = recognition
      setIsListening(true)
    } catch (err: any) {
      console.warn('Guided SpeechRecognition start failed:', err)
      setMicError('Não foi possível iniciar o microfone. Use a digitação manual.')
      setIsListening(false)
    }
  }, [open, stopListening])

  // Sync state when step changes
  useEffect(() => {
    if (!open) {
      stopListening()
      clearAutoClearTimer()
      return
    }

    clearAutoClearTimer()
    // Limpa transcrição temporária, feedback e erro da etapa ao mudar de pergunta
    setLiveTranscript('')
    setStepError(null)
    setAmbiguousCandidates([])
    setUnmatchedState(null)
    setPreSelectionFeedback(null)
    setClearingNotice(null)
    isManuallyTypingRef.current = false

    if (!isReview) {
      // Pré-preenche o input manual com o valor já salvo caso esteja voltando
      const currentK = STEPS[currentStepIndex].key
      let initialVal = ''
      if (currentK === 'type') initialVal = data.typeName
      else if (currentK === 'material') initialVal = data.materialName
      else if (currentK === 'audience') initialVal = data.targetAudience
      else if (currentK === 'size') initialVal = data.sizeName
      else if (currentK === 'description') initialVal = data.description
      else if (currentK === 'invested') initialVal = data.investedValue
      else if (currentK === 'selling') initialVal = data.sellingPrice
      else if (currentK === 'quantity') initialVal = data.quantity
      else if (currentK === 'observations') initialVal = data.observations

      setManualInput(initialVal)

      // Inicia a gravação imediatamente para a nova pergunta
      startListening()
    } else {
      stopListening()
    }

    return () => {
      // cleanup on step change
    }
  }, [currentStepIndex, open, isReview, startListening, stopListening])

  // When modal is reopened, reset to step 0 and start
  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      stopListening()
      clearAutoClearTimer()
    }
    onOpenChange(nextOpen)
  }

  // Restart modal completely
  const handleRestart = () => {
    clearAutoClearTimer()
    setCurrentStepIndex(0)
    setData({
      typeId: '',
      typeName: '',
      materialId: '',
      materialName: '',
      targetAudience: '',
      sizeId: '',
      sizeName: '',
      description: '',
      investedValue: '',
      sellingPrice: '',
      quantity: '',
      minimumQuantity: '',
      observations: '',
    })
    setLiveTranscript('')
    setManualInput('')
    setStepError(null)
    setAmbiguousCandidates([])
    setUnmatchedState(null)
    setPreSelectionFeedback(null)
    setClearingNotice(null)
    isManuallyTypingRef.current = false
  }

  // Create new auxiliary item in PocketBase and register on the fly
  const handleCreateNewAuxiliary = async (
    collection: 'product_types' | 'product_materials' | 'product_sizes',
    name: string,
  ) => {
    const trimmed = name.trim()
    if (!trimmed) return

    setIsCreatingAuxiliary(true)
    try {
      const created = await pb.collection(collection).create<{ id: string; name: string }>({
        name: trimmed,
      })

      if (collection === 'product_types') {
        setLocalTypes((prev) =>
          [...prev, created as ProductType].sort((a, b) => a.name.localeCompare(b.name)),
        )
        setData((prev) => ({
          ...prev,
          typeId: created.id,
          typeName: created.name,
        }))
        toast.success(`Tipo "${created.name}" cadastrado e selecionado!`)
      } else if (collection === 'product_materials') {
        setLocalMaterials((prev) =>
          [...prev, created as ProductMaterial].sort((a, b) => a.name.localeCompare(b.name)),
        )
        setData((prev) => ({
          ...prev,
          materialId: created.id,
          materialName: created.name,
        }))
        toast.success(`Material "${created.name}" cadastrado e selecionado!`)
      } else if (collection === 'product_sizes') {
        setLocalSizes((prev) =>
          [...prev, created as ProductSize].sort((a, b) => a.name.localeCompare(b.name)),
        )
        setData((prev) => ({
          ...prev,
          sizeId: created.id,
          sizeName: created.name,
        }))
        toast.success(`Tamanho "${created.name}" cadastrado e selecionado!`)
      }

      if (onAuxiliaryCreated) {
        onAuxiliaryCreated(collection, created)
      }

      setUnmatchedState(null)
      setCurrentStepIndex((prev) => prev + 1)
    } catch (err: any) {
      console.error('Erro ao criar item auxiliar:', err)
      // Se já existe com mesmo nome (índice único)
      const errDetail = err?.data?.data?.name?.message || err?.message || ''
      if (errDetail.includes('unique') || errDetail.includes('exist')) {
        toast.info(`"${trimmed}" já existe no cadastro. Selecionando...`)
        // Tenta achar na lista
        let existing: { id: string; name: string } | undefined
        if (collection === 'product_types')
          existing = localTypes.find((t) => t.name.toLowerCase() === trimmed.toLowerCase())
        if (collection === 'product_materials')
          existing = localMaterials.find((m) => m.name.toLowerCase() === trimmed.toLowerCase())
        if (collection === 'product_sizes')
          existing = localSizes.find((s) => s.name.toLowerCase() === trimmed.toLowerCase())

        if (existing) {
          if (collection === 'product_types')
            setData((prev) => ({ ...prev, typeId: existing!.id, typeName: existing!.name }))
          if (collection === 'product_materials')
            setData((prev) => ({ ...prev, materialId: existing!.id, materialName: existing!.name }))
          if (collection === 'product_sizes')
            setData((prev) => ({ ...prev, sizeId: existing!.id, sizeName: existing!.name }))
          setUnmatchedState(null)
          setCurrentStepIndex((prev) => prev + 1)
          return
        }
      }
      toast.error(`Não foi possível salvar "${trimmed}": ${err.message || 'tente novamente.'}`)
    } finally {
      setIsCreatingAuxiliary(false)
    }
  }

  // Limpar timer de auto-limpeza ativo
  const clearAutoClearTimer = useCallback(() => {
    if (autoClearTimerRef.current) {
      clearTimeout(autoClearTimerRef.current)
      autoClearTimerRef.current = null
    }
  }, [])

  // Limpa resposta da etapa atual (e a transcrição), para gravação e volta a aguardar fala (Botão "Cancelar")
  const handleCancelCurrentStep = useCallback(() => {
    clearAutoClearTimer()
    setLiveTranscript('')
    setManualInput('')
    setStepError(null)
    setAmbiguousCandidates([])
    setUnmatchedState(null)
    setPreSelectionFeedback(null)
    setClearingNotice(null)
    isManuallyTypingRef.current = false

    if (!currentStep) return

    // Limpa a resposta selecionada desta etapa no objeto data
    const k = currentStep.key
    setData((prev) => {
      const next = { ...prev }
      if (k === 'type') {
        next.typeId = ''
        next.typeName = ''
      } else if (k === 'material') {
        next.materialId = ''
        next.materialName = ''
      } else if (k === 'audience') {
        next.targetAudience = ''
      } else if (k === 'size') {
        next.sizeId = ''
        next.sizeName = ''
      } else if (k === 'description') {
        next.description = ''
      } else if (k === 'invested') {
        next.investedValue = ''
      } else if (k === 'selling') {
        next.sellingPrice = ''
      } else if (k === 'quantity') {
        next.quantity = ''
      } else if (k === 'observations') {
        next.observations = ''
      }
      return next
    })

    // Para a gravação da etapa e volta a aguardar a fala para essa mesma pergunta
    stopListening()
    setTimeout(() => {
      startListening()
    }, 150)
  }, [clearAutoClearTimer, currentStep, startListening, stopListening])

  // Avalia o texto transcrito em tempo real para auto-seleção ou agendamento de auto-limpeza
  const processSpokenInput = useCallback(
    (spokenText: string) => {
      if (!currentStep) return
      const trimmed = spokenText.trim()
      if (!trimmed) return

      // Não processar se o usuário estiver digitando manualmente no input
      if (isManuallyTypingRef.current) return

      const key = currentStep.key
      clearAutoClearTimer()

      // Apenas para as etapas com lista de opções fechada (Tipo, Material, Perfil, Tamanho)
      const isListStep =
        key === 'type' || key === 'material' || key === 'audience' || key === 'size'

      if (key === 'type') {
        const match = matchAuxiliaryItem(trimmed, localTypesRef.current, { category: 'type' })
        if (match.matched) {
          setData((prev) => ({
            ...prev,
            typeId: match.matched!.id,
            typeName: match.matched!.name,
          }))
          setPreSelectionFeedback({
            label: 'Tipo',
            value: match.matched.name,
          })
          setStepError(null)
          setAmbiguousCandidates([])
          setUnmatchedState(null)
          setClearingNotice(null)
        } else if (match.ambiguous) {
          setAmbiguousCandidates(match.candidates)
          setPreSelectionFeedback(null)
          setUnmatchedState(null)
          setClearingNotice(null)
          setStepError(
            `Encontrei mais de uma opção para "${trimmed}". Clique na opção desejada abaixo:`,
          )
        } else {
          // Sem match e sem sugestão por similaridade
          setPreSelectionFeedback(null)
          // Se o usuário não está interagindo com a lista nem selecionou nada:
          // Agenda limpeza automática em 2.5s com aviso amigável
          setClearingNotice('Não entendi. Fale de novo…')
          autoClearTimerRef.current = setTimeout(() => {
            // Verifica se o usuário não começou a digitar ou selecionou algo
            if (!isManuallyTypingRef.current && !dataRef.current.typeId) {
              setLiveTranscript('')
              setManualInput('')
              setClearingNotice(null)
              setStepError(null)
            } else {
              setClearingNotice(null)
            }
          }, 2500)
        }
      } else if (key === 'material') {
        const match = matchAuxiliaryItem(trimmed, localMaterialsRef.current, {
          category: 'material',
        })
        if (match.matched) {
          setData((prev) => ({
            ...prev,
            materialId: match.matched!.id,
            materialName: match.matched!.name,
          }))
          setPreSelectionFeedback({
            label: 'Material',
            value: match.matched.name,
          })
          setStepError(null)
          setAmbiguousCandidates([])
          setUnmatchedState(null)
          setClearingNotice(null)
        } else if (match.ambiguous) {
          setAmbiguousCandidates(match.candidates)
          setPreSelectionFeedback(null)
          setUnmatchedState(null)
          setClearingNotice(null)
          setStepError(
            `Encontrei mais de uma opção para "${trimmed}". Clique na opção desejada abaixo:`,
          )
        } else {
          setPreSelectionFeedback(null)
          setClearingNotice('Não entendi. Fale de novo…')
          autoClearTimerRef.current = setTimeout(() => {
            if (!isManuallyTypingRef.current && !dataRef.current.materialId) {
              setLiveTranscript('')
              setManualInput('')
              setClearingNotice(null)
              setStepError(null)
            } else {
              setClearingNotice(null)
            }
          }, 2500)
        }
      } else if (key === 'audience') {
        const parsed = parseTargetAudience(trimmed)
        if (parsed.recognized) {
          const audienceLabels: Record<string, string> = {
            feminino: 'Feminino',
            masculino: 'Masculino',
            unissex: 'Unissex',
          }
          setData((prev) => ({
            ...prev,
            targetAudience: parsed.value,
          }))
          setPreSelectionFeedback({
            label: 'Perfil',
            value: audienceLabels[parsed.value] || parsed.value,
          })
          setStepError(null)
          setAmbiguousCandidates([])
          setClearingNotice(null)
        } else {
          setPreSelectionFeedback(null)
          setClearingNotice('Não entendi. Fale de novo…')
          autoClearTimerRef.current = setTimeout(() => {
            if (!isManuallyTypingRef.current && !dataRef.current.targetAudience) {
              setLiveTranscript('')
              setManualInput('')
              setClearingNotice(null)
            } else {
              setClearingNotice(null)
            }
          }, 2500)
        }
      } else if (key === 'size') {
        const match = matchAuxiliaryItem(trimmed, localSizesRef.current, { category: 'size' })
        if (match.matched) {
          setData((prev) => ({
            ...prev,
            sizeId: match.matched!.id,
            sizeName: match.matched!.name,
          }))
          setPreSelectionFeedback({
            label: 'Tamanho',
            value: match.matched.name,
          })
          setStepError(null)
          setAmbiguousCandidates([])
          setUnmatchedState(null)
          setClearingNotice(null)
        } else if (match.ambiguous) {
          setAmbiguousCandidates(match.candidates)
          setPreSelectionFeedback(null)
          setUnmatchedState(null)
          setClearingNotice(null)
          setStepError(`Mais de um tamanho encontrado para "${trimmed}". Selecione uma opção:`)
        } else {
          setPreSelectionFeedback(null)
          setClearingNotice('Não entendi. Fale de novo…')
          autoClearTimerRef.current = setTimeout(() => {
            if (!isManuallyTypingRef.current && !dataRef.current.sizeId) {
              setLiveTranscript('')
              setManualInput('')
              setClearingNotice(null)
              setStepError(null)
            } else {
              setClearingNotice(null)
            }
          }, 2500)
        }
      } else {
        // NÃO vale para etapas de texto livre (descrição, observações, valores)
        setClearingNotice(null)
      }
    },
    [currentStep, clearAutoClearTimer],
  )

  // Confirm current step answer
  const handleConfirmStep = (forcedText?: string) => {
    if (!currentStep) return
    clearAutoClearTimer()

    const raw = (forcedText !== undefined ? forcedText : manualInput || liveTranscript).trim()
    setStepError(null)
    setAmbiguousCandidates([])
    setUnmatchedState(null)
    setClearingNotice(null)

    const { key, required } = currentStep

    // Validação de obrigatoriedade
    if (required && !raw) {
      setStepError('Este campo é obrigatório. Por favor, fale no microfone ou digite uma resposta.')
      return
    }

    // Se estiver vazio e não for obrigatório, avança
    if (!raw && !required) {
      setCurrentStepIndex((prev) => prev + 1)
      return
    }

    // Processamento específico por tipo de pergunta
    switch (key) {
      case 'type': {
        const match = matchAuxiliaryItem(raw, localTypes, { category: 'type' })
        if (match.matched) {
          setData((prev) => ({
            ...prev,
            typeId: match.matched!.id,
            typeName: match.matched!.name,
          }))
          toast.success(`Tipo identificado: ${match.matched.name}`)
          setCurrentStepIndex((prev) => prev + 1)
        } else if (match.ambiguous) {
          setAmbiguousCandidates(match.candidates)
          setStepError(
            `Encontrei mais de uma opção para "${raw}". Clique na opção desejada abaixo:`,
          )
        } else {
          // Sem match próximo no banco: exibe candidatos da lista e botão para adicionar novo
          setUnmatchedState({ key: 'type', spokenTerm: raw })
          setStepError(
            `Nenhum tipo cadastrado corresponde a "${raw}". Escolha uma opção existente ou adicione "${raw}" ao cadastro geral.`,
          )
        }
        break
      }

      case 'material': {
        const match = matchAuxiliaryItem(raw, localMaterials, { category: 'material' })
        if (match.matched) {
          setData((prev) => ({
            ...prev,
            materialId: match.matched!.id,
            materialName: match.matched!.name,
          }))
          toast.success(`Material identificado: ${match.matched.name}`)
          setCurrentStepIndex((prev) => prev + 1)
        } else if (match.ambiguous) {
          setAmbiguousCandidates(match.candidates)
          setStepError(
            `Encontrei mais de uma opção para "${raw}". Clique na opção desejada abaixo:`,
          )
        } else {
          setUnmatchedState({ key: 'material', spokenTerm: raw })
          setStepError(
            `Nenhum material cadastrado corresponde a "${raw}". Escolha uma opção existente ou adicione "${raw}" ao cadastro geral.`,
          )
        }
        break
      }

      case 'audience': {
        const parsed = parseTargetAudience(raw)
        if (parsed.recognized) {
          setData((prev) => ({
            ...prev,
            targetAudience: parsed.value,
          }))
          toast.success(`Perfil definido: ${parsed.value}`)
          setCurrentStepIndex((prev) => prev + 1)
        } else {
          // Deixa em aberto para escolher entre os 3 botões fixos
          setStepError('Perfil não identificado com clareza. Selecione uma das opções abaixo:')
        }
        break
      }

      case 'size': {
        const match = matchAuxiliaryItem(raw, localSizes, { category: 'size' })
        if (match.matched) {
          setData((prev) => ({
            ...prev,
            sizeId: match.matched!.id,
            sizeName: match.matched!.name,
          }))
          toast.success(`Tamanho identificado: ${match.matched.name}`)
          setCurrentStepIndex((prev) => prev + 1)
        } else if (match.ambiguous) {
          setAmbiguousCandidates(match.candidates)
          setStepError(`Mais de um tamanho encontrado para "${raw}". Selecione uma opção:`)
        } else {
          setUnmatchedState({ key: 'size', spokenTerm: raw })
          setStepError(
            `Nenhum tamanho cadastrado corresponde a "${raw}". Escolha uma opção existente ou adicione "${raw}" como novo tamanho na lista geral.`,
          )
        }
        break
      }

      case 'description': {
        // Limpa termos repetidos de tipo, material, perfil e tamanho
        const cleaned = cleanSpokenDescription(
          raw,
          data.typeName,
          data.materialName,
          data.targetAudience,
          data.sizeName,
        )
        if (!cleaned && required) {
          setStepError('A descrição não pode ficar vazia. Diga os detalhes ou digite abaixo.')
          return
        }
        setData((prev) => ({
          ...prev,
          description: cleaned || raw,
        }))
        toast.success('Descrição registrada!')
        setCurrentStepIndex((prev) => prev + 1)
        break
      }

      case 'invested': {
        const parsed = parseCurrencySpeech(raw)
        if (parsed.recognized && parsed.value !== null) {
          setData((prev) => ({
            ...prev,
            investedValue: parsed.formattedString,
          }))
          toast.success(`Valor investido: ${formatCurrency(parsed.value)}`)
          setCurrentStepIndex((prev) => prev + 1)
        } else {
          const directVal = normalizeCurrencyValue(raw)
          if (directVal !== null && directVal >= 0) {
            setData((prev) => ({
              ...prev,
              investedValue: directVal.toFixed(2),
            }))
            setCurrentStepIndex((prev) => prev + 1)
          } else {
            setStepError(
              'Não consegui entender o valor investido. Fale o número novamente ou digite.',
            )
          }
        }
        break
      }

      case 'selling': {
        const parsed = parseCurrencySpeech(raw)
        if (parsed.recognized && parsed.value !== null && parsed.value > 0) {
          setData((prev) => ({
            ...prev,
            sellingPrice: parsed.formattedString,
          }))
          toast.success(`Preço de venda: ${formatCurrency(parsed.value)}`)
          setCurrentStepIndex((prev) => prev + 1)
        } else {
          const directVal = normalizeCurrencyValue(raw)
          if (directVal !== null && directVal > 0) {
            setData((prev) => ({
              ...prev,
              sellingPrice: directVal.toFixed(2),
            }))
            setCurrentStepIndex((prev) => prev + 1)
          } else {
            setStepError(
              'Preço de venda obrigatório. Fale um valor válido (ex: "60 reais" ou "138 e 40").',
            )
          }
        }
        break
      }

      case 'quantity': {
        const parsed = parseQuantityText(raw)
        if (parsed.recognized && parsed.value !== null && parsed.value >= 0) {
          const qty = parsed.value
          const thirtyPercent = Math.max(1, Math.round(qty * 0.3))
          setData((prev) => ({
            ...prev,
            quantity: qty.toString(),
            minimumQuantity: thirtyPercent.toString(),
          }))
          toast.success(`Quantidade: ${qty} unidade(s)`)
          setCurrentStepIndex((prev) => prev + 1)
        } else {
          setStepError(
            'Quantidade não compreendida. Fale o número de peças (ex: "1 unidade", "10").',
          )
        }
        break
      }

      case 'observations': {
        setData((prev) => ({
          ...prev,
          observations: raw,
        }))
        setCurrentStepIndex((prev) => prev + 1)
        break
      }
    }
  }

  // Skip optional step
  const handleSkipStep = () => {
    if (currentStep && currentStep.required) {
      setStepError('Este campo é obrigatório e não pode ser pulado.')
      return
    }
    setStepError(null)
    setAmbiguousCandidates([])
    setUnmatchedState(null)
    setCurrentStepIndex((prev) => prev + 1)
  }

  // Go to previous step
  const handlePrevStep = () => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex((prev) => prev - 1)
    }
  }

  // Handle keyboard shortcuts (Enter to confirm)
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleConfirmStep()
    }
  }

  // Apply final reviewed data to parent form
  const handleFinishAndApply = () => {
    // Validação final de campos mínimos
    if (!data.description.trim()) {
      toast.error('A descrição da joia é obrigatória na revisão.')
      return
    }
    const normSelling = normalizeCurrencyValue(data.sellingPrice)
    if (normSelling === null || normSelling <= 0) {
      toast.error('Informe um preço de venda válido maior que zero.')
      return
    }
    const numQty = parseInt(data.quantity, 10)
    if (isNaN(numQty) || numQty < 0) {
      toast.error('Informe uma quantidade válida.')
      return
    }

    stopListening()
    onApplyToForm(data)
    toast.success('Formulário preenchido com sucesso! Revise e clique em Salvar Joia.')
    onOpenChange(false)
  }

  // Render answered summary items for side navigation
  const answeredSummary = [
    { label: 'Tipo', val: data.typeName, stepIdx: 0, required: true },
    { label: 'Material', val: data.materialName, stepIdx: 1, required: true },
    {
      label: 'Perfil',
      val:
        data.targetAudience === 'feminino'
          ? 'Feminino'
          : data.targetAudience === 'masculino'
            ? 'Masculino'
            : data.targetAudience === 'unissex'
              ? 'Unissex'
              : '',
      stepIdx: 2,
      required: false,
    },
    { label: 'Tamanho', val: data.sizeName, stepIdx: 3, required: false },
    { label: 'Descrição', val: data.description, stepIdx: 4, required: true },
    {
      label: 'Investido',
      val: data.investedValue ? formatCurrency(parseFloat(data.investedValue)) : '',
      stepIdx: 5,
      required: false,
    },
    {
      label: 'Preço Venda',
      val: data.sellingPrice ? formatCurrency(parseFloat(data.sellingPrice)) : '',
      stepIdx: 6,
      required: true,
    },
    {
      label: 'Quantidade',
      val: data.quantity ? `${data.quantity} un.` : '',
      stepIdx: 7,
      required: true,
    },
    { label: 'Observações', val: data.observations, stepIdx: 8, required: false },
  ]

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        style={{ height: 'min(760px, 94vh)' }}
        className="max-w-2xl w-[95vw] h-[min(760px,94vh)] flex flex-col p-0 overflow-hidden bg-[#FDFBF7] border-[#C6A664]/40 shadow-2xl"
      >
        {/* Header nobre Scaglioni */}
        <DialogHeader className="px-6 py-4 bg-gradient-to-r from-[#2D2A26] via-[#3D3730] to-[#2D2A26] text-white border-b border-[#C6A664]/30 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-[#C6A664]/20 text-[#E8D5A3]">
                <Sparkles className="h-5 w-5" />
              </span>
              <div>
                <DialogTitle className="font-serif text-lg md:text-xl font-bold text-[#F3EAD8] tracking-wide">
                  Cadastro de Joia Guiado por Voz
                </DialogTitle>
                <DialogDescription className="text-xs text-[#E8D5A3]/80">
                  Responda pergunta por pergunta. O microfone já está ligado.
                </DialogDescription>
              </div>
            </div>

            <Badge
              variant="outline"
              className="border-[#C6A664] text-[#E8D5A3] bg-[#C6A664]/10 text-xs px-2 py-0.5"
            >
              {isReview ? 'Revisão' : `Etapa ${currentStepIndex + 1} de ${STEPS.length}`}
            </Badge>
          </div>

          {/* Progress bar */}
          <div className="w-full bg-[#1D1B18] h-1.5 rounded-full mt-3 overflow-hidden">
            <div
              className="bg-gradient-to-r from-[#C6A664] to-[#E8D5A3] h-full transition-all duration-300"
              style={{
                width: `${Math.min(100, Math.round(((currentStepIndex + (isReview ? 1 : 0)) / (STEPS.length + 1)) * 100))}%`,
              }}
            />
          </div>
        </DialogHeader>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Permission warning banner if microphone error */}
          {micError && (
            <div className="p-3.5 rounded-xl bg-[#B3261E]/10 border border-[#B3261E]/30 text-xs text-[#B3261E] flex items-start gap-2.5">
              <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold">{micError}</p>
                <p className="mt-0.5 text-[#2D2A26]">
                  Você pode usar a digitação no campo de texto abaixo para responder a pergunta.
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={startListening}
                className="h-7 text-xs border-[#B3261E]/40 text-[#B3261E] hover:bg-[#B3261E]/10 shrink-0"
              >
                Tentar microfone
              </Button>
            </div>
          )}

          {/* QUESTION STEP VIEW */}
          {!isReview && currentStep && (
            <div className="space-y-6">
              {/* Question Hero Card */}
              <div className="text-center space-y-2 py-2">
                <Badge
                  variant="outline"
                  className="border-[#C6A664] text-[#7A5C2E] bg-[#C6A664]/10 text-xs uppercase tracking-wider font-semibold"
                >
                  {currentStep.title}{' '}
                  {currentStep.required ? (
                    <span className="text-[#B3261E] ml-1">*</span>
                  ) : (
                    <span className="text-[#8C8275] font-normal ml-1">(Opcional)</span>
                  )}
                </Badge>
                <h2 className="font-serif text-2xl md:text-3xl font-bold text-[#2D2A26] leading-snug">
                  {currentStep.question}
                </h2>
                <p className="text-xs md:text-sm text-[#6B655E] max-w-md mx-auto">
                  {currentStep.hint}
                </p>
                <p className="text-[11px] text-[#7A5C2E] italic font-medium">
                  {currentStep.example}
                </p>
              </div>

              {/* Pulsing Recording Indicator and Live Recognition Display */}
              <div className="flex flex-col items-center justify-center p-5 rounded-2xl bg-white border border-[#E5DFD5] shadow-sm space-y-3">
                <div className="relative">
                  <button
                    type="button"
                    onClick={isListening ? stopListening : startListening}
                    aria-label={isListening ? 'Parar gravação' : 'Ligar microfone'}
                    className={`h-16 w-16 rounded-full flex items-center justify-center text-white transition-all duration-300 shadow-md ${
                      isListening
                        ? 'bg-[#B3261E] ring-4 ring-[#B3261E]/30 scale-105 animate-pulse'
                        : 'bg-gradient-to-tr from-[#7A5C2E] via-[#C6A664] to-[#E8D5A3] hover:scale-105'
                    }`}
                  >
                    {isListening ? (
                      <Mic className="h-7 w-7 text-white" />
                    ) : (
                      <MicOff className="h-7 w-7 text-white/90" />
                    )}
                  </button>
                  {isListening && (
                    <span className="absolute -top-1 -right-1 flex h-4 w-4">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#B3261E] opacity-75" />
                      <span className="relative inline-flex rounded-full h-4 w-4 bg-[#B3261E]" />
                    </span>
                  )}
                </div>

                <div className="text-center">
                  <span className="text-xs font-semibold uppercase tracking-wider text-[#7A5C2E] flex items-center justify-center gap-1.5">
                    {isListening ? (
                      <>
                        <span className="h-2 w-2 rounded-full bg-[#B3261E] animate-ping" />
                        Ouvindo... pode falar agora
                      </>
                    ) : (
                      'Microfone pausado — clique para reativar'
                    )}
                  </span>
                  {liveTranscript && (
                    <p className="text-sm font-medium text-[#2D2A26] mt-2 px-4 py-1.5 rounded-lg bg-[#FDFBF7] border border-[#C6A664]/30 max-w-md mx-auto">
                      "{liveTranscript}"
                    </p>
                  )}

                  {/* Feedback visual de auto-limpeza em andamento */}
                  {clearingNotice && (
                    <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#B26A00]/15 text-[#B26A00] text-xs font-medium animate-pulse">
                      <RotateCcw className="h-3.5 w-3.5 shrink-0" />
                      <span>{clearingNotice}</span>
                    </div>
                  )}

                  {/* Feedback visual óbvio de pré-seleção automática */}
                  {preSelectionFeedback && (
                    <div className="mt-2.5 inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#2E7D4F]/15 border border-[#2E7D4F]/40 text-[#2E7D4F] text-xs md:text-sm font-semibold shadow-xs animate-in fade-in zoom-in duration-200">
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-[#2E7D4F]" />
                      <span>
                        Entendi: <strong>{preSelectionFeedback.value}</strong>
                      </span>
                      <span className="text-[11px] font-normal text-[#2E7D4F]/80 ml-1">
                        (pré-selecionado)
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Step Error Notice / Ambiguous Options / Unmatched State */}
              {stepError && (
                <div className="p-3.5 rounded-xl bg-[#B26A00]/10 border border-[#B26A00]/30 text-xs text-[#B26A00] space-y-3">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-[#B26A00]" />
                    <span className="font-semibold text-[#7A5C2E]">{stepError}</span>
                  </div>

                  {/* Multiple candidates buttons (Ambiguidade plausível) */}
                  {ambiguousCandidates.length > 0 && (
                    <div className="pt-1">
                      <p className="text-[11px] text-[#6B655E] mb-1.5 font-medium">
                        Toque em uma das opções sugeridas:
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {ambiguousCandidates.map((cand) => (
                          <Button
                            key={cand.id}
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              clearAutoClearTimer()
                              setClearingNotice(null)
                              setManualInput(cand.name)
                              if (currentStep.key === 'type') {
                                setData((prev) => ({
                                  ...prev,
                                  typeId: cand.id,
                                  typeName: cand.name,
                                }))
                                setPreSelectionFeedback({ label: 'Tipo', value: cand.name })
                              } else if (currentStep.key === 'material') {
                                setData((prev) => ({
                                  ...prev,
                                  materialId: cand.id,
                                  materialName: cand.name,
                                }))
                                setPreSelectionFeedback({ label: 'Material', value: cand.name })
                              } else if (currentStep.key === 'size') {
                                setData((prev) => ({
                                  ...prev,
                                  sizeId: cand.id,
                                  sizeName: cand.name,
                                }))
                                setPreSelectionFeedback({ label: 'Tamanho', value: cand.name })
                              }
                              setStepError(null)
                            }}
                            className="bg-white border-[#C6A664] text-[#7A5C2E] hover:bg-[#F3EAD8] text-xs h-8 shadow-xs"
                          >
                            <Check className="h-3 w-3 mr-1 text-[#2E7D4F]" />
                            {cand.name}
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Unmatched State: Opção de Adicionar Novo + Escolher da lista existente */}
                  {unmatchedState && (
                    <div className="pt-1 space-y-2.5 border-t border-[#B26A00]/20">
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          disabled={isCreatingAuxiliary}
                          onClick={() => {
                            const coll =
                              unmatchedState.key === 'type'
                                ? 'product_types'
                                : unmatchedState.key === 'material'
                                  ? 'product_materials'
                                  : 'product_sizes'
                            handleCreateNewAuxiliary(coll, unmatchedState.spokenTerm)
                          }}
                          className="bg-[#2E7D4F] hover:bg-[#256640] text-white font-semibold text-xs h-8 shadow-xs"
                        >
                          {isCreatingAuxiliary ? (
                            <>
                              <Loader2 className="h-3 w-3 mr-1 animate-spin" /> Adicionando...
                            </>
                          ) : (
                            <>
                              <Plus className="h-3 w-3 mr-1" /> Adicionar "
                              {unmatchedState.spokenTerm}" como novo
                            </>
                          )}
                        </Button>
                      </div>

                      <div className="pt-1">
                        <p className="text-[11px] text-[#6B655E] mb-1 font-medium">
                          Ou escolha uma das opções já existentes:
                        </p>
                        <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-1 bg-white/70 rounded-lg border border-[#E5DFD5]">
                          {(unmatchedState.key === 'type'
                            ? localTypes
                            : unmatchedState.key === 'material'
                              ? localMaterials
                              : localSizes
                          ).map((item) => (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => {
                                clearAutoClearTimer()
                                setClearingNotice(null)
                                setManualInput(item.name)
                                if (unmatchedState.key === 'type') {
                                  setData((prev) => ({
                                    ...prev,
                                    typeId: item.id,
                                    typeName: item.name,
                                  }))
                                  setPreSelectionFeedback({ label: 'Tipo', value: item.name })
                                } else if (unmatchedState.key === 'material') {
                                  setData((prev) => ({
                                    ...prev,
                                    materialId: item.id,
                                    materialName: item.name,
                                  }))
                                  setPreSelectionFeedback({ label: 'Material', value: item.name })
                                } else if (unmatchedState.key === 'size') {
                                  setData((prev) => ({
                                    ...prev,
                                    sizeId: item.id,
                                    sizeName: item.name,
                                  }))
                                  setPreSelectionFeedback({ label: 'Tamanho', value: item.name })
                                }
                                setStepError(null)
                              }}
                              className="text-xs px-2.5 py-1 rounded-full border border-[#E5DFD5] bg-white text-[#2D2A26] hover:border-[#C6A664] hover:bg-[#FDFBF7] transition-colors"
                            >
                              {item.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Direct Choice Pills for standard options (Tipo, Material, Perfil) com destaque visual da pré-seleção */}
              {currentStep.key === 'type' && localTypes.length > 0 && (
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-semibold text-[#8C8275] uppercase tracking-wider">
                    Ou selecione um tipo cadastrado:
                  </Label>
                  <div className="flex flex-wrap gap-1.5">
                    {localTypes.map((t) => {
                      const isSelected = data.typeId === t.id
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => {
                            clearAutoClearTimer()
                            setClearingNotice(null)
                            setData((prev) => ({
                              ...prev,
                              typeId: t.id,
                              typeName: t.name,
                            }))
                            setManualInput(t.name)
                            setPreSelectionFeedback({
                              label: 'Tipo',
                              value: t.name,
                            })
                            setStepError(null)
                          }}
                          className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-all duration-200 inline-flex items-center gap-1.5 ${
                            isSelected
                              ? 'bg-[#2E7D4F] text-white border-[#2E7D4F] shadow-sm ring-2 ring-[#2E7D4F]/30 scale-[1.02]'
                              : 'bg-white text-[#2D2A26] border-[#E5DFD5] hover:border-[#C6A664] hover:bg-[#FDFBF7]'
                          }`}
                        >
                          {isSelected && <Check className="h-3 w-3 text-white" />}
                          {t.name}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {currentStep.key === 'material' && localMaterials.length > 0 && (
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-semibold text-[#8C8275] uppercase tracking-wider">
                    Ou selecione um material cadastrado:
                  </Label>
                  <div className="flex flex-wrap gap-1.5">
                    {localMaterials.map((m) => {
                      const isSelected = data.materialId === m.id
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => {
                            clearAutoClearTimer()
                            setClearingNotice(null)
                            setData((prev) => ({
                              ...prev,
                              materialId: m.id,
                              materialName: m.name,
                            }))
                            setManualInput(m.name)
                            setPreSelectionFeedback({
                              label: 'Material',
                              value: m.name,
                            })
                            setStepError(null)
                          }}
                          className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-all duration-200 inline-flex items-center gap-1.5 ${
                            isSelected
                              ? 'bg-[#2E7D4F] text-white border-[#2E7D4F] shadow-sm ring-2 ring-[#2E7D4F]/30 scale-[1.02]'
                              : 'bg-white text-[#2D2A26] border-[#E5DFD5] hover:border-[#C6A664] hover:bg-[#FDFBF7]'
                          }`}
                        >
                          {isSelected && <Check className="h-3 w-3 text-white" />}
                          {m.name}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {currentStep.key === 'audience' && (
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-semibold text-[#8C8275] uppercase tracking-wider">
                    Opções de perfil:
                  </Label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { key: 'feminino', label: 'Feminino' },
                      { key: 'masculino', label: 'Masculino' },
                      { key: 'unissex', label: 'Unissex' },
                    ].map((aud) => {
                      const isSelected = data.targetAudience === aud.key
                      return (
                        <Button
                          key={aud.key}
                          type="button"
                          variant="outline"
                          onClick={() => {
                            clearAutoClearTimer()
                            setClearingNotice(null)
                            setData((prev) => ({
                              ...prev,
                              targetAudience: aud.key as any,
                            }))
                            setManualInput(aud.label)
                            setPreSelectionFeedback({
                              label: 'Perfil',
                              value: aud.label,
                            })
                            setStepError(null)
                          }}
                          className={`h-9 text-xs border font-medium transition-all duration-200 ${
                            isSelected
                              ? 'bg-[#2E7D4F] text-white border-[#2E7D4F] shadow-sm ring-2 ring-[#2E7D4F]/30 hover:bg-[#256640] hover:text-white'
                              : 'bg-white text-[#2D2A26] border-[#E5DFD5] hover:bg-[#FDFBF7]'
                          }`}
                        >
                          {isSelected && <Check className="h-3 w-3 mr-1 text-white" />}
                          {aud.label}
                        </Button>
                      )
                    })}
                  </div>
                </div>
              )}

              {currentStep.key === 'size' && localSizes.length > 0 && (
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-semibold text-[#8C8275] uppercase tracking-wider">
                    Tamanhos mais comuns:
                  </Label>
                  <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-1">
                    {localSizes.map((s) => {
                      const isSelected = data.sizeId === s.id
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => {
                            clearAutoClearTimer()
                            setClearingNotice(null)
                            setData((prev) => ({
                              ...prev,
                              sizeId: s.id,
                              sizeName: s.name,
                            }))
                            setManualInput(s.name)
                            setPreSelectionFeedback({
                              label: 'Tamanho',
                              value: s.name,
                            })
                            setStepError(null)
                          }}
                          className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-all duration-200 inline-flex items-center gap-1.5 ${
                            isSelected
                              ? 'bg-[#2E7D4F] text-white border-[#2E7D4F] shadow-sm ring-2 ring-[#2E7D4F]/30 scale-[1.02]'
                              : 'bg-white text-[#2D2A26] border-[#E5DFD5] hover:border-[#C6A664]'
                          }`}
                        >
                          {isSelected && <Check className="h-3 w-3 text-white" />}
                          {s.name}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Editable input fallback / confirmation field */}
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between">
                  <Label
                    htmlFor="guidedInput"
                    className="text-xs font-semibold text-[#6B655E] flex items-center gap-1"
                  >
                    <Pencil className="h-3 w-3 text-[#C6A664]" /> Sua resposta (fale ou digite para
                    corrigir):
                  </Label>
                  <span className="text-[10px] text-[#8C8275]">Pressione Enter para confirmar</span>
                </div>
                {currentStep.key === 'description' || currentStep.key === 'observations' ? (
                  <Textarea
                    id="guidedInput"
                    value={manualInput}
                    onFocus={() => {
                      isManuallyTypingRef.current = true
                      clearAutoClearTimer()
                      setClearingNotice(null)
                    }}
                    onChange={(e) => {
                      isManuallyTypingRef.current = true
                      clearAutoClearTimer()
                      setClearingNotice(null)
                      setManualInput(e.target.value)
                    }}
                    onBlur={() => {
                      // Usuário saiu do campo
                      setTimeout(() => {
                        isManuallyTypingRef.current = false
                      }, 400)
                    }}
                    onKeyDown={handleKeyDown}
                    placeholder="Sua fala aparecerá aqui ou digite diretamente..."
                    rows={2}
                    className="bg-white border-[#E5DFD5] focus-visible:ring-[#C6A664] text-sm"
                  />
                ) : (
                  <Input
                    id="guidedInput"
                    value={manualInput}
                    onFocus={() => {
                      isManuallyTypingRef.current = true
                      clearAutoClearTimer()
                      setClearingNotice(null)
                    }}
                    onChange={(e) => {
                      isManuallyTypingRef.current = true
                      clearAutoClearTimer()
                      setClearingNotice(null)
                      setManualInput(e.target.value)
                    }}
                    onBlur={() => {
                      setTimeout(() => {
                        isManuallyTypingRef.current = false
                      }, 400)
                    }}
                    onKeyDown={handleKeyDown}
                    placeholder="Aguardando fala ou digitação..."
                    className="bg-white border-[#E5DFD5] focus-visible:ring-[#C6A664] text-sm"
                  />
                )}
              </div>

              {/* Resumo compacto do que já foi respondido */}
              <div className="p-3 rounded-xl bg-white/70 border border-[#E5DFD5] space-y-2">
                <span className="text-[11px] font-semibold text-[#8C8275] uppercase tracking-wider block">
                  Respondidos até agora (clique para voltar):
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {answeredSummary.map(
                    (item) =>
                      item.stepIdx < currentStepIndex && (
                        <button
                          key={item.label}
                          type="button"
                          onClick={() => setCurrentStepIndex(item.stepIdx)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-[#F3EAD8] text-[#7A5C2E] border border-[#C6A664]/40 hover:bg-[#E8D5A3] transition-colors"
                          title="Clique para regravar este campo"
                        >
                          <Check className="h-3 w-3 text-[#2E7D4F]" />
                          <span>
                            <strong>{item.label}:</strong> {item.val || '—'}
                          </span>
                        </button>
                      ),
                  )}
                </div>
              </div>
            </div>
          )}

          {/* REVISÃO FINAL INLINE */}
          {isReview && (
            <div className="space-y-5">
              <div className="p-4 rounded-xl bg-[#2E7D4F]/10 border border-[#2E7D4F]/30 text-xs text-[#2E7D4F] flex items-start gap-2.5">
                <FileCheck className="h-5 w-5 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-sm">Todas as perguntas foram respondidas!</p>
                  <p className="text-[#2D2A26] mt-0.5">
                    Revise os campos abaixo. Você pode editar qualquer informação diretamente antes
                    de transferir para o formulário principal.
                  </p>
                </div>
              </div>

              <div className="space-y-4 bg-white p-5 rounded-2xl border border-[#E5DFD5] shadow-sm">
                {/* Descrição */}
                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-[#2D2A26]">
                    Descrição dos Detalhes *
                  </Label>
                  <Input
                    value={data.description}
                    onChange={(e) => setData((prev) => ({ ...prev, description: e.target.value }))}
                    placeholder="Detalhes estéticos da peça..."
                    className="border-[#E5DFD5] focus-visible:ring-[#C6A664]"
                  />
                  {!data.description.trim() && (
                    <p className="text-[11px] text-[#B3261E]">Campo obrigatório.</p>
                  )}
                </div>

                {/* Tipo e Material */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs font-semibold text-[#2D2A26]">Tipo *</Label>
                    <select
                      value={data.typeId}
                      onChange={(e) => {
                        const sel = localTypes.find((t) => t.id === e.target.value)
                        setData((prev) => ({
                          ...prev,
                          typeId: e.target.value,
                          typeName: sel ? sel.name : prev.typeName,
                        }))
                      }}
                      className="mt-1 w-full rounded-md border border-[#E5DFD5] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C6A664]"
                    >
                      <option value="">Selecione ou confirme...</option>
                      {localTypes.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                    {!data.typeId && data.typeName && (
                      <p className="text-[11px] text-[#7A5C2E] mt-0.5">
                        Ditado: "{data.typeName}" (selecione a opção equivalente acima se houver)
                      </p>
                    )}
                  </div>

                  <div>
                    <Label className="text-xs font-semibold text-[#2D2A26]">Material *</Label>
                    <select
                      value={data.materialId}
                      onChange={(e) => {
                        const sel = localMaterials.find((m) => m.id === e.target.value)
                        setData((prev) => ({
                          ...prev,
                          materialId: e.target.value,
                          materialName: sel ? sel.name : prev.materialName,
                        }))
                      }}
                      className="mt-1 w-full rounded-md border border-[#E5DFD5] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C6A664]"
                    >
                      <option value="">Selecione ou confirme...</option>
                      {localMaterials.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                    {!data.materialId && data.materialName && (
                      <p className="text-[11px] text-[#7A5C2E] mt-0.5">
                        Ditado: "{data.materialName}"
                      </p>
                    )}
                  </div>
                </div>

                {/* Perfil e Tamanho */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs font-semibold text-[#2D2A26]">Perfil</Label>
                    <select
                      value={data.targetAudience}
                      onChange={(e) =>
                        setData((prev) => ({
                          ...prev,
                          targetAudience: e.target.value as any,
                        }))
                      }
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
                      value={data.sizeId}
                      onChange={(e) => {
                        const sel = localSizes.find((s) => s.id === e.target.value)
                        setData((prev) => ({
                          ...prev,
                          sizeId: e.target.value,
                          sizeName: sel ? sel.name : prev.sizeName,
                        }))
                      }}
                      className="mt-1 w-full rounded-md border border-[#E5DFD5] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C6A664]"
                    >
                      <option value="">Selecione...</option>
                      {localSizes.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Preços e Quantidade */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3.5 rounded-xl bg-[#FDFBF7] border border-[#E5DFD5]">
                  <div>
                    <Label className="text-xs font-semibold text-[#6B655E]">
                      Valor Investido (R$)
                    </Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={data.investedValue}
                      onChange={(e) =>
                        setData((prev) => ({ ...prev, investedValue: e.target.value }))
                      }
                      placeholder="0,00"
                      className="mt-1 bg-white border-[#E5DFD5] text-sm"
                    />
                  </div>

                  <div>
                    <Label className="text-xs font-semibold text-[#2D2A26]">
                      Preço de Venda (R$) *
                    </Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={data.sellingPrice}
                      onChange={(e) =>
                        setData((prev) => ({ ...prev, sellingPrice: e.target.value }))
                      }
                      placeholder="0,00"
                      className="mt-1 bg-white border-[#C6A664] font-semibold text-[#7A5C2E] text-sm"
                    />
                  </div>

                  <div>
                    <Label className="text-xs font-semibold text-[#2D2A26]">Quantidade *</Label>
                    <Input
                      type="number"
                      min="0"
                      step="1"
                      value={data.quantity}
                      onChange={(e) => {
                        const val = e.target.value
                        const num = parseInt(val, 10)
                        const thirty =
                          !isNaN(num) && num > 0 ? Math.max(1, Math.round(num * 0.3)) : ''
                        setData((prev) => ({
                          ...prev,
                          quantity: val,
                          minimumQuantity: thirty ? thirty.toString() : prev.minimumQuantity,
                        }))
                      }}
                      placeholder="1"
                      className="mt-1 bg-white border-[#E5DFD5] font-semibold text-sm"
                    />
                  </div>
                </div>

                {/* Observações */}
                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-[#2D2A26]">Observações</Label>
                  <Textarea
                    value={data.observations}
                    onChange={(e) => setData((prev) => ({ ...prev, observations: e.target.value }))}
                    placeholder="Garantia, banho, cuidados..."
                    rows={2}
                    className="border-[#E5DFD5] text-sm"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 bg-[#F5EFE6] border-t border-[#E5DFD5] flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <div>
            {!isReview ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handlePrevStep}
                disabled={currentStepIndex === 0}
                className="text-[#6B655E] hover:text-[#2D2A26]"
              >
                <ArrowLeft className="h-4 w-4 mr-1.5" /> Voltar pergunta
              </Button>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setCurrentStepIndex(STEPS.length - 1)}
                className="text-[#6B655E] hover:text-[#2D2A26]"
              >
                <ArrowLeft className="h-4 w-4 mr-1.5" /> Voltar às perguntas
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            {!isReview && currentStep && (
              <>
                {/* Botão Cancelar solicitado pelo usuário: limpa resposta/transcrição da etapa e volta a ouvir a mesma pergunta */}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleCancelCurrentStep}
                  title="Limpar esta resposta e falar de novo"
                  className="border-[#E5DFD5] text-[#8C8275] hover:text-[#B3261E] hover:border-[#B3261E]/40 hover:bg-[#B3261E]/5 transition-colors"
                >
                  <XCircle className="h-4 w-4 mr-1 text-[#8C8275]" /> Cancelar
                </Button>

                {!currentStep.required && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleSkipStep}
                    className="border-[#E5DFD5] text-[#6B655E] hover:bg-white"
                  >
                    <SkipForward className="h-4 w-4 mr-1" /> Pular
                  </Button>
                )}

                <Button
                  type="button"
                  size="sm"
                  onClick={() => handleConfirmStep()}
                  className="bg-gradient-to-r from-[#7A5C2E] to-[#C6A664] hover:opacity-90 text-white font-semibold px-5 shadow-sm"
                >
                  Confirmar e Próximo <ArrowRight className="h-4 w-4 ml-1.5" />
                </Button>
              </>
            )}

            {isReview && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleRestart}
                  className="border-[#E5DFD5] text-[#6B655E] hover:bg-white"
                >
                  <RotateCcw className="h-4 w-4 mr-1.5" /> Recomeçar
                </Button>

                <Button
                  type="button"
                  size="sm"
                  onClick={handleFinishAndApply}
                  className="bg-gradient-to-r from-[#2E7D4F] to-[#3B9E65] hover:opacity-95 text-white font-semibold px-6 shadow-md"
                >
                  <CheckCircle2 className="h-4 w-4 mr-2" /> Preencher Formulário
                </Button>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
