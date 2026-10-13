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
} from 'lucide-react'
import { toast } from 'sonner'

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
}: VoiceGuidedModalProps) {
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

  // Manual editing inline for current step
  const [manualInput, setManualInput] = useState('')

  // Refs
  const recognitionRef = useRef<any>(null)
  const activeStreamRef = useRef<MediaStream | null>(null)
  const restartTimerRef = useRef<any>(null)
  const currentStepIndexRef = useRef(currentStepIndex)
  currentStepIndexRef.current = currentStepIndex

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
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const t = event.results[i][0].transcript
          if (event.results[i].isFinal) {
            accumulated += (accumulated ? ' ' : '') + t
          } else {
            currentTranscript += t
          }
        }
        const full = (accumulated + ' ' + currentTranscript).trim()
        if (full) {
          setLiveTranscript(full)
          setManualInput(full)
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
      return
    }

    // Limpa transcrição temporária e erro da etapa ao mudar de pergunta
    setLiveTranscript('')
    setStepError(null)
    setAmbiguousCandidates([])

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
    }
    onOpenChange(nextOpen)
  }

  // Restart modal completely
  const handleRestart = () => {
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
  }

  // Confirm current step answer
  const handleConfirmStep = (forcedText?: string) => {
    if (!currentStep) return

    const raw = (forcedText !== undefined ? forcedText : manualInput || liveTranscript).trim()
    setStepError(null)
    setAmbiguousCandidates([])

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
        const match = matchAuxiliaryItem(raw, types)
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
          // Nenhum match exato/parcial no banco. Permite usar o texto livre ou escolher
          setData((prev) => ({
            ...prev,
            typeId: '',
            typeName: raw,
          }))
          toast.info(`Tipo registrado como "${raw}" (revise na etapa final).`)
          setCurrentStepIndex((prev) => prev + 1)
        }
        break
      }

      case 'material': {
        const match = matchAuxiliaryItem(raw, materials)
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
          setData((prev) => ({
            ...prev,
            materialId: '',
            materialName: raw,
          }))
          toast.info(`Material registrado como "${raw}".`)
          setCurrentStepIndex((prev) => prev + 1)
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
          // Deixa em aberto ou tenta atribuir se for texto válido
          setData((prev) => ({
            ...prev,
            targetAudience: '',
          }))
          toast.info('Perfil não identificado com clareza. Você poderá definir na revisão.')
          setCurrentStepIndex((prev) => prev + 1)
        }
        break
      }

      case 'size': {
        const match = matchAuxiliaryItem(raw, sizes)
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
          // Se falou algo como "20" ou "único"
          setData((prev) => ({
            ...prev,
            sizeId: '',
            sizeName: raw,
          }))
          setCurrentStepIndex((prev) => prev + 1)
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
      <DialogContent className="max-w-2xl max-h-[92vh] flex flex-col p-0 overflow-hidden bg-[#FDFBF7] border-[#C6A664]/40 shadow-2xl">
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
                </div>
              </div>

              {/* Step Error Notice / Ambiguous Options */}
              {stepError && (
                <div className="p-3.5 rounded-xl bg-[#B26A00]/10 border border-[#B26A00]/30 text-xs text-[#B26A00] space-y-2">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span className="font-semibold">{stepError}</span>
                  </div>

                  {/* Multiple candidates buttons */}
                  {ambiguousCandidates.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-1 pl-6">
                      {ambiguousCandidates.map((cand) => (
                        <Button
                          key={cand.id}
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => handleConfirmStep(cand.name)}
                          className="bg-white border-[#C6A664] text-[#7A5C2E] hover:bg-[#F3EAD8] text-xs h-8"
                        >
                          <Check className="h-3 w-3 mr-1" />
                          {cand.name}
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Direct Choice Pills for standard options (Tipo, Material, Perfil) */}
              {currentStep.key === 'type' && types.length > 0 && (
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-semibold text-[#8C8275] uppercase tracking-wider">
                    Ou selecione um tipo cadastrado:
                  </Label>
                  <div className="flex flex-wrap gap-1.5">
                    {types.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => handleConfirmStep(t.name)}
                        className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                          data.typeId === t.id
                            ? 'bg-[#C6A664] text-white border-[#C6A664]'
                            : 'bg-white text-[#2D2A26] border-[#E5DFD5] hover:border-[#C6A664] hover:bg-[#FDFBF7]'
                        }`}
                      >
                        {t.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {currentStep.key === 'material' && materials.length > 0 && (
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-semibold text-[#8C8275] uppercase tracking-wider">
                    Ou selecione um material cadastrado:
                  </Label>
                  <div className="flex flex-wrap gap-1.5">
                    {materials.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => handleConfirmStep(m.name)}
                        className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                          data.materialId === m.id
                            ? 'bg-[#C6A664] text-white border-[#C6A664]'
                            : 'bg-white text-[#2D2A26] border-[#E5DFD5] hover:border-[#C6A664] hover:bg-[#FDFBF7]'
                        }`}
                      >
                        {m.name}
                      </button>
                    ))}
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
                    ].map((aud) => (
                      <Button
                        key={aud.key}
                        type="button"
                        variant="outline"
                        onClick={() => handleConfirmStep(aud.label)}
                        className={`h-9 text-xs border ${
                          data.targetAudience === aud.key
                            ? 'bg-[#C6A664] text-white border-[#C6A664]'
                            : 'bg-white text-[#2D2A26] border-[#E5DFD5] hover:bg-[#FDFBF7]'
                        }`}
                      >
                        {aud.label}
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              {currentStep.key === 'size' && sizes.length > 0 && (
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-semibold text-[#8C8275] uppercase tracking-wider">
                    Tamanhos mais comuns:
                  </Label>
                  <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-1">
                    {sizes.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => handleConfirmStep(s.name)}
                        className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                          data.sizeId === s.id
                            ? 'bg-[#C6A664] text-white border-[#C6A664]'
                            : 'bg-white text-[#2D2A26] border-[#E5DFD5] hover:border-[#C6A664]'
                        }`}
                      >
                        {s.name}
                      </button>
                    ))}
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
                    onChange={(e) => setManualInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Sua fala aparecerá aqui ou digite diretamente..."
                    rows={2}
                    className="bg-white border-[#E5DFD5] focus-visible:ring-[#C6A664] text-sm"
                  />
                ) : (
                  <Input
                    id="guidedInput"
                    value={manualInput}
                    onChange={(e) => setManualInput(e.target.value)}
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
                        const sel = types.find((t) => t.id === e.target.value)
                        setData((prev) => ({
                          ...prev,
                          typeId: e.target.value,
                          typeName: sel ? sel.name : prev.typeName,
                        }))
                      }}
                      className="mt-1 w-full rounded-md border border-[#E5DFD5] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C6A664]"
                    >
                      <option value="">Selecione ou confirme...</option>
                      {types.map((t) => (
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
                        const sel = materials.find((m) => m.id === e.target.value)
                        setData((prev) => ({
                          ...prev,
                          materialId: e.target.value,
                          materialName: sel ? sel.name : prev.materialName,
                        }))
                      }}
                      className="mt-1 w-full rounded-md border border-[#E5DFD5] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C6A664]"
                    >
                      <option value="">Selecione ou confirme...</option>
                      {materials.map((m) => (
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
                        const sel = sizes.find((s) => s.id === e.target.value)
                        setData((prev) => ({
                          ...prev,
                          sizeId: e.target.value,
                          sizeName: sel ? sel.name : prev.sizeName,
                        }))
                      }}
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
