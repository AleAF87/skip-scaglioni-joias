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
} from 'lucide-react'
import { toast } from 'sonner'

export default function VoiceProductEntry() {
  // Voice transcription state
  const [isListening, setIsListening] = useState(false)
  const [transcribedText, setTranscribedText] = useState('')
  const [speechSupported, setSpeechSupported] = useState(true)
  const [isAiProcessing, setIsAiProcessing] = useState(false)
  const [recognitionInstance, setRecognitionInstance] = useState<any>(null)

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
  const [minimumQuantity, setMinimumQuantity] = useState<string>('3')
  const [observations, setObservations] = useState('')
  const [photos, setPhotos] = useState<File[]>([])
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([])

  // UI status
  const [missingFields, setMissingFields] = useState<string[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [recentProducts, setRecentProducts] = useState<Product[]>([])

  const fileInputRef = useRef<HTMLInputElement>(null)

  // Initialize Speech Recognition & Auxiliary data
  useEffect(() => {
    loadAuxiliaries()
    loadRecentProducts()
    generateSuggestedCode()

    // Setup Web Speech API
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition()
      recognition.continuous = false
      recognition.interimResults = true
      recognition.lang = 'pt-BR'

      recognition.onstart = () => {
        setIsListening(true)
      }

      recognition.onresult = (event: any) => {
        let currentTranscript = ''
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          currentTranscript += event.results[i][0].transcript
        }
        setTranscribedText(currentTranscript)
      }

      recognition.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error)
        setIsListening(false)
        if (event.error === 'not-allowed') {
          toast.error(
            'Permissão de microfone negada. Habilite o microfone nas permissões do navegador para usar o comando por voz.',
          )
        } else if (event.error === 'no-speech') {
          toast.info('Nenhuma fala detectada. Toque no microfone e fale com clareza.')
        } else {
          toast.warning('Falha na captura de voz. Tente novamente ou digite a descrição.')
        }
      }

      recognition.onend = () => {
        setIsListening(false)
      }

      setRecognitionInstance(recognition)
    } else {
      setSpeechSupported(false)
    }
  }, [])

  const generateSuggestedCode = () => {
    const random = Math.floor(1000 + Math.random() * 9000)
    setCode(`JOIA-${random}`)
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

  // Toggle main speech recognition
  const toggleListening = () => {
    if (!speechSupported) {
      toast.warning('Seu navegador não suporta reconhecimento de voz. Por favor, digite o texto.')
      return
    }

    if (isListening) {
      recognitionInstance?.stop()
      setIsListening(false)
    } else {
      setTranscribedText('')
      try {
        recognitionInstance?.start()
      } catch (err) {
        console.error('Start recognition failed:', err)
      }
    }
  }

  // Process text with Skip AI Gateway (fast model)
  const handleProcessWithAi = async () => {
    const textToAnalyze = transcribedText.trim()
    if (!textToAnalyze) {
      toast.error('Grave ou digite uma descrição falada antes de interpretar com IA.')
      return
    }

    setIsAiProcessing(true)
    try {
      const result = await productService.interpretVoiceDescription(textToAnalyze)

      // Apply interpreted values to state without overwriting non-empty fields arbitrarily
      if (result.description) setDescription(result.description)
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
      }
      if (result.observations) {
        setObservations((prev) => (prev ? `${prev} | ${result.observations}` : result.observations))
      }

      setMissingFields(result.missing_fields || [])

      if (result.missing_fields && result.missing_fields.length > 0) {
        toast.info(
          'Descrição interpretada! Alguns campos não foram detectados na fala e precisam ser preenchidos manualmente.',
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
      setIsDictatingNotes(false)
    } else {
      const notesRec = new SpeechRecognition()
      notesRec.lang = 'pt-BR'
      notesRec.onstart = () => setIsDictatingNotes(true)
      notesRec.onresult = (ev: any) => {
        const transcript = ev.results[0][0].transcript
        setObservations((prev) => (prev ? `${prev} ${transcript}` : transcript))
      }
      notesRec.onerror = () => setIsDictatingNotes(false)
      notesRec.onend = () => setIsDictatingNotes(false)
      notesRec.start()
    }
  }

  // Clear form with confirmation
  const handleClearForm = () => {
    if (window.confirm('Deseja limpar todos os campos preenchidos?')) {
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
          </div>
          <p className="text-sm text-[#6B655E] mt-1">
            Fale a descrição da joia em uma frase e a IA estruturará o cadastro. Revise sempre antes
            de salvar.
          </p>
        </div>

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
            Descreva a joia falando pelo celular
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
          {/* Giant Microphone Recording Button */}
          <div className="flex flex-col items-center justify-center py-4">
            <button
              type="button"
              onClick={toggleListening}
              className={`relative h-24 w-24 md:h-28 md:w-28 rounded-full flex items-center justify-center text-white transition-all duration-300 shadow-xl ${
                isListening
                  ? 'bg-[#B3261E] ring-8 ring-[#B3261E]/30 animate-pulse scale-105'
                  : 'bg-gradient-to-tr from-[#7A5C2E] via-[#C6A664] to-[#E8D5A3] hover:scale-105 hover:shadow-2xl'
              }`}
            >
              {isListening ? (
                <MicOff className="h-10 w-10 md:h-12 md:w-12 animate-bounce" />
              ) : (
                <Mic className="h-10 w-10 md:h-12 md:w-12" />
              )}
            </button>
            <p className="mt-3 text-sm font-semibold text-[#2D2A26]">
              {isListening ? (
                <span className="text-[#B3261E] flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-[#B3261E] animate-ping" /> Ouvindo você
                  falar... Toque para pausar
                </span>
              ) : (
                'Toque para começar a falar'
              )}
            </p>
            {!speechSupported && (
              <p className="text-xs text-[#B3261E] mt-1">
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
              {transcribedText && (
                <span className="text-xs text-[#7A5C2E] font-medium">
                  {transcribedText.split(' ').filter(Boolean).length} palavras
                </span>
              )}
            </div>
            <Textarea
              value={transcribedText}
              onChange={(e) => setTranscribedText(e.target.value)}
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
                                  ? 'Público'
                                  : f}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Main Review and Save Form */}
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
                  placeholder="Ex: JOIA-1020"
                  required
                  className="mt-1 border-[#E5DFD5] focus-visible:ring-[#C6A664] uppercase font-mono font-bold"
                />
              </div>

              <div className="md:col-span-2">
                <Label htmlFor="desc" className="text-xs font-semibold text-[#2D2A26]">
                  Descrição da Joia *
                </Label>
                <Input
                  id="desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Ex: Brinco folheado a ouro com zircônia redonda"
                  required
                  className="mt-1 border-[#E5DFD5] focus-visible:ring-[#C6A664]"
                />
              </div>
            </div>

            {/* Row 2: Type, Material, Size, Audience */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <Label className="text-xs font-semibold text-[#2D2A26]">Tipo de Joia</Label>
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
                <Label className="text-xs font-semibold text-[#2D2A26]">Tamanho / Medida</Label>
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

              <div>
                <Label className="text-xs font-semibold text-[#2D2A26]">Público / Sexo</Label>
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
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder="1"
                  required
                  className="mt-1 bg-white border-[#E5DFD5] focus-visible:ring-[#C6A664] font-semibold"
                />
              </div>

              <div>
                <Label htmlFor="minQty" className="text-xs font-semibold text-[#6B655E]">
                  Alerta Estoque Mínimo
                </Label>
                <Input
                  id="minQty"
                  type="number"
                  min="0"
                  step="1"
                  value={minimumQuantity}
                  onChange={(e) => setMinimumQuantity(e.target.value)}
                  placeholder="3"
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

      {/* Recently Added Products List */}
      <div className="pt-6 border-t border-[#E5DFD5]">
        <h2 className="font-serif text-lg md:text-xl font-bold text-[#2D2A26] mb-4 flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-[#C6A664]" />
          Produtos Cadastrados Recentemente
        </h2>

        {recentProducts.length === 0 ? (
          <p className="text-sm text-[#6B655E] italic">Nenhum produto cadastrado ainda.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {recentProducts.map((p) => {
              const photo =
                p.photos && p.photos.length > 0 ? getFileUrl('products', p.id, p.photos[0]) : null
              return (
                <Card
                  key={p.id}
                  className="border-[#E5DFD5] bg-white overflow-hidden shadow-xs hover:shadow-md transition-shadow"
                >
                  <div className="flex items-center p-3 gap-3">
                    <div className="h-16 w-16 rounded-lg bg-[#F3EAD8] overflow-hidden flex items-center justify-center shrink-0 border border-[#E5DFD5]">
                      {photo ? (
                        <img
                          src={photo}
                          alt={p.description}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <PackageCheck className="h-7 w-7 text-[#C6A664]" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs font-bold text-[#7A5C2E]">{p.code}</span>
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                          {p.quantity} em estoque
                        </Badge>
                      </div>
                      <p className="text-sm font-semibold text-[#2D2A26] truncate mt-0.5">
                        {p.description}
                      </p>
                      <p className="text-xs font-bold text-[#2E7D4F] mt-1">
                        {formatCurrency(p.selling_price)}
                      </p>
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
