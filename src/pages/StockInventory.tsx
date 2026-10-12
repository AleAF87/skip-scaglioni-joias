import React, { useState, useEffect } from 'react'
import { productService } from '@/services/productService'
import { Product, ProductType, ProductMaterial, ProductSize } from '@/types'
import { formatCurrency, formatDate, getFileUrl } from '@/lib/formatters'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Barcode128 } from '@/components/Barcode128'
import { ImageLightbox } from '@/components/ImageLightbox'
import {
  Boxes,
  Search,
  Filter,
  Printer,
  Edit,
  Trash2,
  Plus,
  Layers,
  ArrowUpDown,
  CheckSquare,
  Square,
  PackageCheck,
  AlertCircle,
  X,
  ChevronLeft,
  ChevronRight,
  Camera,
  ArrowLeft,
  ArrowRight,
  ZoomIn,
} from 'lucide-react'
import { toast } from 'sonner'
import { Link } from 'react-router-dom'

export default function StockInventory() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [types, setTypes] = useState<ProductType[]>([])
  const [materials, setMaterials] = useState<ProductMaterial[]>([])
  const [sizes, setSizes] = useState<ProductSize[]>([])

  // Search & Filters
  const [search, setSearch] = useState('')
  const [selectedType, setSelectedType] = useState('')
  const [selectedMaterial, setSelectedMaterial] = useState('')
  const [selectedStatus, setSelectedStatus] = useState('')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalItems, setTotalItems] = useState(0)

  // Selection for bulk action & barcode printing
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  // Direct quantity edit
  const [editingQtyId, setEditingQtyId] = useState<string | null>(null)
  const [tempQty, setTempQty] = useState<string>('')

  // Bulk edit modal
  const [bulkModalOpen, setBulkModalOpen] = useState(false)
  const [bulkPrice, setBulkPrice] = useState('')
  const [bulkInvested, setBulkInvested] = useState('')
  const [bulkType, setBulkType] = useState('')
  const [bulkMaterial, setBulkMaterial] = useState('')
  const [bulkStatus, setBulkStatus] = useState('')

  // Print Labels modal
  const [printModalOpen, setPrintModalOpen] = useState(false)

  // Lightbox state
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [lightboxPhotos, setLightboxPhotos] = useState<string[]>([])
  const [lightboxTitle, setLightboxTitle] = useState('')
  const [lightboxIndex, setLightboxIndex] = useState(0)

  // Product edit modal
  const [editProductModalOpen, setEditProductModalOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [editExistingPhotos, setEditExistingPhotos] = useState<string[]>([])
  const [editNewPhotoFiles, setEditNewPhotoFiles] = useState<{ file: File; preview: string }[]>([])
  const [isSavingEdit, setIsSavingEdit] = useState(false)
  const [editForm, setEditForm] = useState({
    code: '',
    description: '',
    type: '',
    material: '',
    size: '',
    target_audience: '',
    invested_value: '',
    selling_price: '',
    quantity: '',
    minimum_quantity: '',
    observations: '',
    status: 'available',
  })

  useEffect(() => {
    loadAuxiliaries()
  }, [])

  useEffect(() => {
    loadProducts()
  }, [search, selectedType, selectedMaterial, selectedStatus, page])

  const loadAuxiliaries = async () => {
    try {
      const data = await productService.getAuxiliaryData()
      setTypes(data.types)
      setMaterials(data.materials)
      setSizes(data.sizes)
    } catch (err) {
      console.error(err)
    }
  }

  const loadProducts = async () => {
    setLoading(true)
    try {
      const res = await productService.getProducts({
        search,
        type: selectedType,
        material: selectedMaterial,
        status: selectedStatus,
        page,
        perPage: 15,
      })
      setProducts(res.items)
      setTotalPages(res.totalPages || 1)
      setTotalItems(res.totalItems || 0)
    } catch (err) {
      console.error('Erro ao listar estoque:', err)
      toast.error('Erro ao carregar produtos.')
    } finally {
      setLoading(false)
    }
  }

  const handleSelectAll = () => {
    if (selectedIds.length === products.length) {
      setSelectedIds([])
    } else {
      setSelectedIds(products.map((p) => p.id))
    }
  }

  const toggleSelectOne = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    )
  }

  // Quick inline quantity update
  const handleSaveQuantity = async (id: string) => {
    const num = parseInt(tempQty, 10)
    if (isNaN(num) || num < 0) {
      toast.error('Quantidade inválida.')
      return
    }
    try {
      await productService.updateProduct(id, {
        quantity: num,
        status: num > 0 ? 'available' : 'unavailable',
      })
      toast.success('Quantidade atualizada!')
      setEditingQtyId(null)
      loadProducts()
    } catch (err) {
      toast.error('Falha ao atualizar quantidade.')
    }
  }

  // Bulk update
  const handleApplyBulkUpdate = async () => {
    if (selectedIds.length === 0) return
    const updates: Partial<Product> = {}

    if (bulkPrice) updates.selling_price = parseFloat(bulkPrice)
    if (bulkInvested) updates.invested_value = parseFloat(bulkInvested)
    if (bulkType) updates.type = bulkType
    if (bulkMaterial) updates.material = bulkMaterial
    if (bulkStatus) updates.status = bulkStatus as any

    if (Object.keys(updates).length === 0) {
      toast.info('Selecione pelo menos um campo para alterar em massa.')
      return
    }

    try {
      await productService.updateBatch(selectedIds, updates)
      toast.success(`${selectedIds.length} produto(s) atualizado(s) em massa!`)
      setBulkModalOpen(false)
      setSelectedIds([])
      setBulkPrice('')
      setBulkInvested('')
      setBulkType('')
      setBulkMaterial('')
      setBulkStatus('')
      loadProducts()
    } catch (err) {
      toast.error('Falha na atualização em massa.')
    }
  }

  // Lightbox opener
  const handleOpenLightbox = (p: Product, initialIdx: number = 0) => {
    if (!p.photos || p.photos.length === 0) return
    const urls = p.photos.map((photoName) => getFileUrl('products', p.id, photoName))
    setLightboxPhotos(urls)
    setLightboxTitle(`${p.code} — ${p.description}`)
    setLightboxIndex(initialIdx)
    setLightboxOpen(true)
  }

  // Open Edit Product
  const handleOpenEdit = (p: Product) => {
    setEditingProduct(p)
    setEditExistingPhotos(p.photos ? [...p.photos] : [])
    setEditNewPhotoFiles([])
    setEditForm({
      code: p.code,
      description: p.description,
      type: p.type || '',
      material: p.material || '',
      size: p.size || '',
      target_audience: p.target_audience || '',
      invested_value: p.invested_value ? p.invested_value.toString() : '',
      selling_price: p.selling_price ? p.selling_price.toString() : '',
      quantity: p.quantity.toString(),
      minimum_quantity: p.minimum_quantity ? p.minimum_quantity.toString() : '3',
      observations: p.observations || '',
      status: p.status || 'available',
    })
    setEditProductModalOpen(true)
  }

  // Edit photo handlers
  const handleAddEditPhotos = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return
    const incoming = Array.from(e.target.files)
    const newItems = incoming.map((file) => ({
      file,
      preview: URL.createObjectURL(file),
    }))
    setEditNewPhotoFiles((prev) => [...prev, ...newItems])
    toast.success(`${incoming.length} nova(s) imagem(ns) adicionada(s).`)
  }

  const handleRemoveExistingPhoto = (index: number) => {
    setEditExistingPhotos((prev) => prev.filter((_, i) => i !== index))
  }

  const handleMoveExistingPhoto = (index: number, direction: 'left' | 'right') => {
    const targetIndex = direction === 'left' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= editExistingPhotos.length) return
    const updated = [...editExistingPhotos]
    const temp = updated[index]
    updated[index] = updated[targetIndex]
    updated[targetIndex] = temp
    setEditExistingPhotos(updated)
  }

  const handleRemoveNewPhoto = (index: number) => {
    setEditNewPhotoFiles((prev) => prev.filter((_, i) => i !== index))
  }

  const handleMoveNewPhoto = (index: number, direction: 'left' | 'right') => {
    const targetIndex = direction === 'left' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= editNewPhotoFiles.length) return
    const updated = [...editNewPhotoFiles]
    const temp = updated[index]
    updated[index] = updated[targetIndex]
    updated[targetIndex] = temp
    setEditNewPhotoFiles(updated)
  }

  const handleSaveFullEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingProduct) return

    setIsSavingEdit(true)
    try {
      const parsedQty = parseInt(editForm.quantity, 10)
      const fields = {
        code: editForm.code.trim().toUpperCase(),
        description: editForm.description.trim(),
        type: editForm.type || '',
        material: editForm.material || '',
        size: editForm.size || '',
        target_audience: editForm.target_audience || '',
        invested_value: editForm.invested_value ? parseFloat(editForm.invested_value) : '',
        selling_price: parseFloat(editForm.selling_price),
        quantity: parsedQty,
        minimum_quantity: editForm.minimum_quantity ? parseInt(editForm.minimum_quantity, 10) : 3,
        observations: editForm.observations,
        status: parsedQty > 0 ? 'available' : 'unavailable',
      }

      const filesToUpload = editNewPhotoFiles.map((item) => item.file)

      await productService.updateProductWithPhotos(
        editingProduct.id,
        fields,
        filesToUpload,
        editExistingPhotos,
      )

      toast.success('Produto e fotos atualizados com sucesso!')
      setEditProductModalOpen(false)
      setEditingProduct(null)
      loadProducts()
    } catch (err: any) {
      console.error('Erro ao atualizar produto:', err)
      toast.error('Falha ao atualizar produto: ' + (err.message || ''))
    } finally {
      setIsSavingEdit(false)
    }
  }

  const handleDeleteProduct = async (id: string, name: string) => {
    if (window.confirm(`Tem certeza que deseja excluir a joia "${name}"?`)) {
      try {
        await productService.deleteProduct(id)
        toast.success('Produto excluído do estoque.')
        loadProducts()
      } catch (err) {
        toast.error('Não foi possível excluir o produto.')
      }
    }
  }

  const selectedProductsForPrint = products.filter((p) => selectedIds.includes(p.id))

  const handlePrint = () => {
    window.print()
  }

  return (
    <div className="space-y-6">
      {/* Header with Title and Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#E5DFD5] pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-lg bg-[#C6A664]/20 text-[#7A5C2E]">
              <Boxes className="h-5 w-5" />
            </span>
            <h1 className="font-serif text-2xl md:text-3xl font-bold text-[#2D2A26]">
              Controle de Estoque
            </h1>
          </div>
          <p className="text-sm text-[#6B655E] mt-1">
            Gestão completa de peças, controle de quantidades, alteração em massa e etiquetas.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {selectedIds.length > 0 && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setBulkModalOpen(true)}
                className="border-[#C6A664] text-[#7A5C2E] hover:bg-[#F3EAD8]"
              >
                <Layers className="h-4 w-4 mr-1.5" />
                Alterar em Massa ({selectedIds.length})
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setPrintModalOpen(true)}
                className="border-[#2D2A26] text-[#2D2A26] hover:bg-[#F3EAD8]"
              >
                <Printer className="h-4 w-4 mr-1.5" />
                Etiquetas ({selectedIds.length})
              </Button>
            </>
          )}

          <Link to="/voz">
            <Button className="bg-gradient-to-r from-[#7A5C2E] to-[#C6A664] hover:opacity-90 text-white font-semibold shadow-xs">
              <Plus className="h-4 w-4 mr-1.5" />
              Novo Produto
            </Button>
          </Link>
        </div>
      </div>

      {/* Filter Toolbar */}
      <Card className="border-[#E5DFD5] bg-white shadow-xs">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {/* Search */}
            <div className="relative lg:col-span-2">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-[#6B655E]" />
              <Input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  setPage(1)
                }}
                placeholder="Buscar por código ou descrição..."
                className="pl-9 border-[#E5DFD5] focus-visible:ring-[#C6A664]"
              />
            </div>

            {/* Type Filter */}
            <div>
              <select
                value={selectedType}
                onChange={(e) => {
                  setSelectedType(e.target.value)
                  setPage(1)
                }}
                className="w-full h-10 rounded-md border border-[#E5DFD5] bg-white px-3 py-2 text-sm text-[#2D2A26] focus:outline-none focus:ring-2 focus:ring-[#C6A664]"
              >
                <option value="">Todos os Tipos</option>
                {types.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Material Filter */}
            <div>
              <select
                value={selectedMaterial}
                onChange={(e) => {
                  setSelectedMaterial(e.target.value)
                  setPage(1)
                }}
                className="w-full h-10 rounded-md border border-[#E5DFD5] bg-white px-3 py-2 text-sm text-[#2D2A26] focus:outline-none focus:ring-2 focus:ring-[#C6A664]"
              >
                <option value="">Todos os Materiais</option>
                {materials.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Status Filter */}
            <div>
              <select
                value={selectedStatus}
                onChange={(e) => {
                  setSelectedStatus(e.target.value)
                  setPage(1)
                }}
                className="w-full h-10 rounded-md border border-[#E5DFD5] bg-white px-3 py-2 text-sm text-[#2D2A26] focus:outline-none focus:ring-2 focus:ring-[#C6A664]"
              >
                <option value="">Todos os Status</option>
                <option value="available">Disponível</option>
                <option value="unavailable">Esgotado</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Products Table Card */}
      <Card className="border-[#E5DFD5] bg-white shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#F3EAD8] text-[#2D2A26] border-b border-[#E5DFD5] text-xs uppercase tracking-wider font-semibold">
                <th className="py-3 px-4 w-10 text-center">
                  <button onClick={handleSelectAll} className="focus:outline-none">
                    {selectedIds.length > 0 && selectedIds.length === products.length ? (
                      <CheckSquare className="h-4 w-4 text-[#7A5C2E]" />
                    ) : (
                      <Square className="h-4 w-4 text-[#6B655E]" />
                    )}
                  </button>
                </th>
                <th className="py-3 px-4">Joia</th>
                <th className="py-3 px-4">Tipo</th>
                <th className="py-3 px-4">Tamanho</th>
                <th className="py-3 px-4">Perfil</th>
                <th className="py-3 px-4">Investido</th>
                <th className="py-3 px-4">Preço Venda</th>
                <th className="py-3 px-4">Estoque</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5DFD5] text-sm">
              {loading ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-[#6B655E]">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#C6A664] border-t-transparent" />
                      <span>Carregando joias do estoque...</span>
                    </div>
                  </td>
                </tr>
              ) : products.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-[#6B655E]">
                    <PackageCheck className="h-10 w-10 text-[#C6A664] mx-auto mb-2 opacity-50" />
                    <p className="font-semibold text-[#2D2A26]">Nenhuma peça encontrada.</p>
                    <p className="text-xs text-[#6B655E] mt-1">
                      Tente ajustar os filtros ou cadastre uma nova joia.
                    </p>
                  </td>
                </tr>
              ) : (
                products.map((p) => {
                  const isSelected = selectedIds.includes(p.id)
                  const isEditingThisQty = editingQtyId === p.id
                  const isLowStock = p.quantity <= (p.minimum_quantity || 3)
                  const photo =
                    p.photos && p.photos.length > 0
                      ? getFileUrl('products', p.id, p.photos[0])
                      : null
                  const hasPhoto = Boolean(photo)

                  return (
                    <tr
                      key={p.id}
                      className={`hover:bg-[#FDFBF7] transition-colors ${
                        isSelected ? 'bg-[#C6A664]/5' : ''
                      }`}
                    >
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() => toggleSelectOne(p.id)}
                          className="focus:outline-none"
                        >
                          {isSelected ? (
                            <CheckSquare className="h-4 w-4 text-[#7A5C2E]" />
                          ) : (
                            <Square className="h-4 w-4 text-[#6B655E]" />
                          )}
                        </button>
                      </td>

                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => hasPhoto && handleOpenLightbox(p)}
                            disabled={!hasPhoto}
                            className={`relative group h-12 w-12 rounded-lg bg-[#F3EAD8] overflow-hidden shrink-0 border border-[#E5DFD5] flex items-center justify-center transition-all ${
                              hasPhoto
                                ? 'cursor-pointer hover:border-[#C6A664] hover:shadow-md'
                                : 'cursor-default'
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
                                <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white">
                                  <ZoomIn className="h-4 w-4" />
                                </div>
                                {p.photos && p.photos.length > 1 && (
                                  <span className="absolute bottom-0 right-0 bg-black/70 text-white text-[9px] font-mono px-1 rounded-tl-sm">
                                    +{p.photos.length - 1}
                                  </span>
                                )}
                              </>
                            ) : (
                              <PackageCheck className="h-5 w-5 text-[#C6A664]" />
                            )}
                          </button>
                          <div>
                            <span className="font-mono text-xs font-bold text-[#7A5C2E] block">
                              {p.code}
                            </span>
                            <span className="font-medium text-[#2D2A26] line-clamp-1">
                              {p.description}
                            </span>
                            {p.expand?.material?.name && (
                              <span className="text-[11px] text-[#6B655E]">
                                {p.expand?.material?.name}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Tipo separado */}
                      <td className="py-3 px-4">
                        <span className="font-medium text-[#2D2A26]">
                          {p.expand?.type?.name || '—'}
                        </span>
                      </td>

                      {/* Tamanho separado */}
                      <td className="py-3 px-4 text-[#6B655E]">
                        {p.expand?.size?.name || 'Único'}
                      </td>

                      {/* Perfil separado */}
                      <td className="py-3 px-4">
                        <span className="capitalize text-xs font-medium px-2 py-0.5 rounded-full bg-[#F3EAD8] text-[#7A5C2E] inline-block">
                          {p.target_audience || 'Unissex'}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-[#6B655E]">
                        {formatCurrency(p.invested_value)}
                      </td>

                      <td className="py-3 px-4 font-bold text-[#2D2A26]">
                        {formatCurrency(p.selling_price)}
                      </td>

                      {/* Direct Quantity edit */}
                      <td className="py-3 px-4">
                        {isEditingThisQty ? (
                          <div className="flex items-center gap-1.5">
                            <Input
                              type="number"
                              min="0"
                              value={tempQty}
                              onChange={(e) => setTempQty(e.target.value)}
                              className="h-8 w-16 text-center font-bold border-[#C6A664]"
                            />
                            <Button
                              size="sm"
                              className="h-8 px-2 bg-[#2E7D4F] hover:bg-[#256640] text-white"
                              onClick={() => handleSaveQuantity(p.id)}
                            >
                              OK
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 px-1.5 text-[#B3261E]"
                              onClick={() => setEditingQtyId(null)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : (
                          <div
                            onClick={() => {
                              setEditingQtyId(p.id)
                              setTempQty(p.quantity.toString())
                            }}
                            className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-[#F3EAD8] cursor-pointer group"
                            title="Clique para editar a quantidade"
                          >
                            <span
                              className={`font-bold ${
                                p.quantity === 0
                                  ? 'text-[#B3261E]'
                                  : isLowStock
                                    ? 'text-[#B26A00]'
                                    : 'text-[#2E7D4F]'
                              }`}
                            >
                              {p.quantity}
                            </span>
                            <Edit className="h-3 w-3 text-[#6B655E] opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-4">
                        {p.quantity === 0 ? (
                          <Badge
                            variant="destructive"
                            className="bg-[#B3261E] text-white text-[10px]"
                          >
                            Esgotado
                          </Badge>
                        ) : isLowStock ? (
                          <Badge
                            variant="outline"
                            className="border-[#B26A00] text-[#B26A00] bg-[#B26A00]/10 text-[10px]"
                          >
                            Baixo ({p.quantity})
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="border-[#2E7D4F] text-[#2E7D4F] bg-[#2E7D4F]/10 text-[10px]"
                          >
                            Disponível
                          </Badge>
                        )}
                      </td>

                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleOpenEdit(p)}
                            className="h-8 w-8 text-[#6B655E] hover:text-[#7A5C2E] hover:bg-[#F3EAD8]"
                            title="Editar dados da joia"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteProduct(p.id, p.description)}
                            className="h-8 w-8 text-[#B3261E] hover:bg-[#B3261E]/10"
                            title="Excluir peça"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="p-4 border-t border-[#E5DFD5] flex items-center justify-between">
          <span className="text-xs text-[#6B655E]">
            Total de <strong className="text-[#2D2A26]">{totalItems}</strong> peças cadastradas
          </span>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="border-[#E5DFD5] text-xs"
            >
              <ChevronLeft className="h-4 w-4 mr-1" /> Anterior
            </Button>
            <span className="text-xs font-semibold px-2">
              Página {page} de {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="border-[#E5DFD5] text-xs"
            >
              Próxima <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      </Card>

      {/* Bulk Update Modal */}
      <Dialog open={bulkModalOpen} onOpenChange={setBulkModalOpen}>
        <DialogContent className="max-w-lg bg-white">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl text-[#2D2A26]">
              Alteração em Massa ({selectedIds.length} joias selecionadas)
            </DialogTitle>
            <CardDescription className="text-sm text-[#6B655E]">
              Preencha apenas os campos que deseja alterar para todos os produtos selecionados.
            </CardDescription>
          </DialogHeader>

          <div className="space-y-4 py-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-semibold">Novo Preço de Venda (R$)</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="Deixar inalterado"
                  value={bulkPrice}
                  onChange={(e) => setBulkPrice(e.target.value)}
                  className="mt-1"
                />
              </div>

              <div>
                <Label className="text-xs font-semibold">Novo Valor Investido (R$)</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="Deixar inalterado"
                  value={bulkInvested}
                  onChange={(e) => setBulkInvested(e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-semibold">Novo Tipo</Label>
                <select
                  value={bulkType}
                  onChange={(e) => setBulkType(e.target.value)}
                  className="mt-1 w-full rounded-md border border-[#E5DFD5] bg-white px-3 py-2 text-sm"
                >
                  <option value="">Deixar inalterado</option>
                  {types.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <Label className="text-xs font-semibold">Novo Material</Label>
                <select
                  value={bulkMaterial}
                  onChange={(e) => setBulkMaterial(e.target.value)}
                  className="mt-1 w-full rounded-md border border-[#E5DFD5] bg-white px-3 py-2 text-sm"
                >
                  <option value="">Deixar inalterado</option>
                  {materials.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <Label className="text-xs font-semibold">Alterar Status</Label>
              <select
                value={bulkStatus}
                onChange={(e) => setBulkStatus(e.target.value)}
                className="mt-1 w-full rounded-md border border-[#E5DFD5] bg-white px-3 py-2 text-sm"
              >
                <option value="">Deixar inalterado</option>
                <option value="available">Disponível</option>
                <option value="unavailable">Esgotado / Indisponível</option>
              </select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setBulkModalOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleApplyBulkUpdate}
              className="bg-[#7A5C2E] hover:bg-[#634924] text-white"
            >
              Aplicar em {selectedIds.length} produtos
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Product Modal */}
      <Dialog open={editProductModalOpen} onOpenChange={setEditProductModalOpen}>
        <DialogContent className="max-w-2xl bg-white max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl text-[#2D2A26]">
              Editar Joia: {editingProduct?.code}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSaveFullEdit} className="space-y-4 py-2">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs font-semibold">Código *</Label>
                <Input
                  value={editForm.code}
                  onChange={(e) => setEditForm({ ...editForm, code: e.target.value })}
                  required
                  className="font-mono uppercase font-bold"
                />
              </div>

              <div className="col-span-2">
                <Label className="text-xs font-semibold">Descrição *</Label>
                <Input
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <Label className="text-xs font-semibold">Tipo</Label>
                <select
                  value={editForm.type}
                  onChange={(e) => setEditForm({ ...editForm, type: e.target.value })}
                  className="w-full h-10 rounded-md border border-[#E5DFD5] px-3 text-sm mt-1"
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
                <Label className="text-xs font-semibold">Material</Label>
                <select
                  value={editForm.material}
                  onChange={(e) => setEditForm({ ...editForm, material: e.target.value })}
                  className="w-full h-10 rounded-md border border-[#E5DFD5] px-3 text-sm mt-1"
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
                <Label className="text-xs font-semibold">Tamanho</Label>
                <select
                  value={editForm.size}
                  onChange={(e) => setEditForm({ ...editForm, size: e.target.value })}
                  className="w-full h-10 rounded-md border border-[#E5DFD5] px-3 text-sm mt-1"
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
                <Label className="text-xs font-semibold">Perfil</Label>
                <select
                  value={editForm.target_audience}
                  onChange={(e) => setEditForm({ ...editForm, target_audience: e.target.value })}
                  className="w-full h-10 rounded-md border border-[#E5DFD5] px-3 text-sm mt-1"
                >
                  <option value="">Selecione...</option>
                  <option value="feminino">Feminino</option>
                  <option value="masculino">Masculino</option>
                  <option value="unissex">Unissex</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs font-semibold">Valor Investido (R$)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={editForm.invested_value}
                  onChange={(e) => setEditForm({ ...editForm, invested_value: e.target.value })}
                  className="mt-1"
                />
              </div>

              <div>
                <Label className="text-xs font-semibold">Preço de Venda (R$) *</Label>
                <Input
                  type="number"
                  step="0.01"
                  required
                  value={editForm.selling_price}
                  onChange={(e) => setEditForm({ ...editForm, selling_price: e.target.value })}
                  className="mt-1 font-bold text-[#7A5C2E]"
                />
              </div>

              <div>
                <Label className="text-xs font-semibold">Quantidade *</Label>
                <Input
                  type="number"
                  min="0"
                  required
                  value={editForm.quantity}
                  onChange={(e) => setEditForm({ ...editForm, quantity: e.target.value })}
                  className="mt-1 font-bold"
                />
              </div>
            </div>

            <div>
              <Label className="text-xs font-semibold">Observações</Label>
              <Input
                value={editForm.observations}
                onChange={(e) => setEditForm({ ...editForm, observations: e.target.value })}
                className="mt-1"
              />
            </div>

            {/* Gerenciamento Completo de Fotos da Peça */}
            <div className="pt-3 border-t border-[#E5DFD5] space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-xs font-semibold text-[#2D2A26] block">
                    Fotos da Peça (Capa = 1ª foto)
                  </Label>
                  <p className="text-[11px] text-[#6B655E]">
                    Exclua imagens, adicione mais fotos ou reordene as posições (a primeira imagem é
                    a capa).
                  </p>
                </div>

                <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-[#C6A664] text-[#7A5C2E] hover:bg-[#F3EAD8] text-xs font-semibold cursor-pointer">
                  <Plus className="h-3.5 w-3.5" /> Adicionar Fotos
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={handleAddEditPhotos}
                  />
                </label>
              </div>

              {/* Fotos Existentes */}
              {editExistingPhotos.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-[11px] font-semibold text-[#6B655E] uppercase tracking-wider block">
                    Fotos Salvas Atuais ({editExistingPhotos.length})
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {editExistingPhotos.map((photoName, idx) => {
                      const url = editingProduct
                        ? getFileUrl('products', editingProduct.id, photoName)
                        : ''
                      const isFirst = idx === 0
                      const isLast = idx === editExistingPhotos.length - 1

                      return (
                        <div
                          key={`exist-${photoName}-${idx}`}
                          className="relative rounded-xl border-2 border-[#E5DFD5] bg-[#FDFBF7] p-1.5 flex flex-col items-center gap-1.5 group"
                        >
                          {isFirst && (
                            <span className="absolute top-2 left-2 z-10 px-1.5 py-0.5 rounded-sm bg-[#7A5C2E] text-white text-[9px] font-bold uppercase tracking-wider shadow-xs">
                              Capa
                            </span>
                          )}

                          <div className="w-full aspect-square rounded-lg overflow-hidden bg-white border border-[#E5DFD5]">
                            <img
                              src={url}
                              alt="Foto da joia"
                              className="w-full h-full object-cover"
                            />
                          </div>

                          <div className="flex items-center justify-between w-full px-1">
                            <div className="flex items-center gap-0.5">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                disabled={isFirst}
                                onClick={() => handleMoveExistingPhoto(idx, 'left')}
                                className="h-6 w-6 text-[#2D2A26] disabled:opacity-30 hover:bg-[#E5DFD5]"
                                title="Mover para esquerda"
                              >
                                <ArrowLeft className="h-3 w-3" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                disabled={isLast}
                                onClick={() => handleMoveExistingPhoto(idx, 'right')}
                                className="h-6 w-6 text-[#2D2A26] disabled:opacity-30 hover:bg-[#E5DFD5]"
                                title="Mover para direita"
                              >
                                <ArrowRight className="h-3 w-3" />
                              </Button>
                            </div>

                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => handleRemoveExistingPhoto(idx)}
                              className="h-6 w-6 text-[#B3261E] hover:bg-[#B3261E]/10"
                              title="Excluir esta foto"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Novas Fotos a Enviar */}
              {editNewPhotoFiles.length > 0 && (
                <div className="space-y-1.5 pt-2">
                  <span className="text-[11px] font-semibold text-[#2E7D4F] uppercase tracking-wider block">
                    Novas Fotos a Adicionar ({editNewPhotoFiles.length})
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {editNewPhotoFiles.map((item, idx) => {
                      const isFirst = idx === 0 && editExistingPhotos.length === 0
                      const isFirstInNew = idx === 0
                      const isLastInNew = idx === editNewPhotoFiles.length - 1

                      return (
                        <div
                          key={`new-${idx}`}
                          className="relative rounded-xl border-2 border-[#2E7D4F]/40 bg-[#2E7D4F]/5 p-1.5 flex flex-col items-center gap-1.5 group"
                        >
                          {isFirst && (
                            <span className="absolute top-2 left-2 z-10 px-1.5 py-0.5 rounded-sm bg-[#7A5C2E] text-white text-[9px] font-bold uppercase tracking-wider">
                              Capa
                            </span>
                          )}

                          <div className="w-full aspect-square rounded-lg overflow-hidden bg-white border border-[#E5DFD5]">
                            <img
                              src={item.preview}
                              alt="Nova foto"
                              className="w-full h-full object-cover"
                            />
                          </div>

                          <div className="flex items-center justify-between w-full px-1">
                            <div className="flex items-center gap-0.5">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                disabled={isFirstInNew}
                                onClick={() => handleMoveNewPhoto(idx, 'left')}
                                className="h-6 w-6 text-[#2D2A26] disabled:opacity-30 hover:bg-[#E5DFD5]"
                                title="Mover para esquerda"
                              >
                                <ArrowLeft className="h-3 w-3" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                disabled={isLastInNew}
                                onClick={() => handleMoveNewPhoto(idx, 'right')}
                                className="h-6 w-6 text-[#2D2A26] disabled:opacity-30 hover:bg-[#E5DFD5]"
                                title="Mover para direita"
                              >
                                <ArrowRight className="h-3 w-3" />
                              </Button>
                            </div>

                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => handleRemoveNewPhoto(idx)}
                              className="h-6 w-6 text-[#B3261E] hover:bg-[#B3261E]/10"
                              title="Remover foto"
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {editExistingPhotos.length === 0 && editNewPhotoFiles.length === 0 && (
                <p className="text-xs text-[#6B655E] italic bg-[#FDFBF7] p-3 rounded-lg border border-dashed border-[#E5DFD5] text-center">
                  Esta peça não possui fotos vinculadas. Clique em "Adicionar Fotos" acima para
                  anexar.
                </p>
              )}
            </div>

            <DialogFooter className="pt-3">
              <Button type="button" variant="ghost" onClick={() => setEditProductModalOpen(false)}>
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={isSavingEdit}
                className="bg-[#2E7D4F] hover:bg-[#256640] text-white"
              >
                {isSavingEdit ? 'Salvando...' : 'Salvar Alterações'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Lightbox Modal Reutilizável */}
      <ImageLightbox
        open={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
        photos={lightboxPhotos}
        initialIndex={lightboxIndex}
        title={lightboxTitle}
      />

      {/* Print Barcodes Modal (A4 printable layout) */}
      <Dialog open={printModalOpen} onOpenChange={setPrintModalOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-white p-6">
          <DialogHeader className="print:hidden">
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle className="font-serif text-xl text-[#2D2A26]">
                  Geração de Etiquetas Imprimíveis (Código 128)
                </DialogTitle>
                <CardDescription className="text-sm text-[#6B655E]">
                  Layout para folha A4 com identificação da joia e código de barras.
                </CardDescription>
              </div>

              <Button
                onClick={handlePrint}
                className="bg-[#2D2A26] hover:bg-black text-white shadow-md"
              >
                <Printer className="h-4 w-4 mr-2" /> Imprimir Folha A4
              </Button>
            </div>
          </DialogHeader>

          {/* Printable Sheet (Standard A4 grid) */}
          <div className="print-area mt-4 p-4 border border-dashed border-[#E5DFD5] rounded-xl bg-[#FFFFFF]">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {selectedProductsForPrint.map((p) => (
                <div
                  key={p.id}
                  className="p-3 border border-[#2D2A26] rounded-md flex flex-col items-center justify-between text-center bg-white"
                  style={{ minHeight: '140px' }}
                >
                  <span className="font-serif text-[11px] font-bold uppercase tracking-wider text-[#2D2A26]">
                    Scaglioni Joias
                  </span>
                  <p className="text-xs font-semibold text-[#2D2A26] line-clamp-1 w-full px-1">
                    {p.description}
                  </p>
                  <p className="text-xs font-bold text-[#7A5C2E]">
                    {formatCurrency(p.selling_price)}
                  </p>

                  <div className="w-full flex justify-center py-1">
                    <Barcode128 code={p.code} height={36} />
                  </div>

                  <span className="text-[9px] text-[#6B655E] font-medium">
                    {p.expand?.material?.name || ''}{' '}
                    {p.expand?.size?.name ? `| Tam: ${p.expand?.size?.name}` : ''}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
