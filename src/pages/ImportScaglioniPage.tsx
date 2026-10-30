import React, { useState, useRef, useEffect } from 'react'
import {
  Upload,
  FileCode,
  CheckCircle2,
  AlertTriangle,
  Play,
  RotateCcw,
  Eye,
  Info,
  Layers,
  Image,
  Tag,
  Hash,
  GitMerge,
  Search,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { toast } from '@/hooks/use-toast'
import { productService } from '@/services/productService'
import { formatCurrency } from '@/lib/formatters'
import { decodeFileTolerant, parseCsvRows } from '@/lib/csvParser'
import { Product } from '@/types'

// Mapeamento Scaglioni
const SCAGLIONI_COLUMN_MAP: Record<string, string> = {
  id: 'id_scaglioni',
  nome: 'nome_produto',
  slug: 'slug_scaglioni',
  descricao: 'descricao',
  description: 'descricao',
  sku: 'sku_scaglioni',
  marca: 'marca',
  marca_id: 'marca_id',
  categoria: 'categoria',
  categoria_id: 'categoria_id',
  categorias: 'categorias',
  categoria_principal: 'categoria_principal',
  preco: 'preco_venda',
  preco_venda: 'preco_venda',
  preco_promocional: 'preco_promocional',
  estoque: 'saldo_inicial_scaglioni',
  quantidade: 'saldo_inicial_scaglioni',
  imagem_url: 'imagem_url',
  image_url: 'imagem_url',
  urls_imagens: 'urls_imagens',
  arquivos_imagens: 'arquivos_imagens',
  altura_cm: 'altura_cm',
  largura_cm: 'largura_cm',
  comprimento_cm: 'comprimento_cm',
  peso_g: 'peso_g',
  ativo: 'estado_ativo_ecommerce',
  destaque: 'destaque_ecommerce',
  created_at: 'created_at_scaglioni',
  updated_at: 'updated_at_scaglioni',
}

export function ImportScaglioniPage() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [parsedRows, setParsedRows] = useState<any[]>([])
  const [isParsing, setIsParsing] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [runResult, setRunResult] = useState<any | null>(null)
  const [activeTab, setActiveTab] = useState<'preview' | 'validation' | 'association' | 'report'>(
    'preview',
  )
  const [searchTerm, setSearchTerm] = useState('')

  // Conciliação manual / Associação Tecson <-> Scaglioni
  const [allProducts, setAllProducts] = useState<Product[]>([])
  const [associationModalOpen, setAssociationModalOpen] = useState(false)
  const [selectedTecsonProduct, setSelectedTecsonProduct] = useState<Product | null>(null)
  const [selectedScaglioniProduct, setSelectedScaglioniProduct] = useState<Product | null>(null)
  const [chosenStockOrigin, setChosenStockOrigin] = useState<'Tecson' | 'Scaglioni'>('Tecson')
  const [isAssociating, setIsAssociating] = useState(false)

  const loadExistingProducts = async () => {
    try {
      const res = await productService.getProducts({ perPage: 200 })
      setAllProducts(res.items)
    } catch {
      // Ignorar falha de carregamento inicial
    }
  }

  useEffect(() => {
    loadExistingProducts()
  }, [])

  const parseBrazilianNumber = (val: any): number => {
    if (typeof val === 'number') return val
    if (!val) return 0
    let str = String(val)
      .trim()
      .replace(/R\$\s*/gi, '')
      .replace(/\s+/g, '')
    if (str.includes(',') && str.includes('.')) {
      str = str.replace(/\./g, '').replace(',', '.')
    } else if (str.includes(',')) {
      str = str.replace(',', '.')
    }
    const n = parseFloat(str)
    return isNaN(n) ? 0 : n
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setSelectedFile(file)
    setIsParsing(true)
    setRunResult(null)
    setParsedRows([])

    try {
      const isJson = file.name.endsWith('.json')
      const decoded = await decodeFileTolerant(file)
      const text = typeof decoded === 'string' ? decoded : decoded.text

      if (isJson) {
        const jsonData = JSON.parse(text)
        const arrayData = Array.isArray(jsonData) ? jsonData : jsonData.products || [jsonData]
        const mapped = arrayData.map((item: any, idx: number) => {
          const precoVenda = parseBrazilianNumber(item.preco || item.preco_venda)
          const precoPromo =
            item.preco_promocional !== undefined &&
            item.preco_promocional !== null &&
            item.preco_promocional !== ''
              ? parseBrazilianNumber(item.preco_promocional)
              : null

          return {
            index: idx + 1,
            id_scaglioni: item.id ? String(item.id).trim() : '',
            nome_produto: (item.nome || item.nome_produto || '').trim(),
            slug_scaglioni: (item.slug || item.slug_scaglioni || '').trim(),
            descricao: item.descricao || item.description || '',
            sku_scaglioni: (item.sku || item.sku_scaglioni || '').trim(),
            marca: item.marca || (item.marca_id?.name ? item.marca_id.name : ''),
            categorias: Array.isArray(item.categorias)
              ? item.categorias
              : item.categoria
                ? [item.categoria]
                : [],
            categoria_principal:
              item.categoria_principal || item.categorias?.[0] || item.categoria || '',
            preco_venda: precoVenda,
            preco_promocional: precoPromo,
            estoque: parseInt(item.estoque || item.quantidade, 10) || 0,
            imagem_url: item.imagem_url || item.image_url || '',
            urls_imagens: Array.isArray(item.urls_imagens) ? item.urls_imagens : [],
            altura_cm: parseFloat(item.altura_cm) || null,
            largura_cm: parseFloat(item.largura_cm) || null,
            comprimento_cm: parseFloat(item.comprimento_cm) || null,
            peso_g: parseFloat(item.peso_g) || null,
            ativo: item.ativo !== undefined ? !!item.ativo : true,
            destaque: !!item.destaque,
            created_at: item.created_at || '',
            updated_at: item.updated_at || '',
          }
        })
        setParsedRows(mapped)
      } else {
        // CSV com separador ; ou ,
        const rawMatrix = parseCsvRows(text)
        if (rawMatrix.length < 2) {
          toast({
            title: 'Arquivo vazio',
            description: 'O CSV Scaglioni não possui registros de dados.',
            variant: 'destructive',
          })
          setIsParsing(false)
          return
        }

        const rawHeaders = rawMatrix[0]
        const headerIndexMap: Record<number, string> = {}
        rawHeaders.forEach((h, i) => {
          const cleanH = h
            .trim()
            .toLowerCase()
            .replace(/[\s\-_]+/g, '_')
          const mappedKey = SCAGLIONI_COLUMN_MAP[cleanH] || cleanH
          headerIndexMap[i] = mappedKey
        })

        const rows: any[] = []
        for (let r = 1; r < rawMatrix.length; r++) {
          const row = rawMatrix[r]
          if (row.length === 0 || (row.length === 1 && !row[0].trim())) continue

          const rowObj: Record<string, any> = {}
          row.forEach((val, idx) => {
            const key = headerIndexMap[idx]
            if (key) rowObj[key] = val.trim()
          })

          const precoVenda = parseBrazilianNumber(rowObj['preco_venda'] || rowObj['preco'])
          const precoPromo = rowObj['preco_promocional']
            ? parseBrazilianNumber(rowObj['preco_promocional'])
            : null

          // Separador de categorias no CSV pode ser | conforme especificação
          let cats: string[] = []
          if (rowObj['categorias']) {
            cats = rowObj['categorias']
              .split('|')
              .map((c: string) => c.trim())
              .filter(Boolean)
          } else if (rowObj['categoria']) {
            cats = [rowObj['categoria']]
          }

          let galleryUrls: string[] = []
          if (rowObj['urls_imagens']) {
            galleryUrls = rowObj['urls_imagens']
              .split('|')
              .map((u: string) => u.trim())
              .filter(Boolean)
          }

          rows.push({
            index: r,
            id_scaglioni: rowObj['id_scaglioni'] || rowObj['id'] || '',
            nome_produto: rowObj['nome_produto'] || rowObj['nome'] || '',
            slug_scaglioni: rowObj['slug_scaglioni'] || rowObj['slug'] || '',
            descricao: rowObj['descricao'] || '',
            sku_scaglioni: rowObj['sku_scaglioni'] || rowObj['sku'] || '',
            marca: rowObj['marca'] || '',
            categorias: cats,
            categoria_principal: rowObj['categoria_principal'] || cats[0] || '',
            preco_venda: precoVenda,
            preco_promocional: precoPromo,
            estoque: parseInt(rowObj['saldo_inicial_scaglioni'] || rowObj['estoque'], 10) || 0,
            imagem_url: rowObj['imagem_url'] || '',
            urls_imagens: galleryUrls,
            altura_cm: parseFloat(rowObj['altura_cm']) || null,
            largura_cm: parseFloat(rowObj['largura_cm']) || null,
            comprimento_cm: parseFloat(rowObj['comprimento_cm']) || null,
            peso_g: parseFloat(rowObj['peso_g']) || null,
            ativo: rowObj['estado_ativo_ecommerce'] !== 'false',
            destaque: rowObj['destaque_ecommerce'] === 'true',
            created_at: rowObj['created_at_scaglioni'] || '',
            updated_at: rowObj['updated_at_scaglioni'] || '',
          })
        }
        setParsedRows(rows)
      }

      toast({
        title: 'Arquivo Scaglioni processado',
        description: `${parsedRows.length || 'Dados'} produtos lidos na estrutura.`,
      })
    } catch (err: any) {
      toast({
        title: 'Erro ao interpretar arquivo',
        description: err.message || 'Falha ao processar arquivo Scaglioni.',
        variant: 'destructive',
      })
    } finally {
      setIsParsing(false)
    }
  }

  const handleExecuteImport = async (dryRun: boolean) => {
    if (parsedRows.length === 0) return

    setIsProcessing(true)
    setProgress(15)

    try {
      const res = await productService.importScaglioniBatch(parsedRows, dryRun)
      setProgress(100)
      setRunResult(res)
      setActiveTab('report')

      toast({
        title: dryRun ? 'Teste executado (dry-run)' : 'Importação Scaglioni concluída',
        description: `${res.created} criados, ${res.updated} atualizados, ${res.ignored} ignorados.${
          res.conflicts?.length ? ` (${res.conflicts.length} conflitos/avisos)` : ''
        }`,
      })
      loadExistingProducts()
    } catch (err: any) {
      toast({
        title: 'Falha na importação',
        description: err.message || 'Erro ao enviar lote Scaglioni.',
        variant: 'destructive',
      })
    } finally {
      setIsProcessing(false)
    }
  }

  const handleConfirmAssociation = async () => {
    if (!selectedTecsonProduct || !selectedScaglioniProduct) return
    setIsAssociating(true)

    try {
      await productService.associateManual(
        selectedTecsonProduct.id,
        selectedScaglioniProduct.id,
        chosenStockOrigin,
      )

      toast({
        title: 'Produtos Associados com Sucesso!',
        description: `Os registros foram unificados. O saldo inicial ativo foi definido conforme sua escolha: ${chosenStockOrigin}.`,
      })
      setAssociationModalOpen(false)
      setSelectedTecsonProduct(null)
      setSelectedScaglioniProduct(null)
      loadExistingProducts()
    } catch (err: any) {
      toast({
        title: 'Erro na associação',
        description: err.message || 'Falha ao conciliar registros.',
        variant: 'destructive',
      })
    } finally {
      setIsAssociating(false)
    }
  }

  // Candidatos para conciliação manual
  const tecsonCandidates = allProducts.filter((p) => p.id_tecson && !p.id_scaglioni)
  const scaglioniCandidates = allProducts.filter((p) => p.id_scaglioni && !p.id_tecson)

  return (
    <div className="container mx-auto px-4 py-6 max-w-7xl space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="bg-sky-50 text-sky-800 border-sky-300">
              Origem Scaglioni E-commerce
            </Badge>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Importar Scaglioni</h1>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Importação independente para produtos do e-commerce (CSV ; e JSON), categorias, galeria
            e conciliação
          </p>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".csv,.json,text/csv,application/json"
            className="hidden"
          />
          <Button
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={isParsing || isProcessing}
          >
            <FileCode className="w-4 h-4 mr-2 text-sky-600" />
            {selectedFile ? 'Trocar Arquivo' : 'Selecionar CSV (;) ou JSON'}
          </Button>

          {parsedRows.length > 0 && (
            <>
              <Button
                variant="outline"
                onClick={() => handleExecuteImport(true)}
                disabled={isProcessing}
                className="border-sky-400 text-sky-900 hover:bg-sky-50"
              >
                <Eye className="w-4 h-4 mr-2" />
                Testar sem Gravar
              </Button>
              <Button
                onClick={() => handleExecuteImport(false)}
                disabled={isProcessing}
                className="bg-sky-700 hover:bg-sky-800 text-white"
              >
                <Play className="w-4 h-4 mr-2" />
                Importar em Lote
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Regras e aviso de arquivo real pendente */}
      <Alert className="bg-sky-50/60 border-sky-200">
        <Info className="h-4 w-4 text-sky-700" />
        <AlertTitle className="text-sky-900 font-semibold text-sm">
          Regras de Negócio — Origem Scaglioni
        </AlertTitle>
        <AlertDescription className="text-xs text-sky-800/90 mt-1 space-y-1">
          <p>
            • <strong>Status da Verificação:</strong> O arquivo real Scaglioni ainda não foi
            fornecido pelo usuário (pendente de envio). O importador e a validação estão 100%
            implementados e prontos para receber CSV (;) ou JSON.
          </p>
          <p>
            • <strong>Preservação de Slugs e SKUs:</strong> Preserva o slug original do e-commerce e
            armazena em <code>sku_scaglioni</code>, sem substituir nem apagar códigos Tecson.
          </p>
          <p>
            • <strong>Conciliação Manual Obrigatória:</strong> Nunca une registros automaticamente.
            Permite aprovação manual e exige a escolha do saldo inicial antes de unificar.
          </p>
        </AlertDescription>
      </Alert>

      {/* Seção de Conciliação Manual entre Origens */}
      <Card className="border-indigo-100 bg-indigo-50/20">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <GitMerge className="w-5 h-5 text-indigo-600" />
              <CardTitle className="text-base text-indigo-950">
                Conciliação Manual (Tecson ↔ Scaglioni)
              </CardTitle>
            </div>
            <Badge variant="outline" className="bg-indigo-100 text-indigo-800 border-indigo-300">
              {tecsonCandidates.length} Tecson pendentes • {scaglioniCandidates.length} Scaglioni
              pendentes
            </Badge>
          </div>
          <CardDescription className="text-xs">
            Associe manualmente peças de ambos os sistemas mantendo um único cadastro unificado e
            decidindo o saldo inicial correto.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (tecsonCandidates.length > 0 && scaglioniCandidates.length > 0) {
                  setSelectedTecsonProduct(tecsonCandidates[0])
                  setSelectedScaglioniProduct(scaglioniCandidates[0])
                  setAssociationModalOpen(true)
                } else {
                  toast({
                    title: 'Nenhuma peça pendente para conciliação',
                    description:
                      'É necessário ter ao menos um produto exclusivo de cada origem cadastrado.',
                  })
                }
              }}
              className="bg-white border-indigo-200 text-indigo-900 hover:bg-indigo-50"
            >
              <GitMerge className="w-4 h-4 mr-2" />
              Iniciar Associação Manual de Peça
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Relatório de Execução quando houver */}
      {runResult && (
        <Card className="border-sky-200 bg-sky-50/20">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-sky-600" />
                <CardTitle className="text-lg">
                  {runResult.dry_run ? 'Resultado do Teste (Scaglioni)' : 'Resultado da Importação'}
                </CardTitle>
              </div>
              <Badge className={runResult.dry_run ? 'bg-amber-600' : 'bg-sky-600'}>
                {runResult.dry_run ? 'SIMULAÇÃO' : 'GRAVADO NO BANCO'}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              <div className="bg-white p-3 rounded-lg border">
                <span className="text-xs text-slate-500 uppercase font-semibold">Criados</span>
                <p className="text-2xl font-bold text-sky-600">{runResult.created}</p>
              </div>
              <div className="bg-white p-3 rounded-lg border">
                <span className="text-xs text-slate-500 uppercase font-semibold">Atualizados</span>
                <p className="text-2xl font-bold text-blue-600">{runResult.updated}</p>
              </div>
              <div className="bg-white p-3 rounded-lg border">
                <span className="text-xs text-slate-500 uppercase font-semibold">Ignorados</span>
                <p className="text-2xl font-bold text-slate-500">{runResult.ignored}</p>
              </div>
              <div className="bg-white p-3 rounded-lg border">
                <span className="text-xs text-slate-500 uppercase font-semibold">
                  Avisos / Promo
                </span>
                <p className="text-2xl font-bold text-amber-600">
                  {runResult.conflicts?.length || 0}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Prévia dos registros Scaglioni */}
      {parsedRows.length > 0 && (
        <Tabs value={activeTab} onValueChange={(v: any) => setActiveTab(v)} className="space-y-4">
          <TabsList>
            <TabsTrigger value="preview">Prévia Scaglioni ({parsedRows.length})</TabsTrigger>
            <TabsTrigger value="validation">Mapeamento e Regras</TabsTrigger>
            {runResult && <TabsTrigger value="report">Relatório por Linha</TabsTrigger>}
          </TabsList>

          <TabsContent value="preview" className="space-y-4">
            <div className="rounded-md border bg-white overflow-x-auto max-h-[500px]">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-700 sticky top-0 border-b">
                  <tr>
                    <th className="p-2.5">#</th>
                    <th className="p-2.5">ID Scaglioni</th>
                    <th className="p-2.5">SKU Origem</th>
                    <th className="p-2.5">Nome do Produto</th>
                    <th className="p-2.5">Marca / Categoria</th>
                    <th className="p-2.5 text-right">Preço Venda</th>
                    <th className="p-2.5 text-right">Preço Promo</th>
                    <th className="p-2.5 text-center">Saldo Inicial</th>
                    <th className="p-2.5 text-center">E-commerce</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {parsedRows.slice(0, 100).map((row) => (
                    <tr key={row.index} className="hover:bg-slate-50/70">
                      <td className="p-2.5 text-slate-400 font-mono">{row.index}</td>
                      <td className="p-2.5 font-mono text-slate-700">{row.id_scaglioni || '—'}</td>
                      <td className="p-2.5 font-mono font-semibold text-sky-800">
                        {row.sku_scaglioni || '—'}
                      </td>
                      <td className="p-2.5 max-w-xs truncate font-medium text-slate-900">
                        {row.nome_produto || '—'}
                      </td>
                      <td className="p-2.5 text-slate-600">
                        {row.marca || '—'}{' '}
                        {row.categoria_principal ? `(${row.categoria_principal})` : ''}
                      </td>
                      <td className="p-2.5 text-right font-semibold text-slate-800">
                        {formatCurrency(row.preco_venda)}
                      </td>
                      <td className="p-2.5 text-right text-amber-700 font-medium">
                        {row.preco_promocional ? formatCurrency(row.preco_promocional) : '—'}
                      </td>
                      <td className="p-2.5 text-center">
                        <Badge variant="outline" className="font-mono">
                          {row.estoque} un
                        </Badge>
                      </td>
                      <td className="p-2.5 text-center">
                        <Badge
                          variant={row.ativo ? 'default' : 'secondary'}
                          className={row.ativo ? 'bg-emerald-600' : ''}
                        >
                          {row.ativo ? 'Ativo' : 'Inativo'}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </TabsContent>

          <TabsContent value="validation" className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Mapeamento Scaglioni Obrigatório</CardTitle>
                <CardDescription>
                  Regras de validação antes de qualquer inserção definitiva
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-xs">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="p-3 bg-slate-50 rounded border">
                    <p className="font-semibold text-slate-800">id → id_scaglioni</p>
                    <p className="text-slate-600 mt-0.5">
                      Identificador de origem e chave de reimportação.
                    </p>
                  </div>
                  <div className="p-3 bg-slate-50 rounded border">
                    <p className="font-semibold text-slate-800">slug → slug e slug_scaglioni</p>
                    <p className="text-slate-600 mt-0.5">
                      Preserva rigorosamente URLs amigáveis já indexadas.
                    </p>
                  </div>
                  <div className="p-3 bg-slate-50 rounded border">
                    <p className="font-semibold text-slate-800">
                      preco_promocional &lt; preco_venda
                    </p>
                    <p className="text-slate-600 mt-0.5">
                      Validação obrigatória com alerta caso inválido.
                    </p>
                  </div>
                  <div className="p-3 bg-slate-50 rounded border">
                    <p className="font-semibold text-slate-800">
                      Vínculos Próprios (Categorias/Marcas)
                    </p>
                    <p className="text-slate-600 mt-0.5">
                      Armazenados em coleções relacionais, nunca em strings separadas por |.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {runResult && (
            <TabsContent value="report" className="space-y-4">
              <div className="rounded-md border bg-white overflow-x-auto max-h-[500px]">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 text-slate-700 sticky top-0 border-b">
                    <tr>
                      <th className="p-2.5">Linha</th>
                      <th className="p-2.5">Status</th>
                      <th className="p-2.5">SKU / ID</th>
                      <th className="p-2.5">Nome</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {runResult.sample_reports?.map((rep: any, idx: number) => (
                      <tr key={idx} className="hover:bg-slate-50/70">
                        <td className="p-2.5 font-mono text-slate-400">{rep.index}</td>
                        <td className="p-2.5">
                          <Badge
                            variant={
                              rep.status === 'created'
                                ? 'default'
                                : rep.status === 'updated'
                                  ? 'secondary'
                                  : 'destructive'
                            }
                            className={
                              rep.status === 'created'
                                ? 'bg-sky-600'
                                : rep.status === 'updated'
                                  ? 'bg-blue-600'
                                  : ''
                            }
                          >
                            {rep.status}
                          </Badge>
                        </td>
                        <td className="p-2.5 font-mono">{rep.code || '—'}</td>
                        <td className="p-2.5 font-medium">{rep.name || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </TabsContent>
          )}
        </Tabs>
      )}

      {/* Estado vazio */}
      {parsedRows.length === 0 && !isParsing && (
        <Card className="border-dashed py-12 text-center">
          <CardContent className="space-y-4">
            <div className="mx-auto w-12 h-12 rounded-full bg-sky-50 flex items-center justify-center text-sky-700">
              <Upload className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                Selecione o arquivo CSV (;) ou JSON do Scaglioni
              </h3>
              <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                Suporta produtos com marcas, categorias múltiplas, preços promocionais e galeria de
                imagens.
              </p>
            </div>
            <Button
              onClick={() => fileInputRef.current?.click()}
              className="bg-sky-700 hover:bg-sky-800 text-white"
            >
              <FileCode className="w-4 h-4 mr-2" />
              Procurar Arquivo Scaglioni
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Modal de Conciliação Manual com Regra do Item 2 e 5 */}
      <Dialog open={associationModalOpen} onOpenChange={setAssociationModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GitMerge className="w-5 h-5 text-indigo-600" />
              Conciliação Manual: Tecson ↔ Scaglioni
            </DialogTitle>
            <DialogDescription className="text-xs">
              Conforme regra vinculativa: Os saldos iniciais NÃO são somados automaticamente (podem
              ser as mesmas peças). Examine ambos os saldos e escolha qual prevalecerá como o saldo
              inicial correto.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-3">
            {/* Seletor de Peça Tecson */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">Produto Origem Tecson</Label>
              <select
                className="w-full text-xs p-2 border rounded-md"
                value={selectedTecsonProduct?.id || ''}
                onChange={(e) => {
                  const p = allProducts.find((x) => x.id === e.target.value) || null
                  setSelectedTecsonProduct(p)
                }}
              >
                {tecsonCandidates.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.codigo_barras || p.code} — {p.nome_produto || p.description} (Saldo:{' '}
                    {p.quantity} un)
                  </option>
                ))}
              </select>
            </div>

            {/* Seletor de Peça Scaglioni */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">
                Produto Origem Scaglioni E-commerce
              </Label>
              <select
                className="w-full text-xs p-2 border rounded-md"
                value={selectedScaglioniProduct?.id || ''}
                onChange={(e) => {
                  const p = allProducts.find((x) => x.id === e.target.value) || null
                  setSelectedScaglioniProduct(p)
                }}
              >
                {scaglioniCandidates.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.sku_scaglioni || p.code} — {p.nome_produto || p.description} (Saldo:{' '}
                    {p.quantity} un)
                  </option>
                ))}
              </select>
            </div>

            {/* Exibição e Escolha Obrigatória do Saldo Inicial */}
            {selectedTecsonProduct && selectedScaglioniProduct && (
              <div className="p-4 bg-amber-50/70 border border-amber-200 rounded-lg space-y-3">
                <p className="text-xs font-semibold text-amber-900">
                  Resolução Obrigatória de Saldo Inicial:
                </p>
                <RadioGroup
                  value={chosenStockOrigin}
                  onValueChange={(v: any) => setChosenStockOrigin(v)}
                  className="space-y-2 text-xs"
                >
                  <div className="flex items-center space-x-2 bg-white p-2.5 rounded border border-amber-200">
                    <RadioGroupItem value="Tecson" id="r-tecson" />
                    <Label htmlFor="r-tecson" className="cursor-pointer flex-1">
                      <span className="font-semibold text-slate-800">Manter Saldo Tecson: </span>
                      <strong className="text-emerald-700">
                        {selectedTecsonProduct.quantity} un
                      </strong>
                      <span className="text-slate-500 block text-[11px]">
                        Origem: Tecson (Código:{' '}
                        {selectedTecsonProduct.codigo_barras || selectedTecsonProduct.code})
                      </span>
                    </Label>
                  </div>

                  <div className="flex items-center space-x-2 bg-white p-2.5 rounded border border-amber-200">
                    <RadioGroupItem value="Scaglioni" id="r-scaglioni" />
                    <Label htmlFor="r-scaglioni" className="cursor-pointer flex-1">
                      <span className="font-semibold text-slate-800">Manter Saldo Scaglioni: </span>
                      <strong className="text-sky-700">
                        {selectedScaglioniProduct.quantity} un
                      </strong>
                      <span className="text-slate-500 block text-[11px]">
                        Origem: E-commerce Scaglioni (SKU:{' '}
                        {selectedScaglioniProduct.sku_scaglioni || selectedScaglioniProduct.code})
                      </span>
                    </Label>
                  </div>
                </RadioGroup>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAssociationModalOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleConfirmAssociation}
              disabled={isAssociating || !selectedTecsonProduct || !selectedScaglioniProduct}
              className="bg-indigo-700 hover:bg-indigo-800 text-white"
            >
              {isAssociating ? 'Unificando...' : 'Confirmar Associação e Saldo'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
