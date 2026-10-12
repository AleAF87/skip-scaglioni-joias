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
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between border-b border-[#E5DFD5] pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-lg bg-[#C6A664]/20 text-[#7A5C2E]">
              <Tag className="h-5 w-5" />
            </span>
            <h1 className="font-serif text-2xl md:text-3xl font-bold text-[#2D2A26]">
              Cadastros Auxiliares
            </h1>
          </div>
          <p className="text-sm text-[#6B655E] mt-1">
            Gerencie os valores de Tipos, Materiais e Tamanhos utilizados nos produtos e filtros.
          </p>
        </div>
      </div>

      <Tabs defaultValue="types" className="w-full">
        <TabsList className="grid w-full grid-cols-3 bg-[#F3EAD8]/50 p-1 rounded-xl">
          <TabsTrigger
            value="types"
            className="rounded-lg font-semibold data-[state=active]:bg-white data-[state=active]:text-[#7A5C2E]"
          >
            Tipos de Joias ({types.length})
          </TabsTrigger>
          <TabsTrigger
            value="materials"
            className="rounded-lg font-semibold data-[state=active]:bg-white data-[state=active]:text-[#7A5C2E]"
          >
            Materiais ({materials.length})
          </TabsTrigger>
          <TabsTrigger
            value="sizes"
            className="rounded-lg font-semibold data-[state=active]:bg-white data-[state=active]:text-[#7A5C2E]"
          >
            Tamanhos / Medidas ({sizes.length})
          </TabsTrigger>
        </TabsList>

        {/* Tab Types */}
        <TabsContent value="types" className="mt-6 space-y-4">
          <Card className="border-[#E5DFD5] bg-white">
            <CardHeader>
              <CardTitle className="font-serif text-lg text-[#2D2A26]">
                Tipos de Joias Cadastrados
              </CardTitle>
              <CardDescription>
                Ex: Anel, Brinco, Colar, Pulseira, Gargantilha, Pingente
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  handleCreate('product_types', newTypeName)
                }}
                className="flex gap-2"
              >
                <Input
                  value={newTypeName}
                  onChange={(e) => setNewTypeName(e.target.value)}
                  placeholder="Novo tipo de joia..."
                  className="border-[#E5DFD5] focus-visible:ring-[#C6A664]"
                />
                <Button type="submit" className="bg-[#7A5C2E] text-white">
                  <Plus className="h-4 w-4 mr-1.5" /> Adicionar
                </Button>
              </form>

              <div className="divide-y divide-[#E5DFD5] border border-[#E5DFD5] rounded-xl overflow-hidden">
                {types.map((item) => (
                  <div
                    key={item.id}
                    className="p-3 flex items-center justify-between hover:bg-[#FDFBF7]"
                  >
                    {editingId === item.id ? (
                      <div className="flex items-center gap-2 flex-1">
                        <Input
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          className="h-8"
                          autoFocus
                        />
                        <Button
                          size="sm"
                          onClick={() => handleUpdate('product_types', item.id)}
                          className="h-8 bg-[#2E7D4F]"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setEditingId(null)}
                          className="h-8"
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ) : (
                      <>
                        <span className="font-medium text-[#2D2A26]">{item.name}</span>
                        <div className="flex items-center gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-[#6B655E]"
                            onClick={() => {
                              setEditingId(item.id)
                              setEditingName(item.name)
                            }}
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-[#B3261E]"
                            onClick={() => handleDelete('product_types', item.id, item.name)}
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
        <TabsContent value="materials" className="mt-6 space-y-4">
          <Card className="border-[#E5DFD5] bg-white">
            <CardHeader>
              <CardTitle className="font-serif text-lg text-[#2D2A26]">
                Materiais de Joias
              </CardTitle>
              <CardDescription>
                Ex: Ouro 18k, Prata 925, Folheado a Ouro, Ouro Branco
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  handleCreate('product_materials', newMaterialName)
                }}
                className="flex gap-2"
              >
                <Input
                  value={newMaterialName}
                  onChange={(e) => setNewMaterialName(e.target.value)}
                  placeholder="Novo material..."
                  className="border-[#E5DFD5] focus-visible:ring-[#C6A664]"
                />
                <Button type="submit" className="bg-[#7A5C2E] text-white">
                  <Plus className="h-4 w-4 mr-1.5" /> Adicionar
                </Button>
              </form>

              <div className="divide-y divide-[#E5DFD5] border border-[#E5DFD5] rounded-xl overflow-hidden">
                {materials.map((item) => (
                  <div
                    key={item.id}
                    className="p-3 flex items-center justify-between hover:bg-[#FDFBF7]"
                  >
                    {editingId === item.id ? (
                      <div className="flex items-center gap-2 flex-1">
                        <Input
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          className="h-8"
                          autoFocus
                        />
                        <Button
                          size="sm"
                          onClick={() => handleUpdate('product_materials', item.id)}
                          className="h-8 bg-[#2E7D4F]"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setEditingId(null)}
                          className="h-8"
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ) : (
                      <>
                        <span className="font-medium text-[#2D2A26]">{item.name}</span>
                        <div className="flex items-center gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-[#6B655E]"
                            onClick={() => {
                              setEditingId(item.id)
                              setEditingName(item.name)
                            }}
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-[#B3261E]"
                            onClick={() => handleDelete('product_materials', item.id, item.name)}
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

        {/* Tab Sizes */}
        <TabsContent value="sizes" className="mt-6 space-y-4">
          <Card className="border-[#E5DFD5] bg-white">
            <CardHeader>
              <CardTitle className="font-serif text-lg text-[#2D2A26]">
                Tamanhos e Medidas
              </CardTitle>
              <CardDescription>Ex: Único, 16, 18, 20, 45cm, 50cm, P, M, G</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  handleCreate('product_sizes', newSizeName)
                }}
                className="flex gap-2"
              >
                <Input
                  value={newSizeName}
                  onChange={(e) => setNewSizeName(e.target.value)}
                  placeholder="Novo tamanho ou medida..."
                  className="border-[#E5DFD5] focus-visible:ring-[#C6A664]"
                />
                <Button type="submit" className="bg-[#7A5C2E] text-white">
                  <Plus className="h-4 w-4 mr-1.5" /> Adicionar
                </Button>
              </form>

              <div className="divide-y divide-[#E5DFD5] border border-[#E5DFD5] rounded-xl overflow-hidden">
                {sizes.map((item) => (
                  <div
                    key={item.id}
                    className="p-3 flex items-center justify-between hover:bg-[#FDFBF7]"
                  >
                    {editingId === item.id ? (
                      <div className="flex items-center gap-2 flex-1">
                        <Input
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          className="h-8"
                          autoFocus
                        />
                        <Button
                          size="sm"
                          onClick={() => handleUpdate('product_sizes', item.id)}
                          className="h-8 bg-[#2E7D4F]"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setEditingId(null)}
                          className="h-8"
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ) : (
                      <>
                        <span className="font-medium text-[#2D2A26]">{item.name}</span>
                        <div className="flex items-center gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-[#6B655E]"
                            onClick={() => {
                              setEditingId(item.id)
                              setEditingName(item.name)
                            }}
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-[#B3261E]"
                            onClick={() => handleDelete('product_sizes', item.id, item.name)}
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
