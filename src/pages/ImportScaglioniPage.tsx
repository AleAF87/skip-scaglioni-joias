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
  Loader2,
  HelpCircle,
  ExternalLink,
  ChevronRight,
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

// Mapeamento canônico Scaglioni
const SCAGLIONI_COLUMN_MAP: Record<string, string> = {
  id: 'id_scaglioni',
  nome: 'nome_produto',
  slug: 'slug_scaglioni',
  descricao: 'descricao',
  description: 'descricao',
  sku: 'sku_scaglioni',
  marca_id: 'marca_id_scaglioni',
  marca: 'marca',
  categoria_id: 'categoria_id_scaglioni',
  categoria: 'categoria',
  categorias: 'categorias',
  'categoria(s)': 'categorias',
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

// Descrição amigável de destino
const DESTINATION_FIELD_LABELS: Record<string, string> = {
  id_scaglioni: 'ID Scaglioni (id_scaglioni)',
  nome_produto: 'Nome Produto (nome_produto / nome_original_scaglioni)',
  slug_scaglioni: 'Slug E-commerce (slug e slug_scaglioni)',
  descricao: 'Descrição Preservando Parágrafos (description)',
  sku_scaglioni: 'SKU Scaglioni (sku_scaglioni)',
  marca_id_scaglioni: 'Vínculo UUID Marca (marca_id)',
  marca: 'Marca E-commerce (brands.name)',
  categoria_id_scaglioni: 'Vínculo UUID Categoria Principal',
  categoria: 'Categoria (product_categories)',
  categorias: 'Categorias Múltiplas (product_category_links)',
  categoria_principal: 'Categoria Principal (is_principal)',
  preco_venda: 'Preço Venda (selling_price)',
  preco_promocional: 'Preço Promocional (preco_promocional)',
  saldo_inicial_scaglioni: 'Saldo Inicial Scaglioni (initial_stocks: "A definir")',
  imagem_url: 'Foto Principal (product_images / image_url)',
  urls_imagens: 'Galeria Ordenada Sem Duplicatas (product_images)',
  arquivos_imagens: 'Caminho Arquivos Imagens (import_image_path)',
  altura_cm: 'Altura cm (altura_cm)',
  largura_cm: 'Largura cm (largura_cm)',
  comprimento_cm: 'Comprimento cm (comprimento_cm)',
  peso_g: 'Peso g (peso_g)',
  estado_ativo_ecommerce: 'Estado Ativo E-commerce (estado_ativo_ecommerce)',
  destaque_ecommerce: 'Destaque E-commerce (destaque_ecommerce)',
  created_at_scaglioni: 'Data Criação Scaglioni (created_at_scaglioni)',
  updated_at_scaglioni: 'Data Atualização Scaglioni (updated_at_scaglioni)',
}

export interface ParsedScaglioniItem {
  index: number
  id_scaglioni: string
  nome_produto: string
  nome_original_scaglioni: string
  slug_scaglioni: string
  descricao: string
  sku_scaglioni: string
  marca_id: string
  marca: string
  categoria_id: string
  categorias: string[]
  categoria_principal: string
  preco_venda: number
  preco_promocional: number | null
  estoque: number
  imagem_url: string
  urls_imagens: string[]
  arquivos_imagens: string
  altura_cm: number | null
  largura_cm: number | null
  comprimento_cm: number | null
  peso_g: number | null
  ativo: boolean
  destaque: boolean
  created_at: string
  updated_at: string
  unrecognized_columns: string[]
  validation_errors: string[]
}

export function ImportScaglioniPage() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [parsedRows, setParsedRows] = useState<ParsedScaglioniItem[]>([])
  const [unrecognizedColumns, setUnrecognizedColumns] = useState<string[]>([])
  const [isParsing, setIsParsing] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [processingStatus, setProcessingStatus] = useState<string>('')
  const [progress, setProgress] = useState(0)
  const [runResult, setRunResult] = useState<any | null>(null)
  const [activeTab, setActiveTab] = useState<
    'preview' | 'mapping' | 'images' | 'association' | 'report'
  >('preview')
  const [searchTerm, setSearchTerm] = useState('')

  // Conciliação manual / Associação Tecson <-> Scaglioni
  const [allProducts, setAllProducts] = useState<Product[]>([])
  const [associationModalOpen, setAssociationModalOpen] = useState(false)
  const [selectedTecsonProduct, setSelectedTecsonProduct] = useState<Product | null>(null)
  const [selectedScaglioniProduct, setSelectedScaglioniProduct] = useState<Product | null>(null)
  const [chosenStockOrigin, setChosenStockOrigin] = useState<'Tecson' | 'Scaglioni'>('Tecson')
  const [isAssociating, setIsAssociating] = useState(false)

  // Resumo de correspondências possíveis não automáticas
  const [possibleMatches, setPossibleMatches] = useState<
    Array<{ tecson: Product; scaglioniItem: ParsedScaglioniItem; matchReason: string }>
  >([])

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

  // Parsear número monetário tolerante
  const parseNumberValue = (val: any): number => {
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

  const parseBooleanValue = (val: any, defaultVal = true): boolean => {
    if (val === undefined || val === null || val === '') return defaultVal
    if (typeof val === 'boolean') return val
    const s = String(val).trim().toLowerCase()
    return s === 'true' || s === '1' || s === 'sim' || s === 'yes' || s === 't'
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setSelectedFile(file)
    setIsParsing(true)
    setRunResult(null)
    setParsedRows([])
    setUnrecognizedColumns([])
    setPossibleMatches([])

    try {
      const isJson = file.name.endsWith('.json')
      const decoded = await decodeFileTolerant(file)
      let text = typeof decoded === 'string' ? decoded : decoded.text

      // Se houver BOM UTF-8 no início, removemos de forma transparente
      if (text.charCodeAt(0) === 0xfeff) {
        text = text.substring(1)
      }

      if (isJson) {
        const jsonData = JSON.parse(text)
        const arrayData = Array.isArray(jsonData) ? jsonData : jsonData.products || [jsonData]
        const mapped: ParsedScaglioniItem[] = arrayData.map((item: any, idx: number) => {
          const precoVenda = parseNumberValue(item.preco || item.preco_venda)
          const precoPromo =
            item.preco_promocional !== undefined &&
            item.preco_promocional !== null &&
            String(item.preco_promocional).trim() !== ''
              ? parseNumberValue(item.preco_promocional)
              : null

          const cats = Array.isArray(item.categorias)
            ? item.categorias
            : item.categoria
              ? [item.categoria]
              : []

          let galleryUrls: string[] = []
          if (Array.isArray(item.urls_imagens)) {
            galleryUrls = item.urls_imagens
          } else if (typeof item.urls_imagens === 'string' && item.urls_imagens.trim()) {
            galleryUrls = item.urls_imagens.split('|').map((u: string) => u.trim())
          }

          const imagemPrincipal = (item.imagem_url || item.image_url || '').trim()
          // Garantir galeria em ordem sem duplicar imagem principal
          const uniqueGallery = galleryUrls.filter((u) => u && u !== imagemPrincipal)

          return {
            index: idx + 1,
            id_scaglioni: item.id ? String(item.id).trim() : '',
            nome_produto: (item.nome || item.nome_produto || '').trim(),
            nome_original_scaglioni: String(item.nome || item.nome_produto || ''),
            slug_scaglioni: (item.slug || item.slug_scaglioni || '').trim(),
            descricao: item.descricao || item.description || '',
            sku_scaglioni: (item.sku || item.sku_scaglioni || '').trim(),
            marca_id: item.marca_id ? String(item.marca_id).trim() : '',
            marca: item.marca || (item.marca_id?.name ? item.marca_id.name : ''),
            categoria_id: item.categoria_id ? String(item.categoria_id).trim() : '',
            categorias: cats,
            categoria_principal:
              item.categoria_principal || item.categoria_id || cats[0] || item.categoria || '',
            preco_venda: precoVenda,
            preco_promocional: precoPromo,
            estoque: parseInt(item.estoque || item.quantidade, 10) || 0,
            imagem_url: imagemPrincipal,
            urls_imagens: uniqueGallery,
            arquivos_imagens: item.arquivos_imagens || '',
            altura_cm: parseFloat(item.altura_cm) || null,
            largura_cm: parseFloat(item.largura_cm) || null,
            comprimento_cm: parseFloat(item.comprimento_cm) || null,
            peso_g: parseFloat(item.peso_g) || null,
            ativo: parseBooleanValue(item.ativo, true),
            destaque: parseBooleanValue(item.destaque, false),
            created_at: item.created_at || '',
            updated_at: item.updated_at || '',
            unrecognized_columns: [],
            validation_errors: [],
          }
        })
        setParsedRows(mapped)
      } else {
        // Arquivo CSV Real: delimitado por ; ou , tolerante a BOM UTF-8 e quebras em aspas
        const rawMatrix = parseCsvRows(text)
        if (rawMatrix.length < 2) {
          toast({
            title: 'Arquivo vazio ou sem cabeçalho',
            description: 'O CSV Scaglioni não possui registros de dados.',
            variant: 'destructive',
          })
          setIsParsing(false)
          return
        }

        const rawHeaders = rawMatrix[0]
        const unrecCols: string[] = []
        const headerIndexMap: Record<number, { targetField: string; originalHeader: string }> = {}

        rawHeaders.forEach((h, i) => {
          const cleanH = h
            .trim()
            .toLowerCase()
            .replace(/[\s\-_]+/g, '_')
          const mappedKey = SCAGLIONI_COLUMN_MAP[cleanH]
          if (mappedKey) {
            headerIndexMap[i] = { targetField: mappedKey, originalHeader: h }
          } else {
            unrecCols.push(h)
          }
        })

        setUnrecognizedColumns(Array.from(new Set(unrecCols)))

        const rows: ParsedScaglioniItem[] = []
        for (let r = 1; r < rawMatrix.length; r++) {
          const row = rawMatrix[r]
          if (row.length === 0 || (row.length === 1 && !row[0].trim())) continue

          const rowObj: Record<string, string> = {}
          row.forEach((val, idx) => {
            const mapInfo = headerIndexMap[idx]
            if (mapInfo) {
              rowObj[mapInfo.targetField] = val.trim()
            }
          })

          const nomeOriginal = rowObj['nome_produto'] || ''
          const nomeTrim = nomeOriginal.trim()

          const precoVenda = parseNumberValue(rowObj['preco_venda'])
          // preco_promocional frequentemente vazio: vazio permanece vazio (null), nunca zero
          const rawPromo = rowObj['preco_promocional']
          const precoPromo =
            rawPromo !== undefined && rawPromo !== null && rawPromo.trim() !== ''
              ? parseNumberValue(rawPromo)
              : null

          // Categorias: suporta lista separada por pipe (|) ou única
          let cats: string[] = []
          if (rowObj['categorias']) {
            cats = rowObj['categorias']
              .split('|')
              .map((c: string) => c.trim())
              .filter(Boolean)
          } else if (rowObj['categoria']) {
            cats = [rowObj['categoria'].trim()].filter(Boolean)
          }

          const catId = rowObj['categoria_id_scaglioni'] || ''
          // Definir categoria_principal conforme categoria_id ou primeira da lista
          let catPrincipal = rowObj['categoria_principal'] || cats[0] || catId || ''

          // Galeria de imagens: urls_imagens separadas por pipe (|)
          let galleryUrls: string[] = []
          if (rowObj['urls_imagens']) {
            galleryUrls = rowObj['urls_imagens']
              .split('|')
              .map((u: string) => u.trim())
              .filter(Boolean)
          }

          const imagemPrincipal = rowObj['imagem_url'] || ''
          // Regra obrigatória: galeria em ordem sem duplicar a imagem principal
          const uniqueGallery = galleryUrls.filter((u) => u && u !== imagemPrincipal)

          const validationErrors: string[] = []
          if (!rowObj['id_scaglioni'] && !rowObj['sku_scaglioni'] && !nomeTrim) {
            validationErrors.push('Linha sem ID Scaglioni, SKU nem Nome')
          }
          if (precoPromo !== null && precoPromo >= precoVenda && precoVenda > 0) {
            validationErrors.push('Preço promocional deve ser menor que o preço de venda')
          }

          rows.push({
            index: r,
            id_scaglioni: rowObj['id_scaglioni'] || '',
            nome_produto: nomeTrim,
            nome_original_scaglioni: nomeOriginal,
            slug_scaglioni: rowObj['slug_scaglioni'] || '',
            // Descrição preservando parágrafos originais
            descricao: rowObj['descricao'] || '',
            sku_scaglioni: rowObj['sku_scaglioni'] || '',
            marca_id: rowObj['marca_id_scaglioni'] || '',
            marca: rowObj['marca'] || '',
            categoria_id: catId,
            categorias: cats,
            categoria_principal: catPrincipal,
            preco_venda: precoVenda,
            preco_promocional: precoPromo,
            estoque: parseInt(rowObj['saldo_inicial_scaglioni'], 10) || 0,
            imagem_url: imagemPrincipal,
            urls_imagens: uniqueGallery,
            arquivos_imagens: rowObj['arquivos_imagens'] || '',
            altura_cm: parseFloat(rowObj['altura_cm']) || null,
            largura_cm: parseFloat(rowObj['largura_cm']) || null,
            comprimento_cm: parseFloat(rowObj['comprimento_cm']) || null,
            peso_g: parseFloat(rowObj['peso_g']) || null,
            ativo: parseBooleanValue(rowObj['estado_ativo_ecommerce'], true),
            destaque: parseBooleanValue(rowObj['destaque_ecommerce'], false),
            created_at: rowObj['created_at_scaglioni'] || '',
            updated_at: rowObj['updated_at_scaglioni'] || '',
            unrecognized_columns: unrecCols,
            validation_errors: validationErrors,
          })
        }
        setParsedRows(rows)

        // Identificar possíveis correspondências com produtos Tecson existentes (sem unir automaticamente)
        const matches: Array<{
          tecson: Product
          scaglioniItem: ParsedScaglioniItem
          matchReason: string
        }> = []
        rows.forEach((item) => {
          const matchBySku = allProducts.find(
            (p) =>
              p.id_tecson &&
              ((p.code && item.sku_scaglioni && p.code === item.sku_scaglioni) ||
                (p.codigo_barras && item.sku_scaglioni && p.codigo_barras === item.sku_scaglioni) ||
                (p.nome_produto &&
                  item.nome_produto &&
                  p.nome_produto.toLowerCase() === item.nome_produto.toLowerCase())),
          )
          if (matchBySku) {
            matches.push({
              tecson: matchBySku,
              scaglioniItem: item,
              matchReason:
                matchBySku.code === item.sku_scaglioni
                  ? 'Mesmo Código/SKU'
                  : 'Mesmo Nome Exato de Produto',
            })
          }
        })
        setPossibleMatches(matches)
      }

      toast({
        title: 'Arquivo Scaglioni processado',
        description: `${parsedRows.length || 'Dados'} produtos lidos e interpretados com sucesso.`,
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

  // Importação em lotes de 50 itens com barra de progresso progressiva (idêntico ao padrão Tecson)
  const handleExecuteImport = async (dryRun: boolean) => {
    if (parsedRows.length === 0) return

    setIsProcessing(true)
    setProgress(5)

    try {
      const CHUNK_SIZE = 50
      const totalItems = parsedRows.length
      let accumulatedResult = {
        success: true,
        dry_run: dryRun,
        total_received: totalItems,
        created: 0,
        updated: 0,
        ignored: 0,
        conflicts: [] as any[],
        image_failures: [] as any[],
        sample_reports: [] as any[],
      }

      for (let offset = 0; offset < totalItems; offset += CHUNK_SIZE) {
        const chunk = parsedRows.slice(offset, offset + CHUNK_SIZE)
        const chunkEnd = Math.min(offset + chunk.length, totalItems)
        setProcessingStatus(`Processando itens ${offset + 1} a ${chunkEnd} de ${totalItems}...`)

        const chunkRes = await productService.importScaglioniBatch(chunk, dryRun)

        accumulatedResult.created += chunkRes.created || 0
        accumulatedResult.updated += chunkRes.updated || 0
        accumulatedResult.ignored += chunkRes.ignored || 0

        if (chunkRes.conflicts && chunkRes.conflicts.length > 0) {
          accumulatedResult.conflicts.push(...chunkRes.conflicts)
        }
        if (chunkRes.image_failures && chunkRes.image_failures.length > 0) {
          accumulatedResult.image_failures.push(...chunkRes.image_failures)
        }
        if (chunkRes.sample_reports && chunkRes.sample_reports.length > 0) {
          const adjustedReports = chunkRes.sample_reports.map((sr: any) => ({
            ...sr,
            index: typeof sr.index === 'number' ? sr.index + offset : sr.index,
          }))
          accumulatedResult.sample_reports.push(...adjustedReports)
        }

        const currentPct = Math.min(95, Math.round(((offset + chunk.length) / totalItems) * 100))
        setProgress(currentPct)
      }

      setProgress(100)
      setProcessingStatus('Concluído!')
      setRunResult(accumulatedResult)
      setActiveTab('report')

      toast({
        title: dryRun ? 'Teste executado (dry-run)' : 'Importação Scaglioni concluída',
        description: `${accumulatedResult.created} criados, ${accumulatedResult.updated} atualizados, ${accumulatedResult.ignored} ignorados.${
          accumulatedResult.conflicts?.length
            ? ` (${accumulatedResult.conflicts.length} conflitos identificados)`
            : ''
        }`,
      })
      loadExistingProducts()
    } catch (err: any) {
      console.error('Erro na importação Scaglioni:', err)
      const errorMsg =
        err?.data?.error ||
        err?.message ||
        'Ocorreu um erro ao enviar o lote Scaglioni para o backend.'
      toast({
        title: 'Falha na importação Scaglioni',
        description: errorMsg,
        variant: 'destructive',
      })
    } finally {
      setIsProcessing(false)
      setProcessingStatus('')
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

  const tecsonCandidates = allProducts.filter((p) => p.id_tecson && !p.id_scaglioni)
  const scaglioniCandidates = allProducts.filter((p) => p.id_scaglioni && !p.id_tecson)

  const filteredPreview = parsedRows.filter((r) => {
    if (!searchTerm) return true
    const s = searchTerm.toLowerCase()
    return (
      r.nome_produto.toLowerCase().includes(s) ||
      r.sku_scaglioni.toLowerCase().includes(s) ||
      r.id_scaglioni.toLowerCase().includes(s) ||
      r.marca.toLowerCase().includes(s) ||
      r.categoria_principal.toLowerCase().includes(s)
    )
  })

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
            Importação em lote com prévia de destino, teste sem gravação, galeria, saldo inicial e
            reimportação idempotente por (origem=Scaglioni, id_scaglioni)
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
            {selectedFile ? 'Trocar Arquivo Scaglioni' : 'Selecionar CSV (;) Scaglioni'}
          </Button>

          {parsedRows.length > 0 && (
            <>
              <Button
                variant="outline"
                onClick={() => handleExecuteImport(true)}
                disabled={isProcessing}
                className="border-sky-400 text-sky-900 hover:bg-sky-50"
              >
                {isProcessing ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Eye className="w-4 h-4 mr-2" />
                )}
                Testar sem Gravar (Dry-Run)
              </Button>
              <Button
                onClick={() => handleExecuteImport(false)}
                disabled={isProcessing}
                className="bg-sky-700 hover:bg-sky-800 text-white font-semibold"
              >
                {isProcessing ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Play className="w-4 h-4 mr-2" />
                )}
                {isProcessing ? 'Importando...' : 'Importar em Lote'}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Regras e avisos vinculativos */}
      <Alert className="bg-sky-50/60 border-sky-200">
        <Info className="h-4 w-4 text-sky-700" />
        <AlertTitle className="text-sky-900 font-semibold text-sm">
          Regras de Negócio — Origem Scaglioni
        </AlertTitle>
        <AlertDescription className="text-xs text-sky-800/90 mt-1 space-y-1">
          <p>
            • <strong>Idempotência:</strong> A chave primária de reimportação é (origem=Scaglioni,{' '}
            <code>id_scaglioni</code>). Subir o mesmo arquivo não duplica produtos, imagens nem
            saldos iniciais.
          </p>
          <p>
            • <strong>Preservação de Slugs e Preço Promocional:</strong> Slugs existentes são
            preservados e <code>preco_promocional</code> vazio permanece vazio (nunca zero).
          </p>
          <p>
            • <strong>Galeria e Fotos:</strong> Imagens do link aparecem no Estoque Loja; a galeria
            preserva a ordem e não duplica a imagem principal.
          </p>
          <p>
            • <strong>Não Unificação Automática:</strong> Registros Tecson e Scaglioni jamais são
            unidos automaticamente por nome, SKU ou preço. Possíveis correspondências são exibidas
            para aprovação manual.
          </p>
        </AlertDescription>
      </Alert>

      {/* Alerta de colunas não reconhecidas listadas para conferência sem bloqueio */}
      {unrecognizedColumns.length > 0 && (
        <Alert className="bg-amber-50 border-amber-300 text-amber-950">
          <AlertTriangle className="h-4 w-4 text-amber-700" />
          <AlertTitle className="text-sm font-semibold flex items-center justify-between">
            <span>Colunas Não Reconhecidas no Arquivo ({unrecognizedColumns.length})</span>
            <Badge
              variant="outline"
              className="bg-white text-amber-800 border-amber-300 text-[10px]"
            >
              Listadas para conferência • Sem bloqueio
            </Badge>
          </AlertTitle>
          <AlertDescription className="text-xs mt-1 space-y-1">
            <p className="text-amber-900 font-medium">
              As seguintes colunas do arquivo não possuem mapeamento direto para o catálogo. Elas
              foram listadas para sua conferência e não impedem a importação dos demais campos:
            </p>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {unrecognizedColumns.map((col, idx) => (
                <span
                  key={idx}
                  className="font-mono text-[11px] bg-white text-amber-900 px-2 py-0.5 rounded border border-amber-200"
                >
                  {col}
                </span>
              ))}
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Sugestões de Correspondência Manual Não Automática */}
      {possibleMatches.length > 0 && (
        <Card className="border-indigo-200 bg-indigo-50/30">
          <CardHeader className="pb-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <GitMerge className="w-5 h-5 text-indigo-700" />
                <CardTitle className="text-sm font-bold text-indigo-950">
                  Correspondências Possíveis Identificadas ({possibleMatches.length})
                </CardTitle>
              </div>
              <Badge className="bg-indigo-600 text-[10px]">Aprovação Manual Necessária</Badge>
            </div>
            <CardDescription className="text-xs text-indigo-900">
              Conforme regra do sistema, produtos Tecson e Scaglioni não foram unidos
              automaticamente. Você pode revisá-los e realizar a conciliação manual com escolha do
              saldo inicial.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="divide-y divide-indigo-100 max-h-40 overflow-y-auto">
              {possibleMatches.slice(0, 5).map((m, idx) => (
                <div key={idx} className="py-2 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-semibold text-slate-800">
                      Scaglioni: {m.scaglioniItem.nome_produto} (SKU:{' '}
                      {m.scaglioniItem.sku_scaglioni || '—'})
                    </span>
                    <span className="text-slate-500 block text-[11px]">
                      ↔ Tecson: {m.tecson.nome_produto || m.tecson.description} (Cód:{' '}
                      {m.tecson.code || m.tecson.codigo_barras}) — Motivo: {m.matchReason}
                    </span>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs bg-white text-indigo-700 border-indigo-200 hover:bg-indigo-50"
                    onClick={() => {
                      setSelectedTecsonProduct(m.tecson)
                      const existingScag = allProducts.find(
                        (p) => p.id_scaglioni === m.scaglioniItem.id_scaglioni,
                      )
                      if (existingScag) {
                        setSelectedScaglioniProduct(existingScag)
                        setAssociationModalOpen(true)
                      } else {
                        toast({
                          title: 'Importe o arquivo primeiro',
                          description:
                            'Importe o lote Scaglioni para cadastrar a peça e então realizar a unificação manual.',
                        })
                      }
                    }}
                  >
                    Conciliar Peça
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Barra de Progresso em Lote */}
      {isProcessing && (
        <Card className="border-sky-300 bg-sky-50/40">
          <CardContent className="pt-6">
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-sky-700" />
                  <span className="font-medium text-sky-950">
                    {processingStatus || 'Processando produtos Scaglioni em lotes de 50...'}
                  </span>
                </div>
                <span className="font-mono font-bold text-sky-800">{progress}%</span>
              </div>
              <Progress value={progress} className="h-2.5" />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Relatório de Execução quando disponível */}
      {runResult && (
        <Card className="border-sky-200 bg-sky-50/20">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-sky-600" />
                <CardTitle className="text-lg">
                  {runResult.dry_run
                    ? 'Resultado do Teste (Sem Gravação)'
                    : 'Resultado da Importação Scaglioni'}
                </CardTitle>
              </div>
              <Badge className={runResult.dry_run ? 'bg-amber-600' : 'bg-sky-600'}>
                {runResult.dry_run ? 'SIMULAÇÃO' : 'GRAVADO NO BANCO'}
              </Badge>
            </div>
            <CardDescription>
              Total analisado: {runResult.total_received} itens recebidos
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              <div className="bg-white p-3 rounded-lg border">
                <span className="text-xs text-slate-500 uppercase font-semibold">
                  Criados Novos
                </span>
                <p className="text-2xl font-bold text-sky-600">{runResult.created}</p>
              </div>
              <div className="bg-white p-3 rounded-lg border">
                <span className="text-xs text-slate-500 uppercase font-semibold">
                  Atualizados (Idempotente)
                </span>
                <p className="text-2xl font-bold text-blue-600">{runResult.updated}</p>
              </div>
              <div className="bg-white p-3 rounded-lg border">
                <span className="text-xs text-slate-500 uppercase font-semibold">
                  Ignorados / Inválidos
                </span>
                <p className="text-2xl font-bold text-slate-500">{runResult.ignored}</p>
              </div>
              <div className="bg-white p-3 rounded-lg border">
                <span className="text-xs text-slate-500 uppercase font-semibold">
                  Conflitos / Avisos
                </span>
                <p className="text-2xl font-bold text-amber-600">
                  {runResult.conflicts?.length || 0}
                </p>
              </div>
            </div>

            {runResult.conflicts?.length > 0 && (
              <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs space-y-1">
                <p className="font-semibold text-amber-900">
                  Aviso de Conflitos Detectados na Reimportação / Validação:
                </p>
                <div className="max-h-36 overflow-y-auto space-y-1">
                  {runResult.conflicts.map((c: any, idx: number) => (
                    <p key={idx} className="text-amber-800">
                      • Linha {c.index}: {c.reason || 'Conflito de campo'} ({c.field}) — Valor
                      local: <code>{String(c.local_value ?? '')}</code> | Valor origem:{' '}
                      <code>{String(c.origin_value ?? '')}</code>
                    </p>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Tabs com Prévia e Validação */}
      {parsedRows.length > 0 && (
        <Tabs value={activeTab} onValueChange={(v: any) => setActiveTab(v)} className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <TabsList>
              <TabsTrigger value="preview">Prévia Scaglioni ({parsedRows.length})</TabsTrigger>
              <TabsTrigger value="mapping">Mapeamento de Destino</TabsTrigger>
              <TabsTrigger value="images">Galeria e Imagens</TabsTrigger>
              <TabsTrigger value="association">Conciliação Manual</TabsTrigger>
              {runResult && <TabsTrigger value="report">Relatório por Linha</TabsTrigger>}
            </TabsList>

            <div className="relative w-full sm:w-72">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar por nome, sku, id, marca..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs border rounded-md"
              />
            </div>
          </div>

          {/* Aba 1: Prévia Mapeada */}
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
                    <th className="p-2.5 text-center">Foto Link</th>
                    <th className="p-2.5 text-center">E-commerce</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredPreview.slice(0, 100).map((row) => (
                    <tr key={row.index} className="hover:bg-slate-50/70">
                      <td className="p-2.5 text-slate-400 font-mono">{row.index}</td>
                      <td className="p-2.5 font-mono text-slate-700">{row.id_scaglioni || '—'}</td>
                      <td className="p-2.5 font-mono font-semibold text-sky-800">
                        {row.sku_scaglioni || '—'}
                      </td>
                      <td
                        className="p-2.5 max-w-xs truncate font-medium text-slate-900"
                        title={row.nome_produto}
                      >
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
                        {row.preco_promocional !== null
                          ? formatCurrency(row.preco_promocional)
                          : '—'}
                      </td>
                      <td className="p-2.5 text-center">
                        <Badge variant="outline" className="font-mono">
                          {row.estoque} un
                        </Badge>
                      </td>
                      <td className="p-2.5 text-center">
                        {row.imagem_url ? (
                          <div className="inline-flex items-center gap-1 text-sky-600">
                            <Image className="w-3.5 h-3.5" />
                            <span className="text-[10px]">
                              {row.urls_imagens.length > 0 ? `+${row.urls_imagens.length}` : 'URL'}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
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
            {filteredPreview.length > 100 && (
              <p className="text-xs text-slate-500 text-center">
                Mostrando os primeiros 100 de {filteredPreview.length} produtos.
              </p>
            )}
          </TabsContent>

          {/* Aba 2: Mapeamento de Coluna de Origem -> Campo de Destino -> Valor Interpretado */}
          <TabsContent value="mapping" className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">
                  Mapeamento Obrigatório: Coluna de Origem → Campo de Destino → Valor Interpretado
                </CardTitle>
                <CardDescription>
                  Demonstração da conversão exata conforme o formato real do arquivo Scaglioni
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {parsedRows.length > 0 && (
                  <div className="rounded-md border bg-slate-50/50 p-3 mb-4 text-xs text-slate-700">
                    <p className="font-semibold text-slate-900 mb-1">
                      Amostra Interpretada da 1ª Linha do Arquivo:
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                      <div>
                        <span className="text-slate-500">ID Origem:</span>{' '}
                        <strong>{parsedRows[0].id_scaglioni || '—'}</strong>
                      </div>
                      <div>
                        <span className="text-slate-500">Nome:</span>{' '}
                        <strong>{parsedRows[0].nome_produto || '—'}</strong>
                      </div>
                      <div>
                        <span className="text-slate-500">SKU:</span>{' '}
                        <strong>{parsedRows[0].sku_scaglioni || '—'}</strong>
                      </div>
                      <div>
                        <span className="text-slate-500">Preço Venda:</span>{' '}
                        <strong>{formatCurrency(parsedRows[0].preco_venda)}</strong>
                      </div>
                      <div>
                        <span className="text-slate-500">Preço Promo:</span>{' '}
                        <strong>
                          {parsedRows[0].preco_promocional !== null
                            ? formatCurrency(parsedRows[0].preco_promocional)
                            : '(vazio)'}
                        </strong>
                      </div>
                      <div>
                        <span className="text-slate-500">Saldo Inicial:</span>{' '}
                        <strong>{parsedRows[0].estoque} un</strong>
                      </div>
                      <div>
                        <span className="text-slate-500">Marca:</span>{' '}
                        <strong>{parsedRows[0].marca || parsedRows[0].marca_id || '—'}</strong>
                      </div>
                      <div>
                        <span className="text-slate-500">Categorias:</span>{' '}
                        <strong>
                          {parsedRows[0].categorias.join(', ') ||
                            parsedRows[0].categoria_principal ||
                            '—'}
                        </strong>
                      </div>
                      <div>
                        <span className="text-slate-500">Status Canal:</span>{' '}
                        <strong>{parsedRows[0].ativo ? 'Ativo' : 'Inativo'}</strong>
                      </div>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  {Object.entries(SCAGLIONI_COLUMN_MAP).map(([col, targetField]) => (
                    <div key={col} className="p-3 bg-white rounded border border-slate-200">
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-bold text-sky-900 bg-sky-50 px-1.5 py-0.5 rounded border border-sky-200">
                          {col}
                        </span>
                        <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                        <span className="font-semibold text-slate-900">
                          {DESTINATION_FIELD_LABELS[targetField] || targetField}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Aba 3: Relatório de Imagens e Galeria */}
          <TabsContent value="images" className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">
                  Fotos e Galeria de Imagens da Origem Scaglioni
                </CardTitle>
                <CardDescription>
                  Exibição das imagens principais e fotos adicionais que alimentam o Estoque Loja e
                  a Vitrine
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                  {parsedRows
                    .filter((r) => r.imagem_url)
                    .slice(0, 12)
                    .map((item, idx) => (
                      <div
                        key={idx}
                        className="p-2 bg-white rounded-lg border flex flex-col items-center space-y-1 text-center"
                      >
                        <div className="w-full h-24 bg-slate-100 rounded flex items-center justify-center overflow-hidden">
                          <img
                            src={item.imagem_url}
                            alt={item.nome_produto}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              ;(e.target as HTMLElement).style.display = 'none'
                            }}
                          />
                        </div>
                        <span className="text-[11px] font-semibold text-slate-800 line-clamp-1">
                          {item.nome_produto}
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono">
                          {item.sku_scaglioni || item.id_scaglioni}
                        </span>
                        {item.urls_imagens.length > 0 && (
                          <Badge variant="secondary" className="text-[9px]">
                            +{item.urls_imagens.length} adicionais
                          </Badge>
                        )}
                      </div>
                    ))}
                </div>

                {runResult?.image_failures?.length > 0 && (
                  <Alert variant="destructive" className="bg-red-50 border-red-200 text-red-950">
                    <AlertTriangle className="h-4 w-4 text-red-600" />
                    <AlertTitle className="text-sm font-semibold">
                      Relatório Separado de Imagens que Falharam ({runResult.image_failures.length})
                    </AlertTitle>
                    <AlertDescription className="text-xs mt-1 space-y-1">
                      {runResult.image_failures.map((f: any, idx: number) => (
                        <div key={idx} className="border-b border-red-200/60 pb-1">
                          <span>
                            Linha {f.index} ({f.name} - {f.code}): {f.reason} —{' '}
                            <code className="text-[10px]">{f.url}</code>
                          </span>
                        </div>
                      ))}
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Aba 4: Conciliação Manual */}
          <TabsContent value="association" className="space-y-4">
            <Card className="border-indigo-100 bg-indigo-50/20">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <GitMerge className="w-5 h-5 text-indigo-600" />
                    <CardTitle className="text-base text-indigo-950">
                      Conciliação Manual (Tecson ↔ Scaglioni)
                    </CardTitle>
                  </div>
                  <Badge
                    variant="outline"
                    className="bg-indigo-100 text-indigo-800 border-indigo-300"
                  >
                    {tecsonCandidates.length} Tecson pendentes • {scaglioniCandidates.length}{' '}
                    Scaglioni pendentes
                  </Badge>
                </div>
                <CardDescription className="text-xs">
                  Associe manualmente peças de ambos os sistemas mantendo um único cadastro
                  unificado e decidindo o saldo inicial correto.
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
          </TabsContent>

          {/* Aba 5: Relatório por Linha */}
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
                      <th className="p-2.5">Motivo / Detalhes</th>
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
                            {rep.status === 'created'
                              ? 'Criado'
                              : rep.status === 'updated'
                                ? 'Atualizado'
                                : 'Ignorado / Erro'}
                          </Badge>
                        </td>
                        <td className="p-2.5 font-mono">{rep.code || '—'}</td>
                        <td className="p-2.5 font-medium">{rep.name || '—'}</td>
                        <td className="p-2.5 text-slate-500">
                          {rep.reason ||
                            (rep.status === 'updated' ? 'Reimportação idempotente' : 'Sucesso')}
                        </td>
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
                Suporta formato com delimitador ponto e vírgula, BOM UTF-8, marcas e categorias
                UUID/nome, galeria de imagens e preços promocionais.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Button
                onClick={() => fileInputRef.current?.click()}
                className="bg-sky-700 hover:bg-sky-800 text-white"
              >
                <FileCode className="w-4 h-4 mr-2" />
                Procurar Arquivo Scaglioni
              </Button>
              <Button
                variant="outline"
                onClick={async () => {
                  const { SAMPLE_SCAGLIONI_CSV } = await import('@/lib/sampleScaglioniData')
                  const blob = new Blob([SAMPLE_SCAGLIONI_CSV], { type: 'text/csv;charset=utf-8;' })
                  const file = new File([blob], 'produtos-8d482.csv', { type: 'text/csv' })
                  const dummyEvent = {
                    target: { files: [file] },
                  } as unknown as React.ChangeEvent<HTMLInputElement>
                  handleFileChange(dummyEvent)
                }}
                className="border-sky-300 text-sky-800 hover:bg-sky-50"
              >
                <Play className="w-4 h-4 mr-2 text-sky-600" />
                Carregar Arquivo Oficial (produtos-8d482.csv)
              </Button>
            </div>
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
