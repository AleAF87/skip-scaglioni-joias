import React, { useState, useEffect } from 'react'
import {
  productCreationService,
  CreateProductPayload,
  StockDistributionItem,
  ProductVariationInput,
  GalleryImageItem,
} from '@/services/productCreationService'
import { productService } from '@/services/productService'
import { Brand, Reseller, ProductCategory, Product } from '@/types'
import { GalleryManager } from './GalleryManager'
import { VariationsManager } from './VariationsManager'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import {
  PackagePlus,
  Loader2,
  AlertCircle,
  Tag,
  DollarSign,
  Image as ImageIcon,
  Globe,
  Boxes,
  Layers,
  Plus,
  Lock,
  Check,
  X,
} from 'lucide-react'
import { toast } from 'sonner'

interface ProductCreateModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: (newProduct: Product) => void
}

export function ProductCreateModal({ open, onOpenChange, onSuccess }: ProductCreateModalProps) {
  const [isLoadingMeta, setIsLoadingMeta] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  // Metadados auxiliares
  const [brands, setBrands] = useState<Brand[]>([])
  const [resellers, setResellers] = useState<Reseller[]>([])
  const [categories, setCategories] = useState<ProductCategory[]>([])
  const [knownSuppliers, setKnownSuppliers] = useState<string[]>([])

  // Inline criação de Marca
  const [isCreatingBrand, setIsCreatingBrand] = useState(false)
  const [newBrandName, setNewBrandName] = useState('')

  // Inline criação de Fornecedor
  const [isAddingSupplier, setIsAddingSupplier] = useState(false)
  const [newSupplierName, setNewSupplierName] = useState('')

  // 1. Identificação
  const [produtoId, setProdutoId] = useState('')
  const [nomeProduto, setNomeProduto] = useState('')
  const [skuNovoPreview, setSkuNovoPreview] = useState('')
  const [codigoBarras, setCodigoBarras] = useState('')
  const [barcodeError, setBarcodeError] = useState('')
  const [marcaId, setMarcaId] = useState('')
  const [fornecedor, setFornecedor] = useState('')
  const [categoriaIds, setCategoriaIds] = useState<string[]>([])
  const [description, setDescription] = useState('')

  // 2. Valores
  const [custoUnitario, setCustoUnitario] = useState<number | ''>('')
  const [precoVenda, setPrecoVenda] = useState<number | ''>('')
  const [precoPromocional, setPrecoPromocional] = useState<number | ''>('')
  const [priceError, setPriceError] = useState('')

  // 3. Imagens e medidas
  const [galleryImages, setGalleryImages] = useState<GalleryImageItem[]>([])
  const [alturaCm, setAlturaCm] = useState<number | ''>('')
  const [larguraCm, setLarguraCm] = useState<number | ''>('')
  const [comprimentoCm, setComprimentoCm] = useState<number | ''>('')
  const [pesoG, setPesoG] = useState<number | ''>('')

  // 4. Estoque Inicial
  const [quantidadeInicial, setQuantidadeInicial] = useState<number>(0)

  // 5. E-commerce
  const [publicarNoEcommerce, setPublicarNoEcommerce] = useState(false)
  const [destaqueEcommerce, setDestaqueEcommerce] = useState(false)
  const [slug, setSlug] = useState('')
  const [qtdeLojaVirtual, setQtdeLojaVirtual] = useState<number>(0)
  const [ecommerceQtyError, setEcommerceQtyError] = useState('')

  // 6. Variações
  const [hasVariations, setHasVariations] = useState(false)
  const [variations, setVariations] = useState<ProductVariationInput[]>([])

  // Carrega metadados e inicializa campos ao abrir
  useEffect(() => {
    if (open) {
      loadMetaAndInitialize()
    }
  }, [open])

  const loadMetaAndInitialize = async () => {
    setIsLoadingMeta(true)
    try {
      // Gera Produto ID único
      const generatedProdId = productCreationService.generateProductIdentifier()
      setProdutoId(generatedProdId)

      // Preview do SKU Novo sequencial atômico do sistema (10000...)
      const nextSku = await productService.getNextProductCode()
      setSkuNovoPreview(nextSku)

      // Carrega auxiliares
      const [brandList, resList, catList, supList] = await Promise.all([
        productCreationService.getBrands(),
        productCreationService.getActiveResellers(),
        productCreationService.getCategories(),
        productCreationService.getKnownSuppliers(),
      ])

      setBrands(brandList)
      setResellers(resList)
      setCategories(catList)

      // Garante 'Scaglioni Joias' na lista de fornecedores conhecidos
      const suppliersSet = new Set(supList)
      suppliersSet.add('Scaglioni Joias')
      const mergedSuppliers = Array.from(suppliersSet).sort()
      setKnownSuppliers(mergedSuppliers)

      // Marca padrão: 'Scaglioni' (ou correspondente)
      const scaglioniBrand =
        brandList.find((b) => b.name.toLowerCase().trim() === 'scaglioni') ||
        brandList.find((b) => b.name.toLowerCase().includes('scaglioni'))
      if (scaglioniBrand) {
        setMarcaId(scaglioniBrand.id)
      } else if (brandList.length > 0) {
        setMarcaId(brandList[0].id)
      }

      // Fornecedor padrão: 'Scaglioni Joias'
      setFornecedor('Scaglioni Joias')

      // Reset de campos
      setNomeProduto('')
      setCodigoBarras('')
      setBarcodeError('')
      setCategoriaIds([])
      setDescription('')
      setCustoUnitario('')
      setPrecoVenda('')
      setPrecoPromocional('')
      setPriceError('')
      setGalleryImages([])
      setAlturaCm('')
      setLarguraCm('')
      setComprimentoCm('')
      setPesoG('')
      setPublicarNoEcommerce(false)
      setDestaqueEcommerce(false)
      setSlug('')
      setQuantidadeInicial(0)
      setQtdeLojaVirtual(0)
      setEcommerceQtyError('')
      setHasVariations(false)
      setVariations([])
    } catch (err) {
      console.error('Erro ao inicializar modal de cadastro:', err)
      toast.error('Erro ao carregar dados auxiliares do sistema.')
    } finally {
      setIsLoadingMeta(false)
    }
  }

  // Gera slug automaticamente a partir do nome
  useEffect(() => {
    if (!nomeProduto.trim()) {
      setSlug('')
      return
    }
    const timer = setTimeout(async () => {
      const generated = await productCreationService.generateUniqueSlug(nomeProduto)
      setSlug(generated)
    }, 250)
    return () => clearTimeout(timer)
  }, [nomeProduto])

  // Desabilita destaque no e-commerce se publicar for Não
  useEffect(() => {
    if (!publicarNoEcommerce) {
      setDestaqueEcommerce(false)
    }
  }, [publicarNoEcommerce])

  // Valida quantidade e-commerce em relação à quantidade inicial
  const handleQuantidadeInicialChange = (val: number) => {
    setQuantidadeInicial(val)
    if (qtdeLojaVirtual > val) {
      setEcommerceQtyError(
        `A quantidade para e-commerce (${qtdeLojaVirtual}) não pode exceder a quantidade inicial (${val}).`,
      )
    } else {
      setEcommerceQtyError('')
    }
  }

  const handleQtdeLojaVirtualChange = (val: number) => {
    setQtdeLojaVirtual(val)
    if (val > quantidadeInicial) {
      setEcommerceQtyError(
        `A quantidade para e-commerce (${val}) não pode exceder a quantidade inicial (${quantidadeInicial}).`,
      )
    } else {
      setEcommerceQtyError('')
    }
  }

  // Validação de código de barras inline
  const handleBarcodeBlur = async () => {
    if (!codigoBarras.trim()) {
      setBarcodeError('')
      return
    }
    const isUnique = await productCreationService.checkBarcodeUnique(codigoBarras)
    if (!isUnique) {
      setBarcodeError('Código de barras já cadastrado em outro produto.')
    } else {
      setBarcodeError('')
    }
  }

  // Validação de preço promocional
  const validatePrices = (): boolean => {
    const sell = Number(precoVenda) || 0
    const promo = Number(precoPromocional) || 0

    if (promo > 0 && promo >= sell) {
      setPriceError('O preço promocional deve ser estritamente menor que o preço de venda.')
      return false
    }
    setPriceError('')
    return true
  }

  // Cadastro inline de Marca
  const handleCreateBrandInline = async () => {
    if (!newBrandName.trim()) return
    try {
      const created = await productCreationService.createBrandInline(newBrandName)
      setBrands((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)))
      setMarcaId(created.id)
      setNewBrandName('')
      setIsCreatingBrand(false)
      toast.success(`Marca "${created.name}" cadastrada!`)
    } catch (err: any) {
      toast.error('Erro ao cadastrar marca: ' + (err.message || ''))
    }
  }

  // Toggle Categoria no Multi-Select
  const toggleCategory = (catId: string) => {
    setCategoriaIds((prev) =>
      prev.includes(catId) ? prev.filter((id) => id !== catId) : [...prev, catId],
    )
  }

  // Validação final e Salvar
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()

    // 1. Validações de Identificação
    if (!nomeProduto.trim()) {
      toast.error('O Nome do produto é obrigatório.')
      return
    }

    if (barcodeError) {
      toast.error('Corrija o código de barras duplicado antes de salvar.')
      return
    }

    // 2. Validações de Valores
    if (!precoVenda || Number(precoVenda) <= 0) {
      toast.error('O Preço de venda é obrigatório e deve ser maior que zero.')
      return
    }

    if (!validatePrices()) {
      toast.error('Preço promocional não pode ser maior ou igual ao preço de venda.')
      return
    }

    // 3. Validação de Imagem obrigatória para E-commerce
    if (publicarNoEcommerce && galleryImages.length === 0) {
      toast.error('A imagem principal é obrigatória quando "Publicar no e-commerce" estiver Sim.')
      return
    }

    // 4. Validação do Estoque Inicial e E-commerce
    if (quantidadeInicial < 0) {
      toast.error('A Quantidade inicial deve ser maior ou igual a zero.')
      return
    }

    if (qtdeLojaVirtual < 0) {
      toast.error('A quantidade de e-commerce deve ser maior ou igual a zero.')
      return
    }

    if (qtdeLojaVirtual > quantidadeInicial) {
      toast.error(
        `A quantidade para e-commerce (${qtdeLojaVirtual}) não pode exceder a quantidade inicial (${quantidadeInicial}).`,
      )
      return
    }

    if (hasVariations) {
      if (variations.length === 0) {
        toast.error('Adicione ao menos uma variação ou desmarque a opção de variações.')
        return
      }

      for (let i = 0; i < variations.length; i++) {
        const v = variations[i]
        if (!v.attributeValue.trim()) {
          toast.error(`Informe o valor do atributo na variação #${i + 1}.`)
          return
        }
        if (!v.price || v.price <= 0) {
          toast.error(`Preço de venda inválido na variação #${i + 1}.`)
          return
        }
      }
    }

    // Preparar payload
    const payload: CreateProductPayload = {
      produto_id: produtoId,
      nome_produto: nomeProduto,
      codigo_barras: codigoBarras.trim() || undefined,
      marca_id: marcaId || undefined,
      fornecedor: fornecedor.trim() || undefined,
      categoria_ids: categoriaIds,
      description: description.trim() || nomeProduto.trim(),
      custo_unitario: typeof custoUnitario === 'number' ? custoUnitario : undefined,
      selling_price: Number(precoVenda),
      preco_promocional: typeof precoPromocional === 'number' ? precoPromocional : undefined,
      altura_cm: typeof alturaCm === 'number' ? alturaCm : undefined,
      largura_cm: typeof larguraCm === 'number' ? larguraCm : undefined,
      comprimento_cm: typeof comprimentoCm === 'number' ? comprimentoCm : undefined,
      peso_g: typeof pesoG === 'number' ? pesoG : undefined,
      publicar_no_ecommerce: publicarNoEcommerce,
      destaque_ecommerce: publicarNoEcommerce && destaqueEcommerce,
      slug: slug || productCreationService.slugify(nomeProduto),
      qtde_inicial: quantidadeInicial,
      qtde_loja_virtual: qtdeLojaVirtual,
      has_variations: hasVariations,
      variations,
      galleryImages,
    }

    setIsSaving(true)
    try {
      const created = await productCreationService.saveFullProduct(payload)
      toast.success(
        `Produto "${created.nome_produto || created.description}" cadastrado com sucesso!`,
      )
      onSuccess(created)
      onOpenChange(false)
    } catch (err: any) {
      console.error('Erro ao salvar produto:', err)
      toast.error('Erro ao salvar produto: ' + (err.message || 'Verifique os dados digitados.'))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto bg-white p-0 gap-0 border-[#E5DFD5]">
        <DialogHeader className="p-6 border-b border-[#E5DFD5] bg-gradient-to-r from-white via-[#FDFBF7] to-white sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <span className="p-2.5 rounded-xl bg-gradient-to-tr from-[#7A5C2E]/20 via-[#C6A664]/30 to-[#E8D5A3]/40 text-[#7A5C2E] shadow-xs">
              <PackagePlus className="h-6 w-6" />
            </span>
            <div>
              <DialogTitle className="font-serif text-xl sm:text-2xl font-bold text-[#2D2A26]">
                Adicionar novo produto
              </DialogTitle>
              <DialogDescription className="text-xs text-[#6B655E]">
                Scaglioni Joias • Cadastro completo com códigos automáticos, precificação e estoque
                inicial
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {isLoadingMeta ? (
          <div className="py-20 flex flex-col items-center justify-center text-[#6B655E] gap-2">
            <Loader2 className="h-7 w-7 animate-spin text-[#C6A664]" />
            <span className="text-sm font-medium">Preparando formulário e gerando códigos...</span>
          </div>
        ) : (
          <form onSubmit={handleSave} className="p-6 space-y-8">
            {/* SEÇÃO 1: IDENTIFICAÇÃO */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 border-b border-[#E5DFD5] pb-2">
                <Tag className="h-4 w-4 text-[#7A5C2E]" />
                <h3 className="font-serif text-sm font-bold uppercase tracking-wider text-[#2D2A26]">
                  1. Identificação
                </h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* SKU Novo */}
                <div>
                  <label className="text-xs font-semibold text-[#2D2A26] flex items-center gap-1 mb-1">
                    <Lock className="h-3 w-3 text-[#8C8275]" /> SKU novo (bloqueado)
                  </label>
                  <Input
                    value={skuNovoPreview ? `${skuNovoPreview} (sequência)` : 'Gerando...'}
                    readOnly
                    disabled
                    className="h-10 text-xs bg-[#F3EAD8]/40 font-mono text-[#7A5C2E] font-bold"
                  />
                  <span className="text-[10px] text-[#8C8275]">
                    Sequencial do sistema (10000+), sem zeros à esquerda
                  </span>
                </div>

                {/* Código de barras */}
                <div>
                  <label className="text-xs font-semibold text-[#2D2A26] block mb-1">
                    Código de barras (opcional)
                  </label>
                  <Input
                    value={codigoBarras}
                    onChange={(e) => {
                      setCodigoBarras(e.target.value)
                      setBarcodeError('')
                    }}
                    onBlur={handleBarcodeBlur}
                    placeholder="Ex: 7891234567890"
                    className={`h-10 text-xs ${barcodeError ? 'border-red-500' : ''}`}
                  />
                  {barcodeError ? (
                    <span className="text-[11px] text-red-600 font-medium block mt-0.5">
                      {barcodeError}
                    </span>
                  ) : (
                    <span className="text-[10px] text-[#8C8275]">Validado contra duplicidades</span>
                  )}
                </div>
              </div>

              {/* Categorias (Multi-select agrupado com Tipo antes de Metal) */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-[#2D2A26]">
                    Categorias (Tipo e Metal)
                  </label>
                  <span className="text-[11px] font-medium text-[#7A5C2E]">
                    {categoriaIds.length} selecionada(s)
                  </span>
                </div>
                <div className="p-3.5 rounded-xl border border-[#E5DFD5] bg-[#FDFBF7] space-y-3 max-h-52 overflow-y-auto">
                  {/* Grupo Tipo (vem ANTES do grupo Metal conforme solicitado) */}
                  <div>
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-[#7A5C2E]" />
                      <span className="text-[11px] font-bold uppercase tracking-wider text-[#7A5C2E]">
                        Tipo
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 pl-3">
                      {categories
                        .filter((c) => c.group !== 'metal')
                        .map((cat) => {
                          const isSelected = categoriaIds.includes(cat.id)
                          return (
                            <button
                              key={cat.id}
                              type="button"
                              onClick={() => toggleCategory(cat.id)}
                              className={`text-xs px-2.5 py-1 rounded-lg border font-medium transition-all flex items-center gap-1.5 ${
                                isSelected
                                  ? 'bg-[#7A5C2E] text-white border-[#7A5C2E] shadow-xs'
                                  : 'bg-white text-[#6B655E] border-[#E5DFD5] hover:border-[#C6A664]'
                              }`}
                            >
                              {cat.name}
                              {isSelected && <Check className="h-3 w-3" />}
                            </button>
                          )
                        })}
                      {categories.filter((c) => c.group !== 'metal').length === 0 && (
                        <span className="text-[11px] text-[#8C8275] italic">
                          Nenhum tipo cadastrado ainda.
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Grupo Metal (vem logo antes do Nome do produto) */}
                  <div className="pt-1.5 border-t border-[#E5DFD5]/70">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-[#C6A664]" />
                      <span className="text-[11px] font-bold uppercase tracking-wider text-[#7A5C2E]">
                        Metal
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 pl-3">
                      {categories
                        .filter((c) => c.group === 'metal')
                        .map((cat) => {
                          const isSelected = categoriaIds.includes(cat.id)
                          return (
                            <button
                              key={cat.id}
                              type="button"
                              onClick={() => toggleCategory(cat.id)}
                              className={`text-xs px-2.5 py-1 rounded-lg border font-medium transition-all flex items-center gap-1.5 ${
                                isSelected
                                  ? 'bg-[#7A5C2E] text-white border-[#7A5C2E] shadow-xs'
                                  : 'bg-white text-[#6B655E] border-[#E5DFD5] hover:border-[#C6A664]'
                              }`}
                            >
                              {cat.name}
                              {isSelected && <Check className="h-3 w-3" />}
                            </button>
                          )
                        })}
                      {categories.filter((c) => c.group === 'metal').length === 0 && (
                        <span className="text-[11px] text-[#8C8275] italic">
                          Nenhum metal cadastrado ainda.
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <span className="text-[10px] text-[#8C8275]">
                  Selecione as categorias de Tipo e Metal da joia.
                </span>
              </div>

              {/* Nome do produto (posicionado imediatamente após o grupo Metal) */}
              <div>
                <label className="text-xs font-semibold text-[#2D2A26] block mb-1">
                  Nome do produto <span className="text-[#B3261E]">*</span>
                </label>
                <Input
                  value={nomeProduto}
                  onChange={(e) => setNomeProduto(e.target.value)}
                  placeholder="Ex: Anel Solitário Ouro 18k com Zircônia"
                  className="h-11 text-sm font-medium"
                  required
                />
              </div>

              {/* Marca e Fornecedor */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Marca */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-[#2D2A26]">Marca</label>
                    <button
                      type="button"
                      onClick={() => setIsCreatingBrand(!isCreatingBrand)}
                      className="text-[11px] text-[#7A5C2E] hover:underline font-semibold"
                    >
                      {isCreatingBrand ? 'Cancelar' : '+ Nova marca inline'}
                    </button>
                  </div>

                  {isCreatingBrand ? (
                    <div className="flex items-center gap-1.5">
                      <Input
                        value={newBrandName}
                        onChange={(e) => setNewBrandName(e.target.value)}
                        placeholder="Nome da nova marca..."
                        className="h-9 text-xs"
                      />
                      <Button
                        type="button"
                        size="sm"
                        onClick={handleCreateBrandInline}
                        className="h-9 bg-[#7A5C2E] text-white"
                      >
                        Salvar
                      </Button>
                    </div>
                  ) : (
                    <select
                      value={marcaId}
                      onChange={(e) => setMarcaId(e.target.value)}
                      className="w-full h-10 px-3 text-xs rounded-md border border-[#E5DFD5] bg-white text-[#2D2A26]"
                    >
                      <option value="">Selecione uma marca...</option>
                      {brands.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Fornecedor */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-[#2D2A26]">Fornecedor</label>
                    <button
                      type="button"
                      onClick={() => setIsAddingSupplier(!isAddingSupplier)}
                      className="text-[11px] text-[#7A5C2E] hover:underline font-semibold"
                    >
                      {isAddingSupplier ? 'Selecionar existente' : '+ Novo fornecedor inline'}
                    </button>
                  </div>

                  {isAddingSupplier ? (
                    <Input
                      value={newSupplierName}
                      onChange={(e) => {
                        setNewSupplierName(e.target.value)
                        setFornecedor(e.target.value)
                      }}
                      placeholder="Nome do novo fornecedor..."
                      className="h-10 text-xs"
                    />
                  ) : (
                    <select
                      value={fornecedor}
                      onChange={(e) => setFornecedor(e.target.value)}
                      className="w-full h-10 px-3 text-xs rounded-md border border-[#E5DFD5] bg-white text-[#2D2A26]"
                    >
                      <option value="">Selecione ou digite...</option>
                      {knownSuppliers.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              {/* Descrição */}
              <div>
                <label className="text-xs font-semibold text-[#2D2A26] block mb-1">
                  Descrição do produto (texto longo com parágrafos)
                </label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Descreva detalhes, acabamento, banho, cuidados e características da joia..."
                  rows={3}
                  className="text-xs leading-relaxed"
                />
              </div>
            </div>

            {/* SEÇÃO 2: VALORES */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 border-b border-[#E5DFD5] pb-2">
                <DollarSign className="h-4 w-4 text-[#7A5C2E]" />
                <h3 className="font-serif text-sm font-bold uppercase tracking-wider text-[#2D2A26]">
                  2. Valores
                </h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* Custo unitário */}
                <div>
                  <label className="text-xs font-semibold text-[#2D2A26] block mb-1">
                    Custo unitário (R$, opcional)
                  </label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={custoUnitario}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value)
                      setCustoUnitario(isNaN(v) ? '' : v)
                    }}
                    placeholder="0,00"
                    className="h-10 text-xs font-mono font-semibold"
                  />
                </div>

                {/* Preço de venda */}
                <div>
                  <label className="text-xs font-semibold text-[#2D2A26] block mb-1">
                    Preço de venda (R$) <span className="text-[#B3261E]">*</span>
                  </label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={precoVenda}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value)
                      setPrecoVenda(isNaN(v) ? '' : v)
                    }}
                    onBlur={validatePrices}
                    placeholder="0,00"
                    className="h-10 text-xs font-mono font-bold text-[#2E7D4F]"
                    required
                  />
                </div>

                {/* Preço promocional */}
                <div>
                  <label className="text-xs font-semibold text-[#2D2A26] block mb-1">
                    Preço promocional (R$, opcional)
                  </label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={precoPromocional}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value)
                      setPrecoPromocional(isNaN(v) ? '' : v)
                    }}
                    onBlur={validatePrices}
                    placeholder="0,00"
                    className={`h-10 text-xs font-mono font-semibold ${
                      priceError ? 'border-red-500' : ''
                    }`}
                  />
                  {priceError ? (
                    <span className="text-[11px] text-red-600 font-medium block mt-0.5">
                      {priceError}
                    </span>
                  ) : (
                    <span className="text-[10px] text-[#8C8275]">
                      Deve ser menor que o preço de venda
                    </span>
                  )}
                </div>
              </div>
              <p className="text-[11px] text-[#8C8275] italic">
                * Qualquer alteração futura de valores criará automaticamente um registro no
                histórico de preços.
              </p>
            </div>

            {/* SEÇÃO 3: IMAGENS E MEDIDAS */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 border-b border-[#E5DFD5] pb-2">
                <ImageIcon className="h-4 w-4 text-[#7A5C2E]" />
                <h3 className="font-serif text-sm font-bold uppercase tracking-wider text-[#2D2A26]">
                  3. Imagens e Medidas
                </h3>
              </div>

              {/* Galeria com ordenação e definição de principal */}
              <GalleryManager
                images={galleryImages}
                onChange={setGalleryImages}
                isEcommercePublished={publicarNoEcommerce}
              />

              {/* Medidas */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                <div>
                  <label className="text-xs font-semibold text-[#2D2A26] block mb-1">
                    Altura (cm)
                  </label>
                  <Input
                    type="number"
                    step="0.1"
                    min="0"
                    value={alturaCm}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value)
                      setAlturaCm(isNaN(v) ? '' : v)
                    }}
                    placeholder="0.0"
                    className="h-9 text-xs"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-[#2D2A26] block mb-1">
                    Largura (cm)
                  </label>
                  <Input
                    type="number"
                    step="0.1"
                    min="0"
                    value={larguraCm}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value)
                      setLarguraCm(isNaN(v) ? '' : v)
                    }}
                    placeholder="0.0"
                    className="h-9 text-xs"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-[#2D2A26] block mb-1">
                    Comprimento (cm)
                  </label>
                  <Input
                    type="number"
                    step="0.1"
                    min="0"
                    value={comprimentoCm}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value)
                      setComprimentoCm(isNaN(v) ? '' : v)
                    }}
                    placeholder="0.0"
                    className="h-9 text-xs"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-[#2D2A26] block mb-1">
                    Peso (gramas)
                  </label>
                  <Input
                    type="number"
                    step="0.1"
                    min="0"
                    value={pesoG}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value)
                      setPesoG(isNaN(v) ? '' : v)
                    }}
                    placeholder="0.0"
                    className="h-9 text-xs"
                  />
                </div>
              </div>
            </div>

            {/* SEÇÃO 4: ESTOQUE INICIAL */}
            {!hasVariations && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 border-b border-[#E5DFD5] pb-2">
                  <Boxes className="h-4 w-4 text-[#7A5C2E]" />
                  <h3 className="font-serif text-sm font-bold uppercase tracking-wider text-[#2D2A26]">
                    4. Estoque Inicial
                  </h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-[#2D2A26] block mb-1">
                      Quantidade inicial <span className="text-[#B3261E]">*</span>
                    </label>
                    <Input
                      type="number"
                      min="0"
                      step="1"
                      value={quantidadeInicial}
                      onChange={(e) => {
                        const v = parseInt(e.target.value, 10)
                        handleQuantidadeInicialChange(isNaN(v) ? 0 : Math.max(0, v))
                      }}
                      className="h-10 text-sm font-mono font-bold"
                      required
                    />
                    <span className="text-[10px] text-[#8C8275]">
                      Número inteiro maior ou igual a zero
                    </span>
                  </div>

                  <div className="sm:col-span-2 pt-2 sm:pt-0">
                    <p className="text-xs text-[#6B655E] leading-relaxed">
                      A quantidade informada entra como estoque da peça. O valor reservado para o
                      e-commerce (seção 5) define as unidades separadas para a loja virtual, ficando
                      o restante no estoque geral da loja física.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* SEÇÃO 5: E-COMMERCE */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 border-b border-[#E5DFD5] pb-2">
                <Globe className="h-4 w-4 text-[#7A5C2E]" />
                <h3 className="font-serif text-sm font-bold uppercase tracking-wider text-[#2D2A26]">
                  5. E-commerce
                </h3>
              </div>

              {/* Quantidade separada para e-commerce */}
              <div className="p-4 rounded-xl border border-[#E5DFD5] bg-[#FDFBF7] space-y-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
                  <div>
                    <label className="text-xs font-bold text-[#2D2A26] block mb-1">
                      Quantidade para e-commerce (Loja Virtual)
                    </label>
                    <span className="text-[11px] text-[#6B655E] block">
                      Unidades separadas exclusivamente para a loja virtual (no máximo igual à
                      Quantidade inicial: {quantidadeInicial} un.).
                    </span>
                  </div>

                  <div>
                    <Input
                      type="number"
                      min="0"
                      max={quantidadeInicial}
                      step="1"
                      value={qtdeLojaVirtual}
                      onChange={(e) => {
                        const v = parseInt(e.target.value, 10)
                        handleQtdeLojaVirtualChange(isNaN(v) ? 0 : Math.max(0, v))
                      }}
                      className={`h-10 text-sm font-mono font-bold ${
                        ecommerceQtyError ? 'border-red-500 ring-1 ring-red-500' : ''
                      }`}
                    />
                    {ecommerceQtyError ? (
                      <span className="text-[11px] text-red-600 font-semibold block mt-1 flex items-center gap-1">
                        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                        {ecommerceQtyError}
                      </span>
                    ) : (
                      <span className="text-[10px] text-[#8C8275] block mt-1">
                        Restante no estoque geral:{' '}
                        {Math.max(0, quantidadeInicial - qtdeLojaVirtual)} un.
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Publicar no e-commerce */}
                <div className="p-3.5 rounded-xl border border-[#E5DFD5] bg-[#FDFBF7] flex items-center justify-between">
                  <div>
                    <label className="text-xs font-bold text-[#2D2A26] block">
                      Publicar no e-commerce
                    </label>
                    <span className="text-[11px] text-[#6B655E]">
                      Habilita o produto na vitrine e catálogo online
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-[#7A5C2E]">
                      {publicarNoEcommerce ? 'Sim' : 'Não'}
                    </span>
                    <Switch
                      checked={publicarNoEcommerce}
                      onCheckedChange={setPublicarNoEcommerce}
                    />
                  </div>
                </div>

                {/* Destaque no e-commerce */}
                <div
                  className={`p-3.5 rounded-xl border transition-all flex items-center justify-between ${
                    !publicarNoEcommerce
                      ? 'border-[#E5DFD5]/60 bg-gray-50/50 opacity-60'
                      : 'border-[#E5DFD5] bg-[#FDFBF7]'
                  }`}
                >
                  <div>
                    <label className="text-xs font-bold text-[#2D2A26] block">
                      Destaque no e-commerce
                    </label>
                    <span className="text-[11px] text-[#6B655E]">
                      Exibe em carrosséis e banners de destaque
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-[#7A5C2E]">
                      {destaqueEcommerce ? 'Sim' : 'Não'}
                    </span>
                    <Switch
                      checked={destaqueEcommerce}
                      onCheckedChange={setDestaqueEcommerce}
                      disabled={!publicarNoEcommerce}
                    />
                  </div>
                </div>
              </div>

              {/* Slug gerado */}
              <div>
                <label className="text-xs font-semibold text-[#2D2A26] flex items-center gap-1 mb-1">
                  <Lock className="h-3 w-3 text-[#8C8275]" /> Slug (somente leitura e bloqueado)
                </label>
                <Input
                  value={slug}
                  readOnly
                  disabled
                  placeholder="gerado-automaticamente-a-partir-do-nome"
                  className="h-10 text-xs bg-[#F3EAD8]/40 font-mono text-[#7A5C2E] font-semibold"
                />
                <span className="text-[10px] text-[#8C8275]">
                  URL amigável gerada sem acentos e espaços por hífen. O e-commerce usa o próprio
                  nome do produto como título.
                </span>
              </div>
            </div>

            {/* SEÇÃO 6: VARIAÇÕES */}
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-[#E5DFD5] pb-2">
                <div className="flex items-center gap-2">
                  <Layers className="h-4 w-4 text-[#7A5C2E]" />
                  <h3 className="font-serif text-sm font-bold uppercase tracking-wider text-[#2D2A26]">
                    6. Variações
                  </h3>
                </div>

                <div className="flex items-center gap-2">
                  <label className="text-xs font-semibold text-[#2D2A26] cursor-pointer">
                    Este produto possui variações
                  </label>
                  <Switch checked={hasVariations} onCheckedChange={setHasVariations} />
                </div>
              </div>

              {hasVariations && (
                <VariationsManager
                  variations={variations}
                  onChange={setVariations}
                  resellers={resellers}
                  baseSku={skuNovoPreview || '10000'}
                  basePrice={Number(precoVenda) || 0}
                />
              )}
            </div>

            {/* SEÇÃO 7: BOTÕES DO MODAL */}
            <DialogFooter className="p-6 border-t border-[#E5DFD5] bg-[#FDFBF7] sticky bottom-0 z-10 flex-col sm:flex-row gap-2 sm:gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSaving}
                className="border-[#E5DFD5] text-[#2D2A26] h-11 px-6 font-medium"
              >
                Cancelar
              </Button>

              <Button
                type="submit"
                disabled={isSaving}
                className="bg-gradient-to-r from-[#7A5C2E] via-[#A88742] to-[#7A5C2E] hover:from-[#634924] hover:to-[#634924] text-white h-11 px-6 font-bold shadow-md"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Salvando e registrando estoque...
                  </>
                ) : (
                  'Salvar produto e registrar estoque inicial'
                )}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
