import React, { useState, useEffect } from 'react'
import pb from '@/lib/pocketbase/client'
import { Product, Brand, ProductCategory } from '@/types'
import { productCreationService } from '@/services/productCreationService'
import { productService } from '@/services/productService'
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
import { Edit3, Loader2, Check, DollarSign, Tag, Globe, Lock } from 'lucide-react'
import { toast } from 'sonner'

interface ProductEditModalProps {
  product: Product | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: (updated: Product) => void
}

export function ProductEditModal({
  product,
  open,
  onOpenChange,
  onSuccess,
}: ProductEditModalProps) {
  const [isSaving, setIsSaving] = useState(false)
  const [brands, setBrands] = useState<Brand[]>([])
  const [categories, setCategories] = useState<ProductCategory[]>([])
  const [categoriaIds, setCategoriaIds] = useState<string[]>([])

  const [nomeProduto, setNomeProduto] = useState('')
  const [marcaId, setMarcaId] = useState('')
  const [fornecedor, setFornecedor] = useState('')
  const [description, setDescription] = useState('')

  const [precoVenda, setPrecoVenda] = useState<number | ''>('')
  const [precoPromocional, setPrecoPromocional] = useState<number | ''>('')
  const [custoUnitario, setCustoUnitario] = useState<number | ''>('')

  const [publicarNoEcommerce, setPublicarNoEcommerce] = useState(false)
  const [destaqueEcommerce, setDestaqueEcommerce] = useState(false)
  const [slug, setSlug] = useState('')

  useEffect(() => {
    if (open && product) {
      setNomeProduto(product.nome_produto || product.description || '')
      setMarcaId(product.marca_id || '')
      setFornecedor(product.fornecedor || '')
      setDescription(product.description || '')
      setPrecoVenda(product.selling_price || '')
      setPrecoPromocional(product.preco_promocional || '')
      setCustoUnitario(product.custo_unitario || '')
      setPublicarNoEcommerce(Boolean(product.publicar_no_ecommerce))
      setDestaqueEcommerce(Boolean(product.destaque_ecommerce))
      setSlug(product.slug || '')

      loadAuxAndLinks(product.id)
    }
  }, [open, product])

  const loadAuxAndLinks = async (productId: string) => {
    try {
      const [brandList, catList, links] = await Promise.all([
        productCreationService.getBrands(),
        productCreationService.getCategories(),
        productService.getProductCategoryLinks(productId).catch(() => []),
      ])
      setBrands(brandList)
      setCategories(catList)
      setCategoriaIds(links.map((l) => l.category))
    } catch (err) {
      console.warn('Erro ao carregar metadados na edição:', err)
    }
  }

  const toggleCategory = (catId: string) => {
    setCategoriaIds((prev) =>
      prev.includes(catId) ? prev.filter((id) => id !== catId) : [...prev, catId],
    )
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!product) return

    if (!nomeProduto.trim()) {
      toast.error('O Nome do produto é obrigatório.')
      return
    }

    const newSell = Number(precoVenda) || 0
    if (newSell <= 0) {
      toast.error('Preço de venda é obrigatório.')
      return
    }

    const newPromo = Number(precoPromocional) || 0
    if (newPromo > 0 && newPromo >= newSell) {
      toast.error('Preço promocional não pode ser maior ou igual ao preço de venda.')
      return
    }

    const newCost = typeof custoUnitario === 'number' ? custoUnitario : 0
    const oldSell = product.selling_price || 0
    const oldPromo = product.preco_promocional || 0
    const oldCost = product.custo_unitario || 0

    setIsSaving(true)
    try {
      // 1. Atualizar produto
      const updated = await pb.collection('products').update<Product>(product.id, {
        nome_produto: nomeProduto.trim(),
        description: description.trim() || nomeProduto.trim(),
        marca_id: marcaId || null,
        fornecedor: fornecedor.trim() || null,
        selling_price: newSell,
        preco_promocional: newPromo > 0 ? newPromo : null,
        custo_unitario: newCost > 0 ? newCost : null,
        invested_value: newCost > 0 ? newCost : null,
        publicar_no_ecommerce: publicarNoEcommerce,
        destaque_ecommerce: publicarNoEcommerce && destaqueEcommerce,
        slug: slug.trim() || undefined,
      })

      // 2. Se preço de venda, promocional ou custo mudou, registrar automaticamente no histórico de preços
      const priceChanged =
        oldSell !== newSell || oldPromo !== newPromo || (newCost > 0 && oldCost !== newCost)

      if (priceChanged) {
        await productCreationService.recordPriceChange(
          product.id,
          oldSell,
          newSell,
          oldPromo,
          newPromo,
          oldCost,
          newCost,
          'Edição manual no painel de produtos',
        )
      }

      // 3. Atualizar vínculos de categorias
      await productService.setProductCategoryLinks(product.id, categoriaIds)

      toast.success('Produto atualizado com sucesso!')
      onSuccess(updated)
      onOpenChange(false)
    } catch (err: any) {
      console.error(err)
      toast.error('Erro ao atualizar produto: ' + (err.message || ''))
    } finally {
      setIsSaving(false)
    }
  }

  if (!product) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl bg-white border-[#E5DFD5] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2 text-[#7A5C2E]">
            <Edit3 className="h-5 w-5" />
            <DialogTitle className="font-serif text-xl text-[#2D2A26]">Editar Produto</DialogTitle>
          </div>
          <DialogDescription className="text-xs text-[#6B655E]">
            SKU novo: <strong className="text-[#7A5C2E]">{product.sku_novo || product.code}</strong>{' '}
            • ID: {product.produto_id || product.id}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSave} className="space-y-5 py-2">
          {/* Nome */}
          <div>
            <label className="text-xs font-semibold text-[#2D2A26] block mb-1">
              Nome do produto *
            </label>
            <Input
              value={nomeProduto}
              onChange={(e) => setNomeProduto(e.target.value)}
              className="h-10 text-sm font-medium"
              required
            />
          </div>

          {/* Marca e Fornecedor */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-[#2D2A26] block mb-1">Marca</label>
              <select
                value={marcaId}
                onChange={(e) => setMarcaId(e.target.value)}
                className="w-full h-10 px-2.5 text-xs rounded-md border border-[#E5DFD5] bg-white text-[#2D2A26]"
              >
                <option value="">Selecione...</option>
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-[#2D2A26] block mb-1">Fornecedor</label>
              <Input
                value={fornecedor}
                onChange={(e) => setFornecedor(e.target.value)}
                placeholder="Nome do fornecedor..."
                className="h-10 text-xs"
              />
            </div>
          </div>

          {/* Categorias */}
          <div>
            <label className="text-xs font-semibold text-[#2D2A26] block mb-1">
              Categorias (multi-select)
            </label>
            <div className="p-2.5 rounded-xl border border-[#E5DFD5] bg-[#FDFBF7] flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
              {categories.map((cat) => {
                const isSelected = categoriaIds.includes(cat.id)
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => toggleCategory(cat.id)}
                    className={`text-xs px-2.5 py-1 rounded-lg border font-medium transition-all flex items-center gap-1.5 ${
                      isSelected
                        ? 'bg-[#7A5C2E] text-white border-[#7A5C2E]'
                        : 'bg-white text-[#6B655E] border-[#E5DFD5]'
                    }`}
                  >
                    {cat.name}
                    {isSelected && <Check className="h-3 w-3" />}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Valores */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-semibold text-[#2D2A26] block mb-1">
                Preço de venda (R$) *
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
                className="h-10 text-xs font-mono font-bold text-[#2E7D4F]"
                required
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-[#2D2A26] block mb-1">
                Preço promocional (R$)
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
                className="h-10 text-xs font-mono font-semibold"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-[#2D2A26] block mb-1">
                Custo unitário (R$)
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
                className="h-10 text-xs font-mono"
              />
            </div>
          </div>

          <p className="text-[11px] text-[#8C8275] italic">
            * Alterações de preço registrarão automaticamente uma linha no histórico de preços.
          </p>

          {/* E-commerce */}
          <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-[#FDFBF7] border border-[#E5DFD5]">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-[#2D2A26] block">No E-commerce</span>
                <span className="text-[10px] text-[#6B655E]">Publicar produto</span>
              </div>
              <Switch checked={publicarNoEcommerce} onCheckedChange={setPublicarNoEcommerce} />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-[#2D2A26] block">Destaque</span>
                <span className="text-[10px] text-[#6B655E]">Exibir com destaque</span>
              </div>
              <Switch
                checked={destaqueEcommerce}
                onCheckedChange={setDestaqueEcommerce}
                disabled={!publicarNoEcommerce}
              />
            </div>
          </div>

          {/* Descrição */}
          <div>
            <label className="text-xs font-semibold text-[#2D2A26] block mb-1">Descrição</label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="text-xs"
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-2 border-t border-[#E5DFD5]">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSaving}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isSaving}
              className="bg-[#7A5C2E] hover:bg-[#634924] text-white font-bold"
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Salvando...
                </>
              ) : (
                'Salvar Alterações'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
