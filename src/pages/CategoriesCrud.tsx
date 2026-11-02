import React, { useState, useEffect, useMemo } from 'react'
import pb from '@/lib/pocketbase/client'
import { ProductCategory, ProductCategoryGroup } from '@/types'
import { productService } from '@/services/productService'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
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
  Archive,
  ArchiveRestore,
  Edit2,
  Check,
  X,
  Search,
  AlertTriangle,
  Loader2,
  Package,
  Layers,
  Sparkles,
} from 'lucide-react'
import { toast } from 'sonner'

export function CategoriesCrud() {
  const { isSuperAdmin } = useAuth()

  // Abas: "metal" (primeira à esquerda) e "tipo" (segunda)
  const [activeTab, setActiveTab] = useState<ProductCategoryGroup>('metal')

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

  // Archive modal with warning
  const [categoryToArchive, setCategoryToArchive] = useState<ProductCategory | null>(null)
  const [isCheckingUsage, setIsCheckingUsage] = useState(false)
  const [usageCount, setUsageCount] = useState<number | null>(null)
  const [isArchiving, setIsArchiving] = useState(false)

  // Unarchive loading
  const [unarchivingId, setUnarchivingId] = useState<string | null>(null)

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

  // Create category in activeTab
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
        group: activeTab,
        archived: false,
      })

      const groupLabel = activeTab === 'metal' ? 'Metal' : 'Tipo'
      toast.success(`${groupLabel} "${nameTrimmed}" cadastrado com sucesso!`)
      setNewCatName('')
      loadCategories()
    } catch (err: any) {
      console.error(err)
      const data = err?.response?.data
      if (
        data?.name?.code === 'validation_not_unique' ||
        data?.slug?.code === 'validation_not_unique'
      ) {
        toast.error('Já existe um item com este nome nesta aba.')
      } else {
        toast.error('Erro ao cadastrar: ' + (err.message || 'Item já existe.'))
      }
    } finally {
      setIsCreating(false)
    }
  }

  // Update category (rename)
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
      toast.success('Item atualizado com sucesso!')
      setEditingId(null)
      setEditingName('')
      loadCategories()
    } catch (err: any) {
      console.error(err)
      const data = err?.response?.data
      if (
        data?.name?.code === 'validation_not_unique' ||
        data?.slug?.code === 'validation_not_unique'
      ) {
        toast.error('Já existe um item com este nome nesta aba.')
      } else {
        toast.error('Erro ao atualizar: ' + (err.message || ''))
      }
    } finally {
      setIsUpdating(false)
    }
  }

  // Open archive confirmation modal and check usage
  const openArchiveModal = async (cat: ProductCategory) => {
    setCategoryToArchive(cat)
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

  // Confirm archive: archived = true
  const handleConfirmArchive = async () => {
    if (!categoryToArchive) return
    setIsArchiving(true)
    try {
      await pb.collection('product_categories').update(categoryToArchive.id, {
        archived: true,
      })
      toast.success(`"${categoryToArchive.name}" arquivado com sucesso!`)
      setCategoryToArchive(null)
      loadCategories()
    } catch (err: any) {
      console.error(err)
      toast.error('Erro ao arquivar: ' + (err.message || ''))
    } finally {
      setIsArchiving(false)
    }
  }

  // Unarchive: archived = false (superadmin only)
  const handleUnarchive = async (cat: ProductCategory) => {
    setUnarchivingId(cat.id)
    try {
      await pb.collection('product_categories').update(cat.id, {
        archived: false,
      })
      toast.success(`"${cat.name}" desarquivado com sucesso!`)
      loadCategories()
    } catch (err: any) {
      console.error(err)
      toast.error('Erro ao desarquivar: ' + (err.message || ''))
    } finally {
      setUnarchivingId(null)
    }
  }

  // Categorias visíveis na aba atual
  // - Para admin/operador/revendedora: archived != true
  // - Para superadmin: visíveis todos, com badge arquivado se archived === true
  const tabCategories = useMemo(() => {
    return categories.filter((c) => {
      const itemGroup: ProductCategoryGroup = c.group === 'metal' ? 'metal' : 'tipo'
      if (itemGroup !== activeTab) return false
      if (!isSuperAdmin && c.archived) return false
      return true
    })
  }, [categories, activeTab, isSuperAdmin])

  const filteredCategories = useMemo(() => {
    const q = searchQuery.toLowerCase().trim()
    if (!q) return tabCategories
    return tabCategories.filter((c) => c.name.toLowerCase().includes(q))
  }, [tabCategories, searchQuery])

  // Contagens para resumo
  const metalCount = useMemo(
    () => categories.filter((c) => c.group === 'metal' && (isSuperAdmin || !c.archived)).length,
    [categories, isSuperAdmin],
  )
  const tipoCount = useMemo(
    () => categories.filter((c) => c.group !== 'metal' && (isSuperAdmin || !c.archived)).length,
    [categories, isSuperAdmin],
  )

  const tabTitle = activeTab === 'metal' ? 'Metal' : 'Tipo'
  const tabPlaceholder =
    activeTab === 'metal'
      ? 'Cadastrar novo metal (ex: Ouro 18k, Ouro Branco, Prata 925, Ródio Negro)...'
      : 'Cadastrar novo tipo (ex: Anéis Solitários, Brincos de Festa, Alianças)...'
  const tabDescription =
    activeTab === 'metal'
      ? 'Ex: Ouro 18k, Ouro Amarelo, Ouro Branco, Prata 925, Banho de Ródio, Aço Inox'
      : 'Ex: Anéis Solitários, Brincos de Festa, Alianças de Casamento, Gargantilhas, Choker'

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
            Gerencie as categorias de joias divididas em <strong>Metal</strong> e{' '}
            <strong>Tipo</strong>. Cada produto pode pertencer a uma ou mais categorias por
            referência de ID (renomear atualiza os produtos automaticamente).
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="p-3.5 rounded-2xl bg-white border border-[#E5DFD5] shadow-xs flex items-center gap-3 min-w-[150px]">
            <div className="h-9 w-9 rounded-xl bg-[#F3EAD8] flex items-center justify-center text-[#7A5C2E]">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <p className="text-[10px] text-[#6B655E] font-medium uppercase tracking-wider">
                Metais
              </p>
              <p className="font-serif text-lg font-bold text-[#7A5C2E] leading-tight">
                {metalCount}
              </p>
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-white border border-[#E5DFD5] shadow-xs flex items-center gap-3 min-w-[150px]">
            <div className="h-9 w-9 rounded-xl bg-[#F3EAD8] flex items-center justify-center text-[#7A5C2E]">
              <Package className="h-4 w-4" />
            </div>
            <div>
              <p className="text-[10px] text-[#6B655E] font-medium uppercase tracking-wider">
                Tipos
              </p>
              <p className="font-serif text-lg font-bold text-[#7A5C2E] leading-tight">
                {tipoCount}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs Switcher: Metal (1º) e Tipo (2º) */}
      <div className="flex items-center gap-2 p-1.5 rounded-2xl bg-[#F3EAD8]/50 border border-[#E5DFD5] w-fit">
        <button
          type="button"
          onClick={() => {
            setActiveTab('metal')
            setEditingId(null)
          }}
          className={`px-5 py-2.5 rounded-xl font-serif text-sm font-bold transition-all flex items-center gap-2 ${
            activeTab === 'metal'
              ? 'bg-[#7A5C2E] text-white shadow-sm'
              : 'text-[#6B655E] hover:text-[#2D2A26] hover:bg-white/60'
          }`}
        >
          <Sparkles className="h-4 w-4" />
          <span>Metal</span>
          <span
            className={`text-xs px-2 py-0.5 rounded-full font-mono ${
              activeTab === 'metal' ? 'bg-white/20 text-white' : 'bg-[#E5DFD5] text-[#6B655E]'
            }`}
          >
            {metalCount}
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('tipo')
            setEditingId(null)
          }}
          className={`px-5 py-2.5 rounded-xl font-serif text-sm font-bold transition-all flex items-center gap-2 ${
            activeTab === 'tipo'
              ? 'bg-[#7A5C2E] text-white shadow-sm'
              : 'text-[#6B655E] hover:text-[#2D2A26] hover:bg-white/60'
          }`}
        >
          <Layers className="h-4 w-4" />
          <span>Tipo</span>
          <span
            className={`text-xs px-2 py-0.5 rounded-full font-mono ${
              activeTab === 'tipo' ? 'bg-white/20 text-white' : 'bg-[#E5DFD5] text-[#6B655E]'
            }`}
          >
            {tipoCount}
          </span>
        </button>
      </div>

      {/* Main Card */}
      <Card className="border-[#E5DFD5] bg-white shadow-xs rounded-2xl overflow-hidden">
        <CardHeader className="p-6 border-b border-[#E5DFD5] bg-gradient-to-r from-white via-[#FDFBF7] to-white">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <CardTitle className="font-serif text-xl text-[#2D2A26]">Aba: {tabTitle}</CardTitle>
                <Badge
                  variant="outline"
                  className="bg-[#F3EAD8] text-[#7A5C2E] border-[#E5DFD5] font-semibold text-[11px]"
                >
                  {filteredCategories.length} {filteredCategories.length === 1 ? 'item' : 'itens'}
                </Badge>
              </div>
              <CardDescription className="text-xs text-[#6B655E] mt-1">
                {tabDescription}
              </CardDescription>
            </div>

            {/* Search Input */}
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#6B655E]" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={`Buscar em ${tabTitle.toLowerCase()}...`}
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
              placeholder={tabPlaceholder}
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
                  <Plus className="h-4 w-4 mr-1.5" /> Adicionar a {tabTitle}
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
            <div className="py-12 text-center text-[#6B655E] space-y-1">
              {searchQuery ? (
                <p className="text-sm">
                  Nenhum item de {tabTitle.toLowerCase()} encontrado para "{searchQuery}".
                </p>
              ) : (
                <>
                  <p className="text-sm italic font-medium">
                    Nenhum item cadastrado na aba {tabTitle} ainda.
                  </p>
                  <p className="text-xs text-[#8C8275]">
                    {activeTab === 'metal'
                      ? 'Adicione metais como "Ouro 18k", "Prata 925" no campo acima.'
                      : 'Adicione tipos de joias no campo acima.'}
                  </p>
                </>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {filteredCategories.map((item) => {
                const isArchived = Boolean(item.archived)

                return (
                  <div
                    key={item.id}
                    className={`p-3.5 rounded-xl border transition-all flex items-center justify-between gap-2 group ${
                      isArchived
                        ? 'border-dashed border-amber-300 bg-amber-50/40 hover:bg-amber-50/70'
                        : 'border-[#E5DFD5] bg-[#FDFBF7]/60 hover:bg-[#FDFBF7] hover:border-[#C6A664]/60'
                    }`}
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
                          <span
                            className={`h-2 w-2 rounded-full shrink-0 ${
                              isArchived ? 'bg-amber-500' : 'bg-[#C6A664]'
                            }`}
                          />
                          <div className="min-w-0">
                            <span
                              className={`font-semibold text-sm truncate block ${
                                isArchived ? 'text-[#6B655E] line-through' : 'text-[#2D2A26]'
                              }`}
                            >
                              {item.name}
                            </span>
                            {isArchived && isSuperAdmin && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700 bg-amber-100 px-1.5 py-0.2 rounded mt-0.5">
                                <Archive className="h-2.5 w-2.5" /> Arquivado
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0 opacity-80 group-hover:opacity-100">
                          {/* Editar */}
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-[#6B655E] hover:text-[#7A5C2E] hover:bg-white"
                            onClick={() => {
                              setEditingId(item.id)
                              setEditingName(item.name)
                            }}
                            title="Editar nome (reflete automaticamente nos produtos por ID)"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </Button>

                          {/* Se arquivado e for superadmin: botão Desarquivar */}
                          {isArchived && isSuperAdmin ? (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-amber-700 hover:bg-amber-100"
                              onClick={() => handleUnarchive(item)}
                              disabled={unarchivingId === item.id}
                              title="Desarquivar Categoria"
                            >
                              {unarchivingId === item.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <ArchiveRestore className="h-3.5 w-3.5" />
                              )}
                            </Button>
                          ) : (
                            /* Botão Arquivar (substitui lixeira) */
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-[#8C8275] hover:text-amber-800 hover:bg-amber-50"
                              onClick={() => openArchiveModal(item)}
                              title="Arquivar Categoria"
                            >
                              <Archive className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Archive Confirmation Modal with Usage Count Warning */}
      <Dialog
        open={Boolean(categoryToArchive)}
        onOpenChange={(open) => {
          if (!open) setCategoryToArchive(null)
        }}
      >
        <DialogContent className="max-w-md bg-white">
          <DialogHeader>
            <div className="flex items-center gap-2 text-amber-700 mb-1">
              <Archive className="h-5 w-5" />
              <DialogTitle className="font-serif text-lg text-[#2D2A26]">
                Arquivar {categoryToArchive?.group === 'metal' ? 'Metal' : 'Tipo de Categoria'}
              </DialogTitle>
            </div>
            <DialogDescription className="text-sm text-[#6B655E]">
              Você tem certeza de que deseja arquivar{' '}
              <strong className="text-[#2D2A26]">"{categoryToArchive?.name}"</strong>?
            </DialogDescription>
          </DialogHeader>

          <div className="py-3">
            {isCheckingUsage ? (
              <div className="flex items-center gap-2 text-xs text-[#6B655E] p-3 rounded-lg bg-[#FDFBF7] border border-[#E5DFD5]">
                <Loader2 className="h-4 w-4 animate-spin text-[#C6A664]" />
                <span>Verificando peças vinculadas a este item...</span>
              </div>
            ) : usageCount !== null && usageCount > 0 ? (
              <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs space-y-1.5">
                <p className="font-semibold flex items-center gap-1.5 text-amber-800">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-700" />
                  Este item está em uso em {usageCount}{' '}
                  {usageCount === 1 ? 'produto cadastrado' : 'produtos cadastrados'}!
                </p>
                <p className="text-[11px] text-amber-700 leading-relaxed">
                  Os produtos que já utilizam este item{' '}
                  <strong>mantêm o vínculo e o nome continuará sendo exibido normalmente</strong>. O
                  item apenas deixará de aparecer como nova opção nos seletores de produtos.
                </p>
              </div>
            ) : (
              <div className="p-3 rounded-xl bg-[#FDFBF7] border border-[#E5DFD5] text-xs text-[#6B655E]">
                Nenhuma peça está vinculada a este item no momento. Ao arquivar, ele não será
                exibido para seleção em novos produtos.
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setCategoryToArchive(null)}
              disabled={isArchiving}
              className="border-[#E5DFD5] text-[#2D2A26]"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleConfirmArchive}
              disabled={isArchiving || isCheckingUsage}
              className="bg-amber-700 hover:bg-amber-800 text-white font-semibold flex items-center gap-1.5"
            >
              {isArchiving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Arquivando...
                </>
              ) : (
                <>
                  <Archive className="h-4 w-4" /> Confirmar Arquivamento
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default CategoriesCrud
