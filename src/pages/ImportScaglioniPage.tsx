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

// Mapeamento canônico Scaglioni conforme especificação obrigatória:
// - nome → nome_produto
// - descricao → descricao
// - sku → sku_scaglioni
// - preco → preco_venda
// - preco_promocional → preco_promocional
// - estoque → qtde_inicial
// - imagem_url → imagem_principal
// - categoria_id → categorias (convertendo o ID numérico para o nome correspondente)
// - marca_id → marca (convertendo o ID numérico para o nome da marca)
// - altura_cm → altura_cm
// - largura_cm → largura_cm
// - comprimento_cm → comprimento_cm
// - peso_g → peso_g
// - ativo → publicar_no_ecommerce
// - destaque → destaque_ecommerce
// - created_at → criado_em_origem
// NÃO importar: id como produto_id, slug, updated_at
// Também gerar sku_novo pelo próprio sistema.
const SCAGLIONI_COLUMN_MAP: Record<string, string> = {
  nome: 'nome_produto',
  descricao: 'descricao',
  sku: 'sku_scaglioni',
  preco: 'preco_venda',
  preco_promocional: 'preco_promocional',
  estoque: 'qtde_inicial',
  imagem_url: 'imagem_principal',
  categoria_id: 'categorias',
  marca_id: 'marca',
  altura_cm: 'altura_cm',
  largura_cm: 'largura_cm',
  comprimento_cm: 'comprimento_cm',
  peso_g: 'peso_g',
  ativo: 'publicar_no_ecommerce',
  destaque: 'destaque_ecommerce',
  created_at: 'criado_em_origem',
  // Sinônimos tolerados para leitura completa de variações comuns do CSV
  nome_produto: 'nome_produto',
  description: 'descricao',
  sku_scaglioni: 'sku_scaglioni',
  preco_venda: 'preco_venda',
  selling_price: 'preco_venda',
  quantidade: 'qtde_inicial',
  saldo: 'qtde_inicial',
  image_url: 'imagem_principal',
  marca: 'marca',
  categoria: 'categorias',
  categorias: 'categorias',
  'categoria(s)': 'categorias',
  categoria_principal: 'categoria_principal',
  urls_imagens: 'urls_imagens',
  arquivos_imagens: 'arquivos_imagens',
  // Colunas explicitamente não importadas (conforme regra do usuário):
  id: '__IGNORAR_ID__',
  slug: '__IGNORAR_SLUG__',
  updated_at: '__IGNORAR_UPDATED_AT__',
}

// Descrição amigável de destino
const DESTINATION_FIELD_LABELS: Record<string, string> = {
  nome_produto: 'Nome Produto (nome_produto) — Exclusivo da coluna "nome"',
  descricao: 'Descrição (descricao) — Exclusivo da coluna "descricao"',
  sku_scaglioni: 'SKU Scaglioni (sku_scaglioni)',
  preco_venda: 'Preço Venda (preco_venda)',
  preco_promocional: 'Preço Promocional (preco_promocional)',
  qtde_inicial: 'Qtde Inicial (qtde_inicial)',
  imagem_principal: 'Imagem Principal (imagem_principal)',
  categorias: 'Categorias (categorias — ID numérico convertido)',
  marca: 'Marca (marca — ID numérico convertido)',
  altura_cm: 'Altura cm (altura_cm)',
  largura_cm: 'Largura cm (largura_cm)',
  comprimento_cm: 'Comprimento cm (comprimento_cm)',
  peso_g: 'Peso g (peso_g)',
  publicar_no_ecommerce: 'Publicar no E-commerce (publicar_no_ecommerce)',
  destaque_ecommerce: 'Destaque E-commerce (destaque_ecommerce)',
  criado_em_origem: 'Criado em Origem (criado_em_origem)',
  __IGNORAR_ID__: 'NÃO IMPORTAR (produto_id gerado pelo sistema)',
  __IGNORAR_SLUG__: 'NÃO IMPORTAR (slug desconsiderado)',
  __IGNORAR_UPDATED_AT__: 'NÃO IMPORTAR (updated_at desconsiderado)',
}

