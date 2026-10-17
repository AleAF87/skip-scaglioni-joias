import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Sparkles,
  Mic,
  MicOff,
  Loader2,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Plus,
  RotateCcw,
  Volume2,
  HelpCircle,
  Check,
  ShieldAlert,
} from 'lucide-react'
import { ProductType, ProductMaterial, ProductSize } from '@/types'
import { productService } from '@/services/productService'
import { normalizeCurrencyValue, formatCurrency } from '@/lib/formatters'
import { toast } from 'sonner'
import pb from '@/lib/pocketbase/client'

export interface CadIaProductData {
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

interface VoiceCadIaModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  types: ProductType[]
  materials: ProductMaterial[]
  sizes: ProductSize[]
  onApplyToForm: (data: CadIaProductData) => void
  onAuxiliaryCreated?: (
    collection: 'product_types' | 'product_materials' | 'product_sizes',
    record: { id: string; name: string },
  ) => void
}

type ModalStage = 'recording' | 'processing' | 'review'

export function VoiceCadIaModal({
  open,
  onOpenChange,
  types,
  materials,
  sizes,
  onApplyToForm,
  onAuxiliaryCreated,
}: VoiceCadIaModalProps) {
  // Cadastros locais atualizados em tempo real
  const [localTypes, setLocalTypes] = useState<ProductType[]>(types)
  const [localMaterials, setLocalMaterials] = useState<ProductMaterial[]>(materials)
  const [localSizes, setLocalSizes] = useState<ProductSize[]>(sizes)

  useEffect(() => setLocalTypes(types), [types])
  useEffect(() => setLocalMaterials(materials), [materials])
  useEffect(() => setLocalSizes(sizes), [sizes])

  // Estado do fluxo
  const [stage, setStage] = useState<ModalStage>('recording')
  const [isListening, setIsListening] = useState(false)
  const [spokenText, setSpokenText] = useState('')
  const [recordingSeconds, setRecordingSeconds] = useState(0)
  const [micError, setMicError] = useState<string | null>(null)
  const [serverFallbackNotice, setServerFallbackNotice] = useState<string | null>(null)

  // Dados interpretados
  const [formData, setFormData] = useState<CadIaProductData>({
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

  // Análise semântica retornada do servidor
  const [aiAnalysis, setAiAnalysis] = useState<{
    type?: {
      id: string | null
      name: string
      status: 'matched' | 'ambiguous' | 'not_found' | 'empty'
      matched: boolean
      ambiguous: boolean
      not_found: boolean
      candidates: Array<{ id: string; name: string }>
    }
    material?: {
      id: string | null
      name: string
      status: 'matched' | 'ambiguous' | 'not_found' | 'empty'
      matched: boolean
      ambiguous: boolean
      not_found: boolean
      candidates: Array<{ id: string; name: string }>
    }
    size?: {
      id: string | null
      name: string
      status: 'matched' | 'ambiguous' | 'not_found' | 'empty'
      matched: boolean
      ambiguous: boolean
      not_found: boolean
      candidates: Array<{ id: string; name: string }>
    }
  }>({})

  const [missingFields, setMissingFields] = useState<string[]>([])
  const [isCreatingAuxiliary, setIsCreatingAuxiliary] = useState<string | null>(null)

  // Refs de áudio e reconhecimento
  const recognitionRef = useRef<any>(null)
  const timerIntervalRef = useRef<any>(null)
  const activeStreamRef = useRef<MediaStream | null>(null)

  const getSpeechRecClass = () => {
    if (typeof window === 'undefined') return null
    return (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null
  }

  // Parar escuta
  const stopListening = useCallback(() => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current)
      timerIntervalRef.current = null
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

  // Iniciar escuta livre
  const startListening = useCallback(async () => {
    stopListening()
    setMicError(null)

    const SpeechRec = getSpeechRecClass()
    if (!SpeechRec) {
      setMicError(
        'Seu navegador não possui suporte direto a ditado por voz. Digite no campo abaixo.',
      )
      return
    }

    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        activeStreamRef.current = stream
      }
    } catch (err: any) {
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setMicError('Microfone bloqueado. Permita o microfone no navegador para continuar.')
        return
      }
    }

    try {
      const recognition = new SpeechRec()
      recognition.lang = 'pt-BR'
      recognition.continuous = true
      recognition.interimResults = true
      recognition.maxAlternatives = 1

      let accumulated = spokenText ? spokenText + ' ' : ''

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
          setSpokenText(full)
        }
      }

      recognition.onerror = (event: any) => {
        if (event.error === 'not-allowed') {
          setMicError('Microfone bloqueado pelo usuário.')
          stopListening()
        }
      }

      recognition.onend = () => {
        // Se ainda estiver gravando na etapa inicial, reinicia
        if (isListening) {
          try {
            recognition.start()
          } catch {
            setIsListening(false)
          }
        }
      }

      recognition.start()
      recognitionRef.current = recognition
      setIsListening(true)
      setRecordingSeconds(0)

      timerIntervalRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1)
      }, 1000)
    } catch (err: any) {
      console.warn('Falha ao iniciar microfone:', err)
      setMicError('Não foi possível iniciar o microfone. Você pode digitar.')
      setIsListening(false)
    }
  }, [isListening, spokenText, stopListening])

  // Reset ao abrir modal
  useEffect(() => {
    if (open) {
      setStage('recording')
      setSpokenText('')
      setRecordingSeconds(0)
      setMicError(null)
      setServerFallbackNotice(null)
      setAiAnalysis({})
      setMissingFields([])
      setFormData({
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

      // Inicia automaticamente o microfone para conveniência
      const t = setTimeout(() => {
        startListening()
      }, 150)
      return () => clearTimeout(t)
    } else {
      stopListening()
    }
  }, [open, startListening, stopListening])

  // Limpeza no unmount
  useEffect(() => {
    return () => {
      stopListening()
    }
  }, [stopListening])

  // Processar fala com IA no servidor
  const handleProcessWithAi = async () => {
    stopListening()
    const textToAnalyze = spokenText.trim()
    if (!textToAnalyze) {
      toast.error('Grave ou digite a descrição da joia antes de interpretar.')
      return
    }

    setStage('processing')
    setServerFallbackNotice(null)

    try {
      const res = await productService.interpretVoiceDescription(textToAnalyze)

      const matchedType = localTypes.find((t) => t.id === res.type_id)
      const matchedMaterial = localMaterials.find((m) => m.id === res.material_id)
      const matchedSize = localSizes.find((s) => s.id === res.size_id)

      const numQty = typeof res.quantity === 'number' ? res.quantity : null
      const thirtyPercent = numQty && numQty > 0 ? Math.max(1, Math.round(numQty * 0.3)) : ''

      setFormData({
        typeId: res.type_id || '',
        typeName: matchedType ? matchedType.name : res.type_name || '',
        materialId: res.material_id || '',
        materialName: matchedMaterial ? matchedMaterial.name : res.material_name || '',
        targetAudience:
          res.target_audience === 'feminino' ||
          res.target_audience === 'masculino' ||
          res.target_audience === 'unissex'
            ? res.target_audience
            : '',
        sizeId: res.size_id || '',
        sizeName: matchedSize ? matchedSize.name : res.size_name || '',
        description: res.description || '',
        investedValue: typeof res.invested_value === 'number' ? res.invested_value.toFixed(2) : '',
        sellingPrice: typeof res.selling_price === 'number' ? res.selling_price.toFixed(2) : '',
        quantity: numQty !== null ? numQty.toString() : '',
        minimumQuantity: thirtyPercent ? thirtyPercent.toString() : '',
        observations: res.observations || '',
      })

      setAiAnalysis(res.analysis || {})
      setMissingFields(res.missing_fields || [])

      setStage('review')
      toast.success('Descrição interpretada com sucesso pela IA!')
    } catch (err: any) {
      console.error('Erro na chamada de IA no servidor:', err)
      // Mensagem humanizada em tom dourado conforme requisito 6 (padrão 503)
      setServerFallbackNotice(
        'O serviço de IA do servidor encontrou uma instabilidade temporária. Você pode revisar e preencher os dados a partir do texto que foi reconhecido.',
      )
      // Fallback: vai para revisão com o texto bruto preenchido no campo descrição
      setFormData((prev) => ({
        ...prev,
        description: textToAnalyze,
      }))
      setStage('review')
    }
  }

  // Cadastrar item auxiliar novo na hora
  const handleCreateAuxiliaryItem = async (
    collection: 'product_types' | 'product_materials' | 'product_sizes',
    name: string,
  ) => {
    const trimmed = name.trim()
    if (!trimmed) return

    setIsCreatingAuxiliary(collection)
    try {
      const created = await pb.collection(collection).create<{ id: string; name: string }>({
        name: trimmed,
      })

      if (collection === 'product_types') {
        const updated = [...localTypes, created as ProductType].sort((a, b) =>
          a.name.localeCompare(b.name),
        )
        setLocalTypes(updated)
        setFormData((prev) => ({
          ...prev,
          typeId: created.id,
          typeName: created.name,
        }))
        setAiAnalysis((prev) => ({
          ...prev,
          type: {
            id: created.id,
            name: created.name,
            status: 'matched',
            matched: true,
            ambiguous: false,
            not_found: false,
            candidates: [created],
          },
        }))
        toast.success(`Tipo "${created.name}" cadastrado e selecionado!`)
      } else if (collection === 'product_materials') {
        const updated = [...localMaterials, created as ProductMaterial].sort((a, b) =>
          a.name.localeCompare(b.name),
        )
        setLocalMaterials(updated)
        setFormData((prev) => ({
          ...prev,
          materialId: created.id,
          materialName: created.name,
        }))
        setAiAnalysis((prev) => ({
          ...prev,
          material: {
            id: created.id,
            name: created.name,
            status: 'matched',
            matched: true,
            ambiguous: false,
            not_found: false,
            candidates: [created],
          },
        }))
        toast.success(`Material "${created.name}" cadastrado e selecionado!`)
      } else if (collection === 'product_sizes') {
        const updated = [...localSizes, created as ProductSize].sort((a, b) =>
          a.name.localeCompare(b.name),
        )
        setLocalSizes(updated)
        setFormData((prev) => ({
          ...prev,
          sizeId: created.id,
          sizeName: created.name,
        }))
        setAiAnalysis((prev) => ({
          ...prev,
          size: {
            id: created.id,
            name: created.name,
            status: 'matched',
            matched: true,
            ambiguous: false,
            not_found: false,
            candidates: [created],
          },
        }))
        toast.success(`Tamanho "${created.name}" cadastrado e selecionado!`)
      }

      if (onAuxiliaryCreated) {
        onAuxiliaryCreated(collection, created)
      }
    } catch (err: any) {
      console.error('Erro ao criar auxiliar:', err)
      toast.error('Não foi possível cadastrar novo item: ' + (err.message || 'tente novamente.'))
    } finally {
      setIsCreatingAuxiliary(null)
    }
  }

  // Confirmar e preencher no formulário da página principal
  const handleConfirmAndApply = () => {
    if (!formData.description.trim()) {
      toast.error('A descrição da joia é obrigatória.')
      return
    }
    const normSelling = normalizeCurrencyValue(formData.sellingPrice)
    if (normSelling === null || normSelling <= 0) {
      toast.error('Informe um preço de venda válido maior que zero.')
      return
    }
    const numQty = parseInt(formData.quantity, 10)
    if (isNaN(numQty) || numQty < 0) {
      toast.error('Informe uma quantidade válida.')
      return
    }

    stopListening()
    onApplyToForm(formData)
    toast.success('Dados interpretados aplicados na tela para revisão final!')
    onOpenChange(false)
  }

  const formatTimer = (secs: number) => {
    const m = Math.floor(secs / 60)
    const s = secs % 60
    return `${m}:${s < 10 ? '0' : ''}${s}`
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) stopListening()
        onOpenChange(next)
      }}
    >
      <DialogContent
        style={{ height: 'min(780px, 94vh)' }}
        className="max-w-3xl w-[95vw] h-[min(780px,94vh)] flex flex-col p-0 overflow-hidden bg-[#FDFBF7] border-[#C6A664]/40 shadow-2xl"
      >
        {/* Header Scaglioni */}
        <DialogHeader className="px-6 py-4 bg-gradient-to-r from-[#2D2A26] via-[#3D3730] to-[#2D2A26] text-white border-b border-[#C6A664]/30 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-[#C6A664]/20 text-[#E8D5A3]">
                <Sparkles className="h-5 w-5" />
              </span>
              <div>
                <DialogTitle className="font-serif text-lg md:text-xl font-bold text-[#F3EAD8] tracking-wide flex items-center gap-2">
                  Cad IA • Interpretação Completa por Voz
                  <Badge
                    variant="outline"
                    className="border-[#C6A664] text-[#E8D5A3] bg-[#C6A664]/10 text-[10px] px-2 py-0.2"
                  >
                    3º Formato
                  </Badge>
                </DialogTitle>
                <DialogDescription className="text-xs text-[#E8D5A3]/80">
                  Fale tudo de uma vez em linguagem natural. A IA do servidor normaliza cadastros,
                  valores e quantidades.
                </DialogDescription>
              </div>
            </div>

            <Badge
              variant="outline"
              className="border-[#C6A664] text-[#E8D5A3] bg-[#C6A664]/10 text-xs px-2.5 py-1"
            >
              {stage === 'recording'
                ? 'Etapa 1: Captura'
                : stage === 'processing'
                  ? 'Processando'
                  : 'Etapa 2: Revisão dos Campos'}
            </Badge>
          </div>
        </DialogHeader>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Alerta de erro de microfone */}
          {micError && (
            <div className="p-3.5 rounded-xl bg-[#B3261E]/10 border border-[#B3261E]/30 text-xs text-[#B3261E] flex items-start gap-2.5">
              <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold">{micError}</p>
                <p className="mt-0.5 text-[#2D2A26]">
                  Você também pode digitar ou colar todo o texto falado no campo abaixo.
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

          {/* Aviso humanizado se serviço falhar (dourado) */}
          {serverFallbackNotice && (
            <div className="p-3.5 rounded-xl bg-[#B26A00]/10 border border-[#B26A00]/30 text-xs text-[#7A5C2E] flex items-start gap-2.5">
              <HelpCircle className="h-4 w-4 shrink-0 mt-0.5 text-[#C6A664]" />
              <div className="flex-1">
                <p className="font-semibold">Aviso de processamento</p>
                <p className="mt-0.5">{serverFallbackNotice}</p>
              </div>
            </div>
          )}

          {/* ESTÁGIO 1: GRAVAÇÃO E CAPTURA COMPLETA */}
          {stage === 'recording' && (
            <div className="space-y-6">
              <div className="text-center space-y-2 py-2">
                <h2 className="font-serif text-2xl md:text-3xl font-bold text-[#2D2A26] leading-snug">
                  Fale a joia completa de uma só vez
                </h2>
                <p className="text-xs md:text-sm text-[#6B655E] max-w-lg mx-auto">
                  Diga tipo, material, perfil, tamanho, valores e quantidade em qualquer ordem. A IA
                  irá desmembrar e casar com os cadastros do sistema.
                </p>
                <p className="text-[11px] text-[#7A5C2E] italic font-medium">
                  Exemplo: "brinco folhado pra moça tamanho único paguei 51 e 95 vou vender por 138
                  e 42 comprei meia dúzia ele tem pedras zircônia"
                </p>
              </div>

              {/* Botão de gravação pulsante */}
              <div className="flex flex-col items-center justify-center p-6 rounded-2xl bg-white border border-[#E5DFD5] shadow-sm space-y-3">
                <div className="relative">
                  <button
                    type="button"
                    onClick={isListening ? stopListening : startListening}
                    aria-label={isListening ? 'Pausar gravação' : 'Ligar microfone'}
                    className={`h-20 w-20 md:h-24 md:w-24 rounded-full flex items-center justify-center text-white transition-all duration-300 shadow-xl cursor-pointer ${
                      isListening
                        ? 'bg-[#B3261E] ring-8 ring-[#B3261E]/30 scale-105 animate-pulse'
                        : 'bg-gradient-to-tr from-[#7A5C2E] via-[#C6A664] to-[#E8D5A3] hover:scale-105'
                    }`}
                  >
                    {isListening ? (
                      <MicOff className="h-9 w-9 text-white" />
                    ) : (
                      <Mic className="h-9 w-9 text-white" />
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
                        Ouvindo... ({formatTimer(recordingSeconds)}) — Clique para pausar
                      </>
                    ) : (
                      'Microfone pausado — clique para gravar'
                    )}
                  </span>
                </div>
              </div>

              {/* Área de texto transcrito editável */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold text-[#6B655E] uppercase tracking-wider flex items-center gap-1.5">
                    <Volume2 className="h-3.5 w-3.5 text-[#C6A664]" /> Texto falado ou digitado
                  </Label>
                  {spokenText && (
                    <span className="text-xs text-[#7A5C2E] font-medium">
                      {spokenText.split(' ').filter(Boolean).length} palavras
                    </span>
                  )}
                </div>

                <Textarea
                  value={spokenText}
                  onChange={(e) => setSpokenText(e.target.value)}
                  placeholder="Fale no microfone ou digite a descrição completa da peça aqui..."
                  rows={4}
                  className="bg-white border-[#E5DFD5] focus-visible:ring-[#C6A664] text-base resize-none"
                />
              </div>

              {/* Botão de ação para enviar à IA */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
                <p className="text-xs text-[#6B655E] flex items-center gap-1">
                  <HelpCircle className="h-3.5 w-3.5 text-[#C6A664]" /> A IA nunca inventa preços ou
                  quantidades se não foram ditos.
                </p>

                <Button
                  type="button"
                  onClick={handleProcessWithAi}
                  disabled={!spokenText.trim()}
                  className="w-full sm:w-auto bg-gradient-to-r from-[#7A5C2E] to-[#C6A664] hover:opacity-90 text-white font-semibold shadow-sm px-6"
                >
                  <Sparkles className="h-4 w-4 mr-2" /> Interpretar com IA
                </Button>
              </div>
            </div>
          )}

          {/* ESTÁGIO 2: PROCESSANDO */}
          {stage === 'processing' && (
            <div className="flex flex-col items-center justify-center py-20 space-y-4">
              <div className="p-4 rounded-full bg-[#C6A664]/15 text-[#7A5C2E]">
                <Loader2 className="h-10 w-10 animate-spin text-[#C6A664]" />
              </div>
              <h3 className="font-serif text-xl font-bold text-[#2D2A26]">
                Interpretando descrição com IA...
              </h3>
              <p className="text-xs text-[#6B655E] max-w-md text-center">
                Normalizando materiais, casando categorias existentes e extraindo valores monetários
                com até 2 casas decimais.
              </p>
            </div>
          )}

          {/* ESTÁGIO 3: REVISÃO CAMPO A CAMPO COM STATUS DETALHADO */}
          {stage === 'review' && (
            <div className="space-y-6">
              <div className="p-4 rounded-xl bg-gradient-to-r from-[#FDFBF7] to-[#F3EAD8]/40 border border-[#C6A664]/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                  <h3 className="font-serif text-base font-bold text-[#2D2A26] flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-[#2E7D4F]" />
                    Resultado da Interpretação Semântica
                  </h3>
                  <p className="text-xs text-[#6B655E] mt-0.5">
                    Revise os campos pré-selecionados pela IA. Nenhum dado é salvo sem sua
                    confirmação.
                  </p>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setStage('recording')
                    setTimeout(() => startListening(), 100)
                  }}
                  className="border-[#C6A664]/60 text-[#7A5C2E] hover:bg-[#C6A664]/10 shrink-0 text-xs"
                >
                  <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Falar Novamente
                </Button>
              </div>

              {/* Alerta de campos ausentes */}
              {missingFields.length > 0 && (
                <div className="p-3.5 rounded-xl bg-[#B26A00]/10 border border-[#B26A00]/30 text-xs text-[#B26A00] flex items-start gap-2.5">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold">Campos não mencionados na fala:</span>
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {missingFields.map((f) => (
                        <Badge
                          key={f}
                          variant="secondary"
                          className="bg-[#B26A00]/15 text-[#B26A00] border-none text-[11px]"
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

              {/* Grid de Tipo, Material, Perfil, Tamanho com status da IA */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* CAMPO TIPO */}
                <div className="p-3.5 rounded-xl bg-white border border-[#E5DFD5] space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold text-[#2D2A26]">Tipo de Joia</Label>
                    {aiAnalysis.type?.matched && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#2E7D4F] bg-[#2E7D4F]/10 px-2 py-0.5 rounded-full">
                        <Check className="h-3 w-3" /> Entendi: {aiAnalysis.type.name}
                      </span>
                    )}
                    {aiAnalysis.type?.ambiguous && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#B26A00] bg-[#B26A00]/10 px-2 py-0.5 rounded-full">
                        <AlertCircle className="h-3 w-3" /> Opção ambígua
                      </span>
                    )}
                    {aiAnalysis.type?.not_found && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#6B655E] bg-gray-100 px-2 py-0.5 rounded-full">
                        Novo item sugerido
                      </span>
                    )}
                  </div>

                  <select
                    value={formData.typeId}
                    onChange={(e) => {
                      const sel = localTypes.find((t) => t.id === e.target.value)
                      setFormData((prev) => ({
                        ...prev,
                        typeId: e.target.value,
                        typeName: sel ? sel.name : '',
                      }))
                    }}
                    className="w-full rounded-md border border-[#E5DFD5] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C6A664]"
                  >
                    <option value="">Selecione o tipo...</option>
                    {localTypes.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>

                  {/* Opções candidatas ambíguas */}
                  {aiAnalysis.type?.ambiguous && aiAnalysis.type.candidates.length > 0 && (
                    <div className="pt-1">
                      <p className="text-[11px] text-[#6B655E] mb-1">Candidatos sugeridos:</p>
                      <div className="flex flex-wrap gap-1.5">
                        {aiAnalysis.type.candidates.map((cand) => (
                          <Button
                            key={cand.id}
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              setFormData((prev) => ({
                                ...prev,
                                typeId: cand.id,
                                typeName: cand.name,
                              }))
                            }
                            className={`h-7 text-xs ${
                              formData.typeId === cand.id
                                ? 'bg-[#C6A664]/20 border-[#C6A664] text-[#7A5C2E] font-bold'
                                : 'border-[#E5DFD5]'
                            }`}
                          >
                            {cand.name}
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Não encontrado -> botão de cadastrar como novo */}
                  {aiAnalysis.type?.not_found && aiAnalysis.type.name && (
                    <div className="pt-1 flex items-center justify-between gap-2">
                      <span className="text-[11px] text-[#6B655E]">
                        Não cadastrado: <strong>"{aiAnalysis.type.name}"</strong>
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={isCreatingAuxiliary === 'product_types'}
                        onClick={() =>
                          handleCreateAuxiliaryItem('product_types', aiAnalysis.type!.name)
                        }
                        className="h-7 text-xs border-[#C6A664] text-[#7A5C2E] hover:bg-[#C6A664]/10 shrink-0"
                      >
                        {isCreatingAuxiliary === 'product_types' ? (
                          <Loader2 className="h-3 w-3 animate-spin mr-1" />
                        ) : (
                          <Plus className="h-3 w-3 mr-1" />
                        )}
                        Adicionar como novo
                      </Button>
                    </div>
                  )}
                </div>

                {/* CAMPO MATERIAL */}
                <div className="p-3.5 rounded-xl bg-white border border-[#E5DFD5] space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold text-[#2D2A26]">Material</Label>
                    {aiAnalysis.material?.matched && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#2E7D4F] bg-[#2E7D4F]/10 px-2 py-0.5 rounded-full">
                        <Check className="h-3 w-3" /> Entendi: {aiAnalysis.material.name}
                      </span>
                    )}
                    {aiAnalysis.material?.ambiguous && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#B26A00] bg-[#B26A00]/10 px-2 py-0.5 rounded-full">
                        <AlertCircle className="h-3 w-3" /> Opção ambígua
                      </span>
                    )}
                    {aiAnalysis.material?.not_found && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#6B655E] bg-gray-100 px-2 py-0.5 rounded-full">
                        Novo material sugerido
                      </span>
                    )}
                  </div>

                  <select
                    value={formData.materialId}
                    onChange={(e) => {
                      const sel = localMaterials.find((m) => m.id === e.target.value)
                      setFormData((prev) => ({
                        ...prev,
                        materialId: e.target.value,
                        materialName: sel ? sel.name : '',
                      }))
                    }}
                    className="w-full rounded-md border border-[#E5DFD5] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C6A664]"
                  >
                    <option value="">Selecione o material...</option>
                    {localMaterials.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>

                  {/* Opções candidatas ambíguas */}
                  {aiAnalysis.material?.ambiguous && aiAnalysis.material.candidates.length > 0 && (
                    <div className="pt-1">
                      <p className="text-[11px] text-[#6B655E] mb-1">Candidatos sugeridos:</p>
                      <div className="flex flex-wrap gap-1.5">
                        {aiAnalysis.material.candidates.map((cand) => (
                          <Button
                            key={cand.id}
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              setFormData((prev) => ({
                                ...prev,
                                materialId: cand.id,
                                materialName: cand.name,
                              }))
                            }
                            className={`h-7 text-xs ${
                              formData.materialId === cand.id
                                ? 'bg-[#C6A664]/20 border-[#C6A664] text-[#7A5C2E] font-bold'
                                : 'border-[#E5DFD5]'
                            }`}
                          >
                            {cand.name}
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Não encontrado -> botão de cadastrar como novo */}
                  {aiAnalysis.material?.not_found && aiAnalysis.material.name && (
                    <div className="pt-1 flex items-center justify-between gap-2">
                      <span className="text-[11px] text-[#6B655E]">
                        Não cadastrado: <strong>"{aiAnalysis.material.name}"</strong>
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={isCreatingAuxiliary === 'product_materials'}
                        onClick={() =>
                          handleCreateAuxiliaryItem('product_materials', aiAnalysis.material!.name)
                        }
                        className="h-7 text-xs border-[#C6A664] text-[#7A5C2E] hover:bg-[#C6A664]/10 shrink-0"
                      >
                        {isCreatingAuxiliary === 'product_materials' ? (
                          <Loader2 className="h-3 w-3 animate-spin mr-1" />
                        ) : (
                          <Plus className="h-3 w-3 mr-1" />
                        )}
                        Adicionar como novo
                      </Button>
                    </div>
                  )}
                </div>

                {/* CAMPO PERFIL */}
                <div className="p-3.5 rounded-xl bg-white border border-[#E5DFD5] space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold text-[#2D2A26]">Perfil</Label>
                    {formData.targetAudience && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#2E7D4F] bg-[#2E7D4F]/10 px-2 py-0.5 rounded-full">
                        <Check className="h-3 w-3" /> Entendi:{' '}
                        {formData.targetAudience.charAt(0).toUpperCase() +
                          formData.targetAudience.slice(1)}
                      </span>
                    )}
                  </div>

                  <select
                    value={formData.targetAudience}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        targetAudience: e.target.value as any,
                      }))
                    }
                    className="w-full rounded-md border border-[#E5DFD5] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C6A664]"
                  >
                    <option value="">Selecione o perfil...</option>
                    <option value="feminino">Feminino</option>
                    <option value="masculino">Masculino</option>
                    <option value="unissex">Unissex</option>
                  </select>
                </div>

                {/* CAMPO TAMANHO */}
                <div className="p-3.5 rounded-xl bg-white border border-[#E5DFD5] space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold text-[#2D2A26]">Tamanho</Label>
                    {aiAnalysis.size?.matched && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#2E7D4F] bg-[#2E7D4F]/10 px-2 py-0.5 rounded-full">
                        <Check className="h-3 w-3" /> Entendi: {aiAnalysis.size.name}
                      </span>
                    )}
                    {aiAnalysis.size?.ambiguous && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#B26A00] bg-[#B26A00]/10 px-2 py-0.5 rounded-full">
                        <AlertCircle className="h-3 w-3" /> Opção ambígua
                      </span>
                    )}
                    {aiAnalysis.size?.not_found && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#6B655E] bg-gray-100 px-2 py-0.5 rounded-full">
                        Novo tamanho sugerido
                      </span>
                    )}
                  </div>

                  <select
                    value={formData.sizeId}
                    onChange={(e) => {
                      const sel = localSizes.find((s) => s.id === e.target.value)
                      setFormData((prev) => ({
                        ...prev,
                        sizeId: e.target.value,
                        sizeName: sel ? sel.name : '',
                      }))
                    }}
                    className="w-full rounded-md border border-[#E5DFD5] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C6A664]"
                  >
                    <option value="">Selecione o tamanho...</option>
                    {localSizes.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>

                  {/* Não encontrado -> botão de cadastrar como novo */}
                  {aiAnalysis.size?.not_found && aiAnalysis.size.name && (
                    <div className="pt-1 flex items-center justify-between gap-2">
                      <span className="text-[11px] text-[#6B655E]">
                        Não cadastrado: <strong>"{aiAnalysis.size.name}"</strong>
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={isCreatingAuxiliary === 'product_sizes'}
                        onClick={() =>
                          handleCreateAuxiliaryItem('product_sizes', aiAnalysis.size!.name)
                        }
                        className="h-7 text-xs border-[#C6A664] text-[#7A5C2E] hover:bg-[#C6A664]/10 shrink-0"
                      >
                        {isCreatingAuxiliary === 'product_sizes' ? (
                          <Loader2 className="h-3 w-3 animate-spin mr-1" />
                        ) : (
                          <Plus className="h-3 w-3 mr-1" />
                        )}
                        Adicionar como novo
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              {/* DESCRIÇÃO DA JOIA (Limpa, sem poluição) */}
              <div className="p-3.5 rounded-xl bg-white border border-[#E5DFD5] space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="cad-desc" className="text-xs font-semibold text-[#2D2A26]">
                    Descrição da Joia * (Apenas características estéticas da peça)
                  </Label>
                  <span className="text-[11px] text-[#7A5C2E] font-medium">
                    Sem repetir tipo/material/perfil/tamanho
                  </span>
                </div>
                <Input
                  id="cad-desc"
                  value={formData.description}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, description: e.target.value }))
                  }
                  placeholder="Ex: Pedras zircônias brilhantes cravejadas em garras"
                  className="border-[#E5DFD5] focus-visible:ring-[#C6A664]"
                />
              </div>

              {/* VALORES E QUANTIDADE */}
              <div className="grid grid-cols-1 sm:grid-cols-3 md:grid-cols-4 gap-3 p-3.5 rounded-xl bg-[#FDFBF7] border border-[#E5DFD5]">
                <div>
                  <Label className="text-xs font-semibold text-[#6B655E]">
                    Valor Investido (R$)
                  </Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.investedValue}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, investedValue: e.target.value }))
                    }
                    placeholder="0,00"
                    className="mt-1 bg-white border-[#E5DFD5]"
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
                    value={formData.sellingPrice}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, sellingPrice: e.target.value }))
                    }
                    placeholder="0,00"
                    className="mt-1 bg-white border-[#C6A664] font-semibold text-[#7A5C2E]"
                  />
                </div>

                <div>
                  <Label className="text-xs font-semibold text-[#2D2A26]">
                    Quantidade em Estoque *
                  </Label>
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    value={formData.quantity}
                    onChange={(e) => {
                      const val = e.target.value
                      const num = parseInt(val, 10)
                      const thirty =
                        !isNaN(num) && num > 0 ? Math.max(1, Math.round(num * 0.3)) : ''
                      setFormData((prev) => ({
                        ...prev,
                        quantity: val,
                        minimumQuantity: thirty ? thirty.toString() : prev.minimumQuantity,
                      }))
                    }}
                    placeholder="1"
                    className="mt-1 bg-white border-[#E5DFD5] font-semibold"
                  />
                </div>

                <div>
                  <Label className="text-xs font-semibold text-[#6B655E]">
                    Estoque Mínimo (30%)
                  </Label>
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    value={formData.minimumQuantity}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, minimumQuantity: e.target.value }))
                    }
                    placeholder="30% padrão"
                    className="mt-1 bg-white border-[#E5DFD5]"
                  />
                </div>
              </div>

              {/* OBSERVAÇÕES */}
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-[#2D2A26]">Observações</Label>
                <Textarea
                  value={formData.observations}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, observations: e.target.value }))
                  }
                  placeholder="Garantia, banho, cuidados ou detalhes adicionais..."
                  rows={2}
                  className="border-[#E5DFD5]"
                />
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 bg-[#F5EFE6] border-t border-[#E5DFD5] flex items-center justify-between gap-3 shrink-0">
          <div>
            {stage === 'review' ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setStage('recording')}
                className="text-[#6B655E] hover:text-[#2D2A26]"
              >
                Voltar à fala
              </Button>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onOpenChange(false)}
                className="text-[#6B655E] hover:text-[#2D2A26]"
              >
                Cancelar
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {stage === 'recording' && (
              <Button
                type="button"
                size="sm"
                onClick={handleProcessWithAi}
                disabled={!spokenText.trim()}
                className="bg-gradient-to-r from-[#7A5C2E] to-[#C6A664] hover:opacity-90 text-white font-semibold px-5 shadow-sm"
              >
                <Sparkles className="h-4 w-4 mr-1.5" /> Interpretar com IA
              </Button>
            )}

            {stage === 'review' && (
              <Button
                type="button"
                size="sm"
                onClick={handleConfirmAndApply}
                className="bg-gradient-to-r from-[#2E7D4F] to-[#3B9E65] hover:opacity-95 text-white font-semibold px-6 shadow-md"
              >
                <CheckCircle2 className="h-4 w-4 mr-2" /> Preencher Formulário
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
