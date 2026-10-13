import React, { useState, useEffect } from 'react'
import pb from '@/lib/pocketbase/client'
import { ProductType, ProductMaterial, ProductSize } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Plus, Trash2, Edit2, Check, X, Tag, Sparkles } from 'lucide-react'
import { toast } from 'sonner'

export default function AuxiliariesCrud() {
  const [types, setTypes] = useState<ProductType[]>([])
  const [materials, setMaterials] = useState<ProductMaterial[]>([])
  const [sizes, setSizes] = useState<ProductSize[]>([])

  // New item inputs
  const [newTypeName, setNewTypeName] = useState('')
  const [newMaterialName, setNewMaterialName] = useState('')
  const [newSizeName, setNewSizeName] = useState('')

  // Inline editing
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')

  useEffect(() => {
    loadAll()
  }, [])

  const loadAll = async () => {
    try {
      const [t, m, s] = await Promise.all([
        pb.collection('product_types').getFullList<ProductType>({ sort: 'name' }),
        pb.collection('product_materials').getFullList<ProductMaterial>({ sort: 'name' }),
        pb.collection('product_sizes').getFullList<ProductSize>({ sort: 'name' }),
      ])
      setTypes(t)
      setMaterials(m)
      setSizes(s)
    } catch (err) {
      console.error(err)
      toast.error('Erro ao carregar cadastros auxiliares.')
    }
  }

  // Create
  const handleCreate = async (
    collection: 'product_types' | 'product_materials' | 'product_sizes',
    name: string,
  ) => {
    if (!name.trim()) return
    try {
      await pb.collection(collection).create({ name: name.trim() })
      toast.success('Cadastrado com sucesso!')
      if (collection === 'product_types') setNewTypeName('')
      if (collection === 'product_materials') setNewMaterialName('')
      if (collection === 'product_sizes') setNewSizeName('')
      loadAll()
    } catch (err: any) {
      toast.error('Erro ao salvar: ' + (err.message || 'Item já existe.'))
    }
  }

  // Update
  const handleUpdate = async (
    collection: 'product_types' | 'product_materials' | 'product_sizes',
    id: string,
  ) => {
    if (!editingName.trim()) return
    try {
      await pb.collection(collection).update(id, { name: editingName.trim() })
      toast.success('Atualizado com sucesso!')
      setEditingId(null)
      setEditingName('')
      loadAll()
    } catch (err: any) {
      toast.error('Erro ao atualizar: ' + (err.message || ''))
    }
  }

  // Delete
  const handleDelete = async (
    collection: 'product_types' | 'product_materials' | 'product_sizes',
    id: string,
    name: string,
  ) => {
    if (
      window.confirm(`Excluir "${name}"? Produtos vinculados a este valor perderão a referência.`)
    ) {
      try {
        await pb.collection(collection).delete(id)
        toast.success('Removido!')
        loadAll()
      } catch (err) {
        toast.error('Erro ao remover.')
      }
    }
  }

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
                Catálogo de Joias — Cadastros Auxiliares
              </h1>
              <p className="text-xs text-[#6B655E] uppercase tracking-wider font-medium">
                Scaglioni Joias • Alta Joalheria
              </p>
            </div>
          </div>
          <p className="text-sm text-[#6B655E] mt-2 max-w-2xl">
            Gerencie de forma organizada os valores de Tipos de Joias, Materiais nobres e Tamanhos
            utilizados na classificação de todo o acervo.
          </p>
        </div>
      </div>

      {/* Modern spacious auxiliary cards overview */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-2xl bg-white border border-[#E5DFD5] shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs text-[#6B655E] font-medium uppercase tracking-wider">
              Tipos de Joias
            </p>
            <p className="font-serif text-2xl font-bold text-[#7A5C2E] mt-1">
              {types.length} cadastrados
            </p>
          </div>
          <div className="h-10 w-10 rounded-xl bg-[#F3EAD8] flex items-center justify-center text-[#7A5C2E]">
            <Sparkles className="h-5 w-5" />
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-[#E5DFD5] shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs text-[#6B655E] font-medium uppercase tracking-wider">
              Materiais Nobres
            </p>
            <p className="font-serif text-2xl font-bold text-[#7A5C2E] mt-1">
              {materials.length} cadastrados
            </p>
          </div>
          <div className="h-10 w-10 rounded-xl bg-[#F3EAD8] flex items-center justify-center text-[#7A5C2E]">
            <Tag className="h-5 w-5" />
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-[#E5DFD5] shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs text-[#6B655E] font-medium uppercase tracking-wider">Tamanhos</p>
            <p className="font-serif text-2xl font-bold text-[#7A5C2E] mt-1">
              {sizes.length} cadastrados
            </p>
          </div>
          <div className="h-10 w-10 rounded-xl bg-[#F3EAD8] flex items-center justify-center text-[#7A5C2E]">
            <span className="font-serif font-bold text-base text-[#7A5C2E]">#</span>
          </div>
        </div>
      </div>

      {/* Tabs with generous breathing room and clear titles without '/ Medidas' */}
      <Tabs defaultValue="types" className="w-full">
        <TabsList className="grid w-full grid-cols-3 bg-[#F3EAD8]/60 p-1.5 rounded-2xl border border-[#E5DFD5] h-14">
          <TabsTrigger
            value="types"
            className="rounded-xl font-semibold text-sm transition-all data-[state=active]:bg-white data-[state=active]:text-[#7A5C2E] data-[state=active]:shadow-xs"
          >
            Tipos de Joias ({types.length})
          </TabsTrigger>
          <TabsTrigger
            value="materials"
            className="rounded-xl font-semibold text-sm transition-all data-[state=active]:bg-white data-[state=active]:text-[#7A5C2E] data-[state=active]:shadow-xs"
          >
            Materiais ({materials.length})
          </TabsTrigger>
          <TabsTrigger
            value="sizes"
            className="rounded-xl font-semibold text-sm transition-all data-[state=active]:bg-white data-[state=active]:text-[#7A5C2E] data-[state=active]:shadow-xs"
          >
            Tamanhos ({sizes.length})
          </TabsTrigger>
        </TabsList>

        {/* Tab Types */}
        <TabsContent value="types" className="mt-6 space-y-6">
          <Card className="border-[#E5DFD5] bg-white shadow-xs rounded-2xl overflow-hidden">
            <CardHeader className="p-6 border-b border-[#E5DFD5] bg-gradient-to-r from-white via-[#FDFBF7] to-white">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <CardTitle className="font-serif text-xl text-[#2D2A26]">
                    Tipos de Joias
                  </CardTitle>
                  <CardDescription className="text-xs text-[#6B655E] mt-1">
                    Ex: Anel, Brinco, Colar, Pulseira, Gargantilha, Pingente, Corrente
                  </CardDescription>
                </div>
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-[#F3EAD8] text-[#7A5C2E] w-fit">
                  {types.length} cadastrados
                </span>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              {/* Add form */}
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  handleCreate('product_types', newTypeName)
                }}
                className="flex gap-3 bg-[#FDFBF7] p-3 rounded-xl border border-[#E5DFD5]"
              >
                <Input
                  value={newTypeName}
                  onChange={(e) => setNewTypeName(e.target.value)}
                  placeholder="Cadastrar novo tipo de joia (ex: Aliança, Tornozeleira)..."
                  className="bg-white border-[#E5DFD5] focus-visible:ring-[#C6A664] h-11"
                />
                <Button
                  type="submit"
                  className="bg-[#7A5C2E] hover:bg-[#634924] text-white px-5 h-11 shrink-0"
                >
                  <Plus className="h-4 w-4 mr-1.5" /> Adicionar Tipo
                </Button>
              </form>

              {/* Items List in spaced grid / cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {types.map((item) => (
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
                        />
                        <Button
                          size="sm"
                          onClick={() => handleUpdate('product_types', item.id)}
                          className="h-8 px-2 bg-[#2E7D4F] hover:bg-[#256640] text-white"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
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
                            title="Editar"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-[#B3261E] hover:bg-[#B3261E]/10"
                            onClick={() => handleDelete('product_types', item.id, item.name)}
                            title="Excluir"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab Materials */}
        <TabsContent value="materials" className="mt-6 space-y-6">
          <Card className="border-[#E5DFD5] bg-white shadow-xs rounded-2xl overflow-hidden">
            <CardHeader className="p-6 border-b border-[#E5DFD5] bg-gradient-to-r from-white via-[#FDFBF7] to-white">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <CardTitle className="font-serif text-xl text-[#2D2A26]">
                    Materiais de Joias
                  </CardTitle>
                  <CardDescription className="text-xs text-[#6B655E] mt-1">
                    Ex: Ouro 18k, Prata 925, Folheado a Ouro, Ouro Branco, Aço Inox
                  </CardDescription>
                </div>
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-[#F3EAD8] text-[#7A5C2E] w-fit">
                  {materials.length} cadastrados
                </span>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              {/* Add form */}
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  handleCreate('product_materials', newMaterialName)
                }}
                className="flex gap-3 bg-[#FDFBF7] p-3 rounded-xl border border-[#E5DFD5]"
              >
                <Input
                  value={newMaterialName}
                  onChange={(e) => setNewMaterialName(e.target.value)}
                  placeholder="Cadastrar novo material (ex: Ouro Rosé, Ródio Negro)..."
                  className="bg-white border-[#E5DFD5] focus-visible:ring-[#C6A664] h-11"
                />
                <Button
                  type="submit"
                  className="bg-[#7A5C2E] hover:bg-[#634924] text-white px-5 h-11 shrink-0"
                >
                  <Plus className="h-4 w-4 mr-1.5" /> Adicionar Material
                </Button>
              </form>

              {/* Items List in spaced grid / cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {materials.map((item) => (
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
                        />
                        <Button
                          size="sm"
                          onClick={() => handleUpdate('product_materials', item.id)}
                          className="h-8 px-2 bg-[#2E7D4F] hover:bg-[#256640] text-white"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
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
                            title="Editar"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-[#B3261E] hover:bg-[#B3261E]/10"
                            onClick={() => handleDelete('product_materials', item.id, item.name)}
                            title="Excluir"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab Sizes without '/ Medidas' */}
        <TabsContent value="sizes" className="mt-6 space-y-6">
          <Card className="border-[#E5DFD5] bg-white shadow-xs rounded-2xl overflow-hidden">
            <CardHeader className="p-6 border-b border-[#E5DFD5] bg-gradient-to-r from-white via-[#FDFBF7] to-white">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <CardTitle className="font-serif text-xl text-[#2D2A26]">Tamanhos</CardTitle>
                  <CardDescription className="text-xs text-[#6B655E] mt-1">
                    Ex: Único, 14, 16, 18, 20, 22, 45cm, 50cm, P, M, G
                  </CardDescription>
                </div>
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-[#F3EAD8] text-[#7A5C2E] w-fit">
                  {sizes.length} cadastrados
                </span>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              {/* Add form */}
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  handleCreate('product_sizes', newSizeName)
                }}
                className="flex gap-3 bg-[#FDFBF7] p-3 rounded-xl border border-[#E5DFD5]"
              >
                <Input
                  value={newSizeName}
                  onChange={(e) => setNewSizeName(e.target.value)}
                  placeholder="Cadastrar novo tamanho (ex: Aro 17, 60cm)..."
                  className="bg-white border-[#E5DFD5] focus-visible:ring-[#C6A664] h-11"
                />
                <Button
                  type="submit"
                  className="bg-[#7A5C2E] hover:bg-[#634924] text-white px-5 h-11 shrink-0"
                >
                  <Plus className="h-4 w-4 mr-1.5" /> Adicionar Tamanho
                </Button>
              </form>

              {/* Items List in spaced grid / cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {sizes.map((item) => (
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
                        />
                        <Button
                          size="sm"
                          onClick={() => handleUpdate('product_sizes', item.id)}
                          className="h-8 px-2 bg-[#2E7D4F] hover:bg-[#256640] text-white"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setEditingId(null)}
                          className="h-8 px-2"
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-2 min-w-0">
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
                            title="Editar"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-[#B3261E] hover:bg-[#B3261E]/10"
                            onClick={() => handleDelete('product_sizes', item.id, item.name)}
                            title="Excluir"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