export interface ParsedScaglioniItem {
  index: number
  id_scaglioni: string
  produto_id_gerado: string
  sku_novo: string
  nome_produto: string
  descricao: string
  sku_scaglioni: string
  marca_id: string
  marca: string
  categoria_id: string
  categorias: string[]
  categoria_principal: string
  preco_venda: number
  preco_promocional: number | null
  qtde_inicial: number
  estoque: number
  imagem_principal: string
  imagem_url: string
  urls_imagens: string[]
  arquivos_imagens: string
  altura_cm: number | null
  largura_cm: number | null
  comprimento_cm: number | null
  peso_g: number | null
  publicar_no_ecommerce: boolean
  destaque_ecommerce: boolean
  ativo: boolean
  destaque: boolean
  criado_em_origem: string
  created_at: string
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

  // Conversão de ID numérico para nomes correspondentes de marcas e categorias
  const resolveMarcaName = (val: any): string => {
    if (!val) return ''
    const strVal = String(val).trim()
    const idNum = parseInt(strVal, 10)
    if (!isNaN(idNum)) {
      const KNOWN_BRANDS: Record<number, string> = {
        1: 'Scaglioni Joias',
        2: 'Scaglioni Prata 925',
        3: 'Scaglioni Ouro 18k',
        4: 'Scaglioni Folheados',
      }
      return KNOWN_BRANDS[idNum] || `Marca ${idNum}`
    }
    return strVal
  }

  const resolveCategoriaName = (val: any): string => {
    if (!val) return ''
    const strVal = String(val).trim()
    const idNum = parseInt(strVal, 10)
    if (!isNaN(idNum)) {
      const KNOWN_CATEGORIES: Record<number, string> = {
        1: 'Anéis',
        2: 'Brincos',
        3: 'Colares',
        4: 'Pulseiras',
        5: 'Pingentes',
        6: 'Tornozeleiras',
        7: 'Conjuntos',
        8: 'Correntes',
        9: 'Alianças',
        10: 'Gargantilhas',
        11: 'Chokers',
        12: 'Braceletes',
      }
      return KNOWN_CATEGORIES[idNum] || `Categoria ${idNum}`
    }
    return strVal
  }

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

