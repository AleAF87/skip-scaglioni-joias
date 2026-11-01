import React, { useState, useEffect } from 'react'
import pb from '@/lib/pocketbase/client'
import { ProductCategory } from '@/types'
import { productService } from '@/services/productService'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Tag,
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  Search,
  AlertTriangle,
  Loader2,
  Package,
} from 'lucide-react'
import { toast } from 'sonner'

export function CategoriesCrud() {
  const [categories, setCategories] = useState<ProductCategory[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')

  // Create
  const [newCatName, setNewCatName] = useState('')
  const [isCreating, setIsCreating] = useState(false)

  // Edit in place
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [isUpdating, setIsUpdating] = useState(false)

  // Delete modal with warning
  const [categoryToDelete, setCategoryToDelete] = useState<ProductCategory | null>(null)
  const [isCheckingUsage, setIsCheckingUsage] = useState(false)
  const [usageCount, setUsageCount] = useState<number | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  useEffect(() => {
    loadCategories()
  }, [])

  const loadCategories = async () => {
    setIsLoading(true)
    try {
      const list = await pb.collection('product_categories').getFullList<ProductCategory>({
        sort: 'name',
      })
      setCategories(list)
    } catch (err: any) {
      console.error(err)
      toast.error('Erro ao carregar categorias.')
    } finally {
      setIsLoading(false)
    }
  }

  // Create category
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    const nameTrimmed = newCatName.trim()
    if (!nameTrimmed) return

    setIsCreating(true)
    try {
      const slug = nameTrimmed
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')

      await pb.collection('product_categories').create({
        name: nameTrimmed,
        slug: slug || `cat-${Date.now()}`,
      })
      toast.success(`Categoria "${nameTrimmed}" cadastrada com sucesso!`)
      setNewCatName('')
      loadCategories()
    } catch (err: any) {
      console.error(err)
      toast.error('Erro ao cadastrar: ' + (err.message || 'Item já existe.'))
    } finally {
      setIsCreating(false)
    }
  }

  // Update category
  const handleUpdate = async (id: string) => {
    const nameTrimmed = editingName.trim()
    if (!nameTrimmed) return

    setIsUpdating(true)
    try {
      const slug = nameTrimmed
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')

      await pb.collection('product_categories').update(id, {
        name: nameTrimmed,
        slug: slug || undefined,
      })
      toast.success('Categoria atualizada com sucesso!')
      setEditingId(null)
      setEditingName('')
      loadCategories()
    } catch (err: any) {
      console.error(err)
      toast.error('Erro ao atualizar: ' + (err.message || ''))
    } finally {
      setIsUpdating(false)
    }
  }

  // Open delete confirmation modal and check usage
  const openDeleteModal = async (cat: ProductCategory) => {
    setCategoryToDelete(cat)
    setUsageCount(null)
    setIsCheckingUsage(true)
    try {
      const count = await productService.countProductsByCategory(cat.id)
      setUsageCount(count)
    } catch (err) {
      console.error(err)
      setUsageCount(0)
    } finally {
      setIsCheckingUsage(false)
    }
  }

  // Confirm delete
  const handleConfirmDelete = async () => {
    if (!categoryToDelete) return
    setIsDeleting(true)
    try {
      // Remover vínculos da categoria antes de apagar
      const links = await pb
        .collection('product_category_links')
        .getFullList({
          filter: `category = '${categoryToDelete.id}'`,
        })
        .catch(() => [])

      if (links.length > 0) {
        await Promise.all(
          links.map((link) =>
            pb
              .collection('product_category_links')
              .delete(link.id)
              .catch(() => null),
          ),
        )
      }

      await pb.collection('product_categories').delete(categoryToDelete.id)
      toast.success(`Categoria "${categoryToDelete.name}" excluída!`)
      setCategoryToDelete(null)
      loadCategories()
    } catch (err: any) {
      console.error(err)
      toast.error('Erro ao excluir categoria: ' + (err.message || ''))
    } finally {
      setIsDeleting(false)
    }
  }

  const filteredCategories = categories.filter((c) =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase().trim()),
  )

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#E5DFD5] pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="p-2.5 rounded-xl bg-gradient-to-tr from-[#7A5C2E]/20 via-[#C6A664]/30 to-[#E8D5A3]/40 text-[#7A5C2E] shadow-xs">
              <Tag className="h-6 w-6" />
            </span>
            <div>
              <h1 className="font-serif text-2xl md:text-3xl font-bold text-[#2D2A26]">
                Categorias de Produtos
              </h1>
              <p className="text-xs text-[#6B655E] uppercase tracking-wider font-medium">
                Scaglioni Joias • Cadastro Auxiliar
              </p>
            </div>
          </div>
          <p className="text-sm text-[#6B655E] mt-2 max-w-2xl">
            Gerencie as categorias de joias do catálogo. Cada produto pode pertencer a uma ou mais
            categorias simultaneamente (seleção múltipla).
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-[#E5DFD5] shadow-xs flex items-center justify-between min-w-[200px]">
          <div>
            <p className="text-xs text-[#6B655E] font-medium uppercase tracking-wider">
              Total de Categorias
            </p>
            <p className="font-serif text-2xl font-bold text-[#7A5C2E] mt-1">
              {categories.length} cadastradas
            </p>
          </div>
          <div className="h-10 w-10 rounded-xl bg-[#F3EAD8] flex items-center justify-center text-[#7A5C2E]">
            <Package className="h-5 w-5" />
          </div>
        </div>
      </div>

      {/* Main Card */}
      <Card className="border-[#E5DFD5] bg-white shadow-xs rounded-2xl overflow-hidden">
        <CardHeader className="p-6 border-b border-[#E5DFD5] bg-gradient-to-r from-white via-[#FDFBF7] to-white">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <CardTitle className="font-serif text-xl text-[#2D2A26]">
                Lista de Categorias
              </CardTitle>
              <CardDescription className="text-xs text-[#6B655E] mt-1">
                Ex: Anéis Solitários, Brincos de Festa, Alianças de Casamento, Gargantilhas de Ouro
              </CardDescription>
            </div>

            {/* Search Input */}
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#6B655E]" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar categoria..."
                className="pl-9 bg-white border-[#E5DFD5] focus-visible:ring-[#C6A664] h-10 text-sm"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-[#6B655E] hover:text-[#2D2A26]"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-6 space-y-6">
          {/* Add form */}
          <form
            onSubmit={handleCreate}
            className="flex flex-col sm:flex-row gap-3 bg-[#FDFBF7] p-3 rounded-xl border border-[#E5DFD5]"
          >
            <Input
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              placeholder="Cadastrar nova categoria (ex: Pingentes Religiosos, Linha Noiva)..."
              className="bg-white border-[#E5DFD5] focus-visible:ring-[#C6A664] h-11 flex-1"
            />
            <Button
              type="submit"
              disabled={isCreating || !newCatName.trim()}
              className="bg-[#7A5C2E] hover:bg-[#634924] text-white px-5 h-11 shrink-0 font-semibold"
            >
              {isCreating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Salvando...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-1.5" /> Adicionar Categoria
                </>
              )}
            </Button>
          </form>

          {/* Items List */}
          {isLoading ? (
            <div className="py-12 flex flex-col items-center justify-center text-[#6B655E] gap-2">
              <Loader2 className="h-6 w-6 animate-spin text-[#C6A664]" />
              <span className="text-xs">Carregando categorias...</span>
            </div>
          ) : filteredCategories.length === 0 ? (
            <div className="py-12 text-center text-[#6B655E]">
              {searchQuery ? (
                <p className="text-sm">Nenhuma categoria encontrada para "{searchQuery}".</p>
              ) : (
                <p className="text-sm italic">Nenhuma categoria cadastrada ainda.</p>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {filteredCategories.map((item) => (
                <div
                  key={item.id}
                  className="p-3.5 rounded-xl border border-[#E5DFD5] bg-[#FDFBF7]/60 hover:bg-[#FDFBF7] hover:border-[#C6A664]/60 transition-all flex items-center justify-between gap-2 group"
                >
                  {editingId === item.id ? (
                    <div className="flex items-center gap-1.5 flex-1">
                      <Input
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        className="h-8 text-sm bg-white"
                        autoFocus
                        disabled={isUpdating}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleUpdate(item.id)
                          if (e.key === 'Escape') setEditingId(null)
                        }}
                      />
                      <Button
                        size="sm"
                        disabled={isUpdating || !editingName.trim()}
                        onClick={() => handleUpdate(item.id)}
                        className="h-8 px-2 bg-[#2E7D4F] hover:bg-[#256640] text-white"
                      >
                        {isUpdating ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Check className="h-3.5 w-3.5" />
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={isUpdating}
                        onClick={() => setEditingId(null)}
                        className="h-8 px-2"
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="h-2 w-2 rounded-full bg-[#C6A664] shrink-0" />
                        <span className="font-semibold text-sm text-[#2D2A26] truncate">
                          {item.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0 opacity-80 group-hover:opacity-100">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-[#6B655E] hover:text-[#7A5C2E] hover:bg-white"
                          onClick={() => {
                            setEditingId(item.id)
                            setEditingName(item.name)
                          }}
                          title="Editar Categoria"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-[#B3261E] hover:bg-[#B3261E]/10"
                          onClick={() => openDeleteModal(item)}
                          title="Excluir Categoria"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Modal with Usage Count Warning */}
      <Dialog
        open={Boolean(categoryToDelete)}
        onOpenChange={(open) => {
          if (!open) setCategoryToDelete(null)
        }}
      >
        <DialogContent className="max-w-md bg-white">
          <DialogHeader>
            <div className="flex items-center gap-2 text-[#B3261E] mb-1">
              <AlertTriangle className="h-5 w-5" />
              <DialogTitle className="font-serif text-lg text-[#2D2A26]">
                Excluir Categoria
              </DialogTitle>
            </div>
            <DialogDescription className="text-sm text-[#6B655E]">
              Você tem certeza de que deseja remover a categoria{' '}
              <strong className="text-[#2D2A26]">"{categoryToDelete?.name}"</strong>?
            </DialogDescription>
          </DialogHeader>

          <div className="py-3">
            {isCheckingUsage ? (
              <div className="flex items-center gap-2 text-xs text-[#6B655E] p-3 rounded-lg bg-[#FDFBF7] border border-[#E5DFD5]">
                <Loader2 className="h-4 w-4 animate-spin text-[#C6A664]" />
                <span>Verificando peças vinculadas a esta categoria...</span>
              </div>
            ) : usageCount !== null && usageCount > 0 ? (
              <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs space-y-1.5">
                <p className="font-semibold flex items-center gap-1.5 text-amber-800">
                  <span>⚠️</span> Esta categoria está em uso em {usageCount}{' '}
                  {usageCount === 1 ? 'produto cadastrado' : 'produtos cadastrados'}!
                </p>
                <p className="text-[11px] text-amber-700 leading-relaxed">
                  Ao confirmar a exclusão, essas peças perderão este vínculo de categoria (as peças
                  continuam no estoque e mantêm outras categorias que possuírem).
                </p>
              </div>
            ) : (
              <div className="p-3 rounded-xl bg-[#FDFBF7] border border-[#E5DFD5] text-xs text-[#6B655E]">
                Nenhuma peça está vinculada a esta categoria no momento. A exclusão é segura.
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setCategoryToDelete(null)}
              disabled={isDeleting}
              className="border-[#E5DFD5] text-[#2D2A26]"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleConfirmDelete}
              disabled={isDeleting || isCheckingUsage}
              className="bg-[#B3261E] hover:bg-[#911F18] text-white font-semibold"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Excluindo...
                </>
              ) : (
                'Confirmar Exclusão'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
export default CategoriesCrud