  const sanitizeFrontendUrl = (u: any): string => {
    if (!u) return ''
    let str = String(u).trim()
    str = str
      .replace(/^\uFEFF+/, '')
      .replace(/[\r\n\t]+/g, '')
      .trim()
    str = str.replace(/^["'`]+|["'`]+$/g, '').trim()
    str = str.replace(/^[[({<]+|[\])}>]+$/g, '').trim()
    str = str.replace(/^["'`]+|["'`]+$/g, '').trim()
    return str
  }

  const extractFrontendGalleryUrls = (input: any): string[] => {
    if (!input) return []
    const list: string[] = []

    const addVal = (val: any) => {
      if (!val) return
      if (Array.isArray(val)) {
        val.forEach(addVal)
        return
      }
      const s = String(val).trim()
      if (!s) return

      if (s.startsWith('[') && s.endsWith(']')) {
        try {
          const parsed = JSON.parse(s)
          if (Array.isArray(parsed)) {
            parsed.forEach(addVal)
            return
          }
        } catch (_) {
          const stripped = s.replace(/^\[\s*|\s*\]$/g, '')
          return addVal(stripped)
        }
      }

      if (s.includes('|') || s.includes('\n') || s.includes('\r')) {
        s.split(/[|\r\n]+/).forEach(addVal)
        return
      }

      if (s.includes('http://') || s.includes('https://')) {
        const matches = s.match(/https?:\/\/[^\s"'`|,;\]>]+/gi)
        if (matches && matches.length > 1) {
          matches.forEach((m) => {
            const clean = sanitizeFrontendUrl(m)
            if (clean) list.push(clean)
          })
          return
        }
      }

      const clean = sanitizeFrontendUrl(s)
      if (clean) list.push(clean)
    }

    if (Array.isArray(input)) {
      input.forEach(addVal)
    } else {
      addVal(input)
    }
    return list
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
      // Obter próximo código numérico para simulação fiel na prévia (piso mínimo 10000)
      // e o conjunto de todos os números já ocupados (Tecson, Scaglioni etc.)
      let startNum = 10000
      let usedNumbersSet = new Set<number>()
      try {
        const [nextCodeStr, usedNumbers] = await Promise.all([
          productService.getNextProductCode(),
          productService.getUsedNumericProductCodes(),
        ])
        const parsed = parseInt(nextCodeStr, 10)
        if (!isNaN(parsed) && parsed >= 10000) {
          startNum = parsed
        }
        usedNumbersSet = usedNumbers
      } catch {
        /* intentionally ignored */
      }

      // Função geradora de códigos sequenciais para a prévia que pula ocupados
      let previewSeqCounter = startNum - 1
      const getNextPreviewCode = (): string => {
        let cand = previewSeqCounter + 1
        if (cand < 10000) cand = 10000
        while (usedNumbersSet.has(cand)) {
          cand++
        }
        previewSeqCounter = cand
        usedNumbersSet.add(cand)
        return String(cand)
      }

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
          // Mapeamento obrigatório:
          // nome -> nome_produto EXCLUSIVAMENTE
          // descricao -> descricao EXCLUSIVAMENTE
          const nomeProduto = String(item.nome ?? item.nome_produto ?? '').trim()
          const descricao = String(item.descricao ?? item.description ?? '')

          // preco -> preco_venda
          const precoVenda = parseNumberValue(item.preco ?? item.preco_venda)

          // preco_promocional -> preco_promocional
          const rawPromo = item.preco_promocional
          const precoPromo =
            rawPromo !== undefined && rawPromo !== null && String(rawPromo).trim() !== ''
              ? parseNumberValue(rawPromo)
              : null

          // estoque -> qtde_inicial
          const qtdeInicial = parseInt(item.estoque ?? item.quantidade ?? 0, 10) || 0

          // imagem_url -> imagem_principal
          const imagemPrincipal = sanitizeFrontendUrl(item.imagem_url ?? item.image_url ?? '')

          // categoria_id -> categorias (convertendo ID numérico para o nome correspondente)
          let catRaw = item.categoria_id ?? item.categoria ?? item.categorias
          let cats: string[] = []
          if (Array.isArray(catRaw)) {
            cats = catRaw.map((c) => resolveCategoriaName(c)).filter(Boolean)
          } else if (catRaw) {
            cats = String(catRaw)
              .split('|')
              .map((c) => resolveCategoriaName(c))
              .filter(Boolean)
          }

          // marca_id -> marca (convertendo ID numérico para o nome correspondente)
          const marcaName = resolveMarcaName(item.marca_id ?? item.marca)

          // ativo -> publicar_no_ecommerce
          const publicarEcommerce = parseBooleanValue(item.ativo ?? item.is_active, true)

          // destaque -> destaque_ecommerce
          const destaqueEcommerce = parseBooleanValue(item.destaque ?? item.is_featured, false)

          // created_at -> criado_em_origem
          const criadoEmOrigem = String(item.created_at ?? '')

          // sku -> sku_scaglioni
          const skuScaglioni = String(item.sku ?? item.sku_scaglioni ?? '').trim()

          // Gerados pelo próprio sistema (NÃO importar id como produto_id, não importar slug)
          const ts = new Date().getTime().toString().slice(-6)
          const rand1 = Math.floor(1000 + ((idx * 31) % 9000)).toString()
          const generatedProdId = `PROD-${ts}-${rand1}`
          // Código numérico sequencial crescente (10000, 10001, 10002... 99999, 100000...) sem zeros à esquerda, pulando ocupados
          const generatedSkuNovo = getNextPreviewCode()

          const galleryUrls: string[] = extractFrontendGalleryUrls(item.urls_imagens)
          const uniqueGallery = galleryUrls.filter((u) => u && u !== imagemPrincipal)

          return {
            index: idx + 1,
            id_scaglioni: item.id ? String(item.id).trim() : '',
            produto_id_gerado: generatedProdId,
            sku_novo: generatedSkuNovo,
            nome_produto: nomeProduto,
            descricao: descricao,
            sku_scaglioni: skuScaglioni,
            marca_id: item.marca_id ? String(item.marca_id).trim() : '',
            marca: marcaName,
            categoria_id: item.categoria_id ? String(item.categoria_id).trim() : '',
            categorias: cats,
            categoria_principal: cats[0] || '',
            preco_venda: precoVenda,
            preco_promocional: precoPromo,
            qtde_inicial: qtdeInicial,
            estoque: qtdeInicial,
            imagem_principal: imagemPrincipal,
            imagem_url: imagemPrincipal,
            urls_imagens: uniqueGallery,
            arquivos_imagens: item.arquivos_imagens || '',
            altura_cm: parseFloat(item.altura_cm) || null,
            largura_cm: parseFloat(item.largura_cm) || null,
            comprimento_cm: parseFloat(item.comprimento_cm) || null,
            peso_g: parseFloat(item.peso_g) || null,
            publicar_no_ecommerce: publicarEcommerce,
            destaque_ecommerce: destaqueEcommerce,
            ativo: publicarEcommerce,
            destaque: destaqueEcommerce,
            criado_em_origem: criadoEmOrigem,
            created_at: criadoEmOrigem,
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

        // Excluir das não reconhecidas as que são explicitamente ignoradas
        const displayedUnrec = unrecCols.filter((col) => {
          const c = col.trim().toLowerCase()
          return c !== 'id' && c !== 'slug' && c !== 'updated_at'
        })
        setUnrecognizedColumns(Array.from(new Set(displayedUnrec)))

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

          // REGRAS CRÍTICAS:
          // 1. A coluna nome deve preencher EXCLUSIVAMENTE o campo nome_produto.
          // 2. A coluna descricao deve preencher EXCLUSIVAMENTE o campo descricao e NUNCA pode sobrescrever nome_produto.
          const nomeProduto = (rowObj['nome_produto'] || '').trim()
          const descricao = rowObj['descricao'] || ''

          // preco -> preco_venda
          const precoVenda = parseNumberValue(rowObj['preco_venda'])

          // preco_promocional -> preco_promocional
          const rawPromo = rowObj['preco_promocional']
          const precoPromo =
            rawPromo !== undefined && rawPromo !== null && rawPromo.trim() !== ''
              ? parseNumberValue(rawPromo)
              : null

          // estoque -> qtde_inicial
          const qtdeInicial = parseInt(rowObj['qtde_inicial'] || '0', 10) || 0

          // imagem_url -> imagem_principal
          const imagemPrincipal = sanitizeFrontendUrl(rowObj['imagem_principal'] || '')

          // categoria_id -> categorias (convertendo ID numérico para a categoria correspondente)
          let cats: string[] = []
          if (rowObj['categorias']) {
            cats = rowObj['categorias']
              .split('|')
              .map((c: string) => resolveCategoriaName(c))
              .filter(Boolean)
          }

          // marca_id -> marca (convertendo ID numérico para o nome da marca)
          const marcaName = resolveMarcaName(rowObj['marca'])

          // altura_cm -> altura_cm
          const alturaCm = parseFloat(rowObj['altura_cm']) || null
          // largura_cm -> largura_cm
          const larguraCm = parseFloat(rowObj['largura_cm']) || null
          // comprimento_cm -> comprimento_cm
          const comprimentoCm = parseFloat(rowObj['comprimento_cm']) || null
          // peso_g -> peso_g
          const pesoG = parseFloat(rowObj['peso_g']) || null

          // ativo -> publicar_no_ecommerce
          const publicarEcommerce = parseBooleanValue(rowObj['publicar_no_ecommerce'], true)

          // destaque -> destaque_ecommerce
          const destaqueEcommerce = parseBooleanValue(rowObj['destaque_ecommerce'], false)

          // created_at -> criado_em_origem
          const criadoEmOrigem = rowObj['criado_em_origem'] || ''

          // sku -> sku_scaglioni
          const skuScaglioni = (rowObj['sku_scaglioni'] || '').trim()

          // id_scaglioni (armazenado apenas para rastreabilidade de origem e idempotência, NÃO como produto_id)
          // Na linha original do CSV, podemos capturar o valor bruto da coluna id para rastrear
          let rawIdOrigem = ''
          rawHeaders.forEach((h, idx) => {
            if (h.trim().toLowerCase() === 'id') {
              rawIdOrigem = row[idx] ? row[idx].trim() : ''
            }
          })

          // Gerados pelo próprio sistema:
          // produto_id: GERADO pelo próprio sistema (PROD-...)
          const ts = new Date().getTime().toString().slice(-6)
          const rand1 = Math.floor(1000 + ((r * 37) % 9000)).toString()
          const generatedProdId = `PROD-${ts}-${rand1}`

          // sku_novo: GERADO pelo próprio sistema com código numérico sequencial crescente (10000, 10001, 10002... 99999, 100000...) sem zeros à esquerda, pulando ocupados
          const generatedSkuNovo = getNextPreviewCode()

          const galleryUrls: string[] = extractFrontendGalleryUrls(rowObj['urls_imagens'])
          const uniqueGallery = galleryUrls.filter((u) => u && u !== imagemPrincipal)

          const validationErrors: string[] = []
          if (!skuScaglioni && !nomeProduto) {
            validationErrors.push('Linha sem SKU nem Nome')
          }
          if (precoPromo !== null && precoPromo >= precoVenda && precoVenda > 0) {
            validationErrors.push('Preço promocional deve ser menor que o preço de venda')
          }

          rows.push({
            index: r,
            id_scaglioni: rawIdOrigem,
            produto_id_gerado: generatedProdId,
            sku_novo: generatedSkuNovo,
            nome_produto: nomeProduto,
            descricao: descricao,
            sku_scaglioni: skuScaglioni,
            marca_id: '',
            marca: marcaName,
            categoria_id: '',
            categorias: cats,
            categoria_principal: cats[0] || '',
            preco_venda: precoVenda,
            preco_promocional: precoPromo,
            qtde_inicial: qtdeInicial,
            estoque: qtdeInicial,
            imagem_principal: imagemPrincipal,
            imagem_url: imagemPrincipal,
            urls_imagens: uniqueGallery,
            arquivos_imagens: rowObj['arquivos_imagens'] || '',
            altura_cm: alturaCm,
            largura_cm: larguraCm,
            comprimento_cm: comprimentoCm,
            peso_g: pesoG,
            publicar_no_ecommerce: publicarEcommerce,
            destaque_ecommerce: destaqueEcommerce,
            ativo: publicarEcommerce,
            destaque: destaqueEcommerce,
            criado_em_origem: criadoEmOrigem,
            created_at: criadoEmOrigem,
            unrecognized_columns: displayedUnrec,
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
      r.descricao.toLowerCase().includes(s) ||
      r.sku_scaglioni.toLowerCase().includes(s) ||
      r.sku_novo.toLowerCase().includes(s) ||
      r.produto_id_gerado.toLowerCase().includes(s) ||
      r.marca.toLowerCase().includes(s) ||
      r.categorias.some((cat) => cat.toLowerCase().includes(s)) ||
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
          Regras de Negócio e Mapeamento Canônico — Origem Scaglioni
        </AlertTitle>
        <AlertDescription className="text-xs text-sky-800/90 mt-1 space-y-1">
          <p>
            • <strong>Separação Estrita de Campos:</strong> A coluna <code>nome</code> alimenta{' '}
            <em>exclusivamente</em> <code>nome_produto</code>. A coluna <code>descricao</code>{' '}
            alimenta <em>exclusivamente</em> <code>descricao</code> e nunca sobrescreve{' '}
            <code>nome_produto</code>.
          </p>
          <p>
            • <strong>Conversão de IDs:</strong> <code>categoria_id</code> e <code>marca_id</code>{' '}
            são convertidos de ID numérico para nomes legíveis de categorias e marcas.
          </p>
          <p>
            • <strong>Exclusões e Geração Automática:</strong> A coluna <code>id</code> do CSV NÃO é
            usada como <code>produto_id</code> (o sistema gera <code>PROD-...</code>) e{' '}
            <code>sku_novo</code> é gerado pelo próprio sistema com numeração sequencial sem zeros à
            esquerda (<code>10000, 10001, 10002...</code>). Colunas <code>slug</code> e{' '}
            <code>updated_at</code> não são importadas.
          </p>
          <p>
            • <strong>Idempotência &amp; Estoque:</strong> <code>estoque</code> alimenta{' '}
            <code>qtde_inicial</code>. Reimportar não duplica registros, fotos nem saldos em{' '}
            <code>initial_stocks</code>.
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

          {/* Aba 1: Prévia Mapeada conforme estrutura exata do cadastro */}
          <TabsContent value="preview" className="space-y-4">
            <div className="rounded-md border bg-white overflow-x-auto max-h-[500px]">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-700 sticky top-0 border-b">
                  <tr>
                    <th className="p-2.5">#</th>
                    <th className="p-2.5">Produto ID (Gerado)</th>
                    <th className="p-2.5">SKU Novo (Gerado)</th>
                    <th className="p-2.5">SKU Scaglioni</th>
                    <th className="p-2.5">Nome do Produto</th>
                    <th className="p-2.5">Descrição</th>
                    <th className="p-2.5">Marca / Categorias</th>
                    <th className="p-2.5 text-right">Preço Venda</th>
                    <th className="p-2.5 text-right">Preço Promo</th>
                    <th className="p-2.5 text-center">Qtde Inicial</th>
                    <th className="p-2.5 text-center">Imagem Principal</th>
                    <th className="p-2.5 text-center">E-commerce</th>
                    <th className="p-2.5 text-center">Destaque</th>
                    <th className="p-2.5 text-center">Criado em Origem</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredPreview.slice(0, 100).map((row) => (
                    <tr key={row.index} className="hover:bg-slate-50/70">
                      <td className="p-2.5 text-slate-400 font-mono">{row.index}</td>
                      <td className="p-2.5 font-mono text-purple-700 font-medium">
                        {row.produto_id_gerado}
                      </td>
                      <td className="p-2.5 font-mono text-indigo-700 font-semibold">
                        {row.sku_novo}
                      </td>
                      <td className="p-2.5 font-mono font-semibold text-sky-800">
                        {row.sku_scaglioni || '—'}
                      </td>
                      <td
                        className="p-2.5 max-w-[200px] truncate font-semibold text-slate-900"
                        title={row.nome_produto}
                      >
                        {row.nome_produto || '—'}
                      </td>
                      <td
                        className="p-2.5 max-w-[180px] truncate text-slate-600 italic"
                        title={row.descricao}
                      >
                        {row.descricao || '—'}
                      </td>
                      <td className="p-2.5 text-slate-700">
                        <span className="font-medium text-slate-900">{row.marca || '—'}</span>
                        {row.categorias.length > 0 && (
                          <span className="text-slate-500 block text-[11px]">
                            {row.categorias.join(', ')}
                          </span>
                        )}
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
                          {row.qtde_inicial} un
                        </Badge>
                      </td>
                      <td className="p-2.5 text-center">
                        {row.imagem_principal ? (
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
                          variant={row.publicar_no_ecommerce ? 'default' : 'secondary'}
                          className={row.publicar_no_ecommerce ? 'bg-emerald-600' : ''}
                        >
                          {row.publicar_no_ecommerce ? 'Sim' : 'Não'}
                        </Badge>
                      </td>
                      <td className="p-2.5 text-center">
                        {row.destaque_ecommerce ? (
                          <Badge className="bg-amber-600 text-[10px]">Destaque</Badge>
                        ) : (
                          <span className="text-slate-400 text-[11px]">Não</span>
                        )}
                      </td>
                      <td className="p-2.5 text-center font-mono text-[11px] text-slate-600">
                        {row.criado_em_origem || '—'}
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
                      Amostra Interpretada da 1ª Linha do Arquivo (Novo Mapeamento Canônico):
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                      <div>
                        <span className="text-slate-500">Nome Produto (nome):</span>{' '}
                        <strong>{parsedRows[0].nome_produto || '—'}</strong>
                      </div>
                      <div>
                        <span className="text-slate-500">Descrição (descricao):</span>{' '}
                        <strong className="italic">{parsedRows[0].descricao || '(vazio)'}</strong>
                      </div>
                      <div>
                        <span className="text-slate-500">SKU Scaglioni (sku):</span>{' '}
                        <strong>{parsedRows[0].sku_scaglioni || '—'}</strong>
                      </div>
                      <div>
                        <span className="text-slate-500">Preço Venda (preco):</span>{' '}
                        <strong>{formatCurrency(parsedRows[0].preco_venda)}</strong>
                      </div>
                      <div>
                        <span className="text-slate-500">Preço Promo (preco_promocional):</span>{' '}
                        <strong>
                          {parsedRows[0].preco_promocional !== null
                            ? formatCurrency(parsedRows[0].preco_promocional)
                            : '(vazio)'}
                        </strong>
                      </div>
                      <div>
                        <span className="text-slate-500">Qtde Inicial (estoque):</span>{' '}
                        <strong>{parsedRows[0].qtde_inicial} un</strong>
                      </div>
                      <div>
                        <span className="text-slate-500">Marca Convertida (marca_id):</span>{' '}
                        <strong>{parsedRows[0].marca || '—'}</strong>
                      </div>
                      <div>
                        <span className="text-slate-500">
                          Categorias Convertidas (categoria_id):
                        </span>{' '}
                        <strong>{parsedRows[0].categorias.join(', ') || '—'}</strong>
                      </div>
                      <div>
                        <span className="text-slate-500">Publicar no E-commerce (ativo):</span>{' '}
                        <strong>{parsedRows[0].publicar_no_ecommerce ? 'Sim' : 'Não'}</strong>
                      </div>
                      <div>
                        <span className="text-slate-500">Destaque E-commerce (destaque):</span>{' '}
                        <strong>{parsedRows[0].destaque_ecommerce ? 'Sim' : 'Não'}</strong>
                      </div>
                      <div>
                        <span className="text-slate-500">Criado em Origem (created_at):</span>{' '}
                        <strong>{parsedRows[0].criado_em_origem || '—'}</strong>
                      </div>
                      <div>
                        <span className="text-slate-500">Produto ID (Gerado pelo Sistema):</span>{' '}
                        <strong className="text-purple-700 font-mono">
                          {parsedRows[0].produto_id_gerado}
                        </strong>
                      </div>
                      <div>
                        <span className="text-slate-500">SKU Novo (Gerado pelo Sistema):</span>{' '}
                        <strong className="text-indigo-700 font-mono">
                          {parsedRows[0].sku_novo}
                        </strong>
                      </div>
                    </div>
                  </div>
                )}

                {/* Tabela do Mapeamento Obrigatório */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  {[
                    {
                      origem: 'nome',
                      destino: 'nome_produto',
                      nota: 'Exclusivo — nunca sobrescreve com descricao',
                    },
                    {
                      origem: 'descricao',
                      destino: 'descricao',
                      nota: 'Exclusivo — nunca sobrescreve nome_produto',
                    },
                    {
                      origem: 'sku',
                      destino: 'sku_scaglioni',
                      nota: 'Rastreabilidade do SKU original',
                    },
                    { origem: 'preco', destino: 'preco_venda', nota: 'Valor de venda no catálogo' },
                    {
                      origem: 'preco_promocional',
                      destino: 'preco_promocional',
                      nota: 'Preço promocional quando houver',
                    },
                    {
                      origem: 'estoque',
                      destino: 'qtde_inicial',
                      nota: 'Saldo inicial em initial_stocks',
                    },
                    {
                      origem: 'imagem_url',
                      destino: 'imagem_principal',
                      nota: 'Foto principal e product_images',
                    },
                    {
                      origem: 'categoria_id',
                      destino: 'categorias',
                      nota: 'ID numérico convertido para nome (cria se necessário)',
                    },
                    {
                      origem: 'marca_id',
                      destino: 'marca',
                      nota: 'ID numérico convertido para o nome da marca',
                    },
                    { origem: 'altura_cm', destino: 'altura_cm', nota: 'Dimensão logística' },
                    { origem: 'largura_cm', destino: 'largura_cm', nota: 'Dimensão logística' },
                    {
                      origem: 'comprimento_cm',
                      destino: 'comprimento_cm',
                      nota: 'Dimensão logística',
                    },
                    { origem: 'peso_g', destino: 'peso_g', nota: 'Peso em gramas' },
                    {
                      origem: 'ativo',
                      destino: 'publicar_no_ecommerce',
                      nota: 'Visibilidade no e-commerce',
                    },
                    {
                      origem: 'destaque',
                      destino: 'destaque_ecommerce',
                      nota: 'Vitrine de destaque',
                    },
                    {
                      origem: 'created_at',
                      destino: 'criado_em_origem',
                      nota: 'Data/hora de criação na origem',
                    },
                    {
                      origem: 'id (CSV)',
                      destino: 'NÃO IMPORTAR',
                      nota: 'produto_id é GERADO pelo sistema',
                    },
                    { origem: 'slug', destino: 'NÃO IMPORTAR', nota: 'Desconsiderado' },
                    { origem: 'updated_at', destino: 'NÃO IMPORTAR', nota: 'Desconsiderado' },
                    {
                      origem: '(sistema)',
                      destino: 'sku_novo',
                      nota: 'Gerado automaticamente pelo sistema',
                    },
                  ].map((item, idx) => (
                    <div key={idx} className="p-3 bg-white rounded border border-slate-200">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-mono font-bold text-sky-900 bg-sky-50 px-1.5 py-0.5 rounded border border-sky-200">
                          {item.origem}
                        </span>
                        <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                        <span
                          className={`font-semibold ${
                            item.destino.includes('NÃO') ? 'text-red-600' : 'text-slate-900'
                          }`}
                        >
                          {item.destino}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-500">{item.nota}</p>
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
