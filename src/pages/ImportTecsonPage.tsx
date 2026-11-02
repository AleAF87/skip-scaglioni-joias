import React, { useState, useRef } from 'react'
import {
  Upload,
  FileSpreadsheet,
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
  Barcode,
  Search,
  Trash2,
  ChevronDown,
  ChevronUp,
  Loader2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from '@/hooks/use-toast'
import { useAuth } from '@/contexts/AuthContext'
import { productService } from '@/services/productService'
import { formatCurrency } from '@/lib/formatters'
import { decodeFileTolerant, parseCsvRows } from '@/lib/csvParser'

// Mapeamento explícito de colunas Tecson
const TECSON_COLUMN_MAP: Record<string, string> = {
  id: 'id_tecson',
  id_edicao: 'lote_bruto_ignorado',
  data_inclusao: 'data_inclusao_tecson',
  imagem: 'image_url',
  url_imagem: 'image_url',
  arquivo_imagem: 'import_image_path',
  nome: 'nome_produto',
  cod_produto: 'codigo_produto_ignorado',
  codigo_produto: 'codigo_produto_ignorado',
  fornecedor: 'fornecedor',
  codigo_barras: 'codigo_barras_tecson',
  quant_em_estoques: 'quantidade_estoques',
  quantidade_estoques: 'quantidade_estoques',
  r$_venda: 'preco_venda',
  r_venda: 'preco_venda',
  preco_venda: 'preco_venda',
  r$_custo: 'custo_unitario',
  r_custo: 'custo_unitario',
  preco_custo: 'custo_unitario',
  r$_venda_em_estoques: 'valor_venda_estoques_ignorado',
  r$_custo_em_estoques: 'valor_custo_estoques_ignorado',
  valor_venda_estoques: 'valor_venda_estoques_ignorado',
  valor_custo_estoques: 'valor_custo_estoques_ignorado',
  tipo_produto: 'tipo_produto_bruto',
  variacao_resumo: 'variacao_resumo_bruto',
  variacao: 'variacao_resumo_bruto',
  nome_produto_pai: 'nome_produto_pai_bruto',
  cod_produto_pai: 'cod_produto_pai_bruto',
  codigo_barras_pai: 'codigo_barras_pai_bruto',
  busca_grade: 'busca_grade_ignorado',
  options: 'options_ignorado',
}

// Motivos descritivos para colunas ignoradas por regra explícita de negócio
const TECSON_IGNORED_REASONS: Record<string, string> = {
  valor_venda_estoques_ignorado:
    'Total calculado (quantidade × preço de venda) — não importável no cadastro',
  valor_custo_estoques_ignorado:
    'Total calculado (quantidade × custo unitário) — não importável no cadastro',
  lote_bruto_ignorado: 'Identificador do lote legado de edição — não importável no cadastro',
  busca_grade_ignorado: 'Auxiliar de índice do sistema antigo — não utilizado',
  options_ignorado: 'Opções auxiliares legadas em HTML/JSON — não utilizado',
  codigo_produto_ignorado:
    'Código legado descartado conforme regra de negócio — o código do produto provém exclusivamente da coluna codigo_barras',
}

export interface IgnoredColumnRuleItem {
  column: string
  targetField: string
  reason: string
}

interface ParsedTecsonRow {
  index: number
  id_tecson: string
  codigo_barras_tecson: string
  nome_produto: string
  nome_original_tecson: string
  data_inclusao_tecson: string
  fornecedor: string
  preco_venda: number
  custo_unitario: number
  quantidade_estoques: number
  image_url: string
  import_image_path: string
  tipo_produto_bruto: string
  variacao_resumo_bruto: string
  nome_produto_pai_bruto: string
  cod_produto_pai_bruto: string
  codigo_barras_pai_bruto: string
  raw_mapped: Record<string, any>
  unrecognized_columns: string[]
  validation_errors: string[]
}

export function ImportTecsonPage() {
  const { isAdmin } = useAuth()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const [parsedRows, setParsedRows] = useState<ParsedTecsonRow[]>([])
  const [unrecognizedColumns, setUnrecognizedColumns] = useState<string[]>([])
  const [ignoredColumnsReport, setIgnoredColumnsReport] = useState<IgnoredColumnRuleItem[]>([])
  const [isParsing, setIsParsing] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [processingStatus, setProcessingStatus] = useState<string>('')
  const [progress, setProgress] = useState(0)
  const [runResult, setRunResult] = useState<any | null>(null)
  const [activeTab, setActiveTab] = useState<'preview' | 'validation' | 'report'>('preview')
  const [searchTerm, setSearchTerm] = useState('')

  // Estado da seção de limpeza total do banco
  const [clearChecked, setClearChecked] = useState(false)
  const [safetyPhrase, setSafetyPhrase] = useState('')
  const [isClearing, setIsClearing] = useState(false)
  const [clearResult, setClearResult] = useState<any | null>(null)
  const [isClearSectionOpen, setIsClearSectionOpen] = useState(false)

  // Extrair src de tag <img> se houver
  const extractImgSrc = (val: string): string => {
    if (!val) return ''
    const match = val.match(/<img[^>]+src=["']([^"']+)["']/i)
    if (match && match[1]) {
      return match[1].trim()
    }
    return val.trim()
  }

  // Parsear número monetário brasileiro
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

    setCsvFile(file)
    setIsParsing(true)
    setRunResult(null)
    setParsedRows([])
    setUnrecognizedColumns([])
    setIgnoredColumnsReport([])

    try {
      const decoded = await decodeFileTolerant(file)
      const text = typeof decoded === 'string' ? decoded : decoded.text
      const rawMatrix = parseCsvRows(text)

      if (rawMatrix.length < 2) {
        toast({
          title: 'Arquivo vazio ou sem cabeçalho',
          description: 'O CSV fornecido não contém linhas de produtos válidas.',
          variant: 'destructive',
        })
        setIsParsing(false)
        return
      }

      const rawHeaders = rawMatrix[0]
      const ignoredCols: IgnoredColumnRuleItem[] = []
      const unrecCols: string[] = []
      const seenIgnored = new Set<string>()

      // Normalizar headers
      const headerMapping: Record<number, { targetField: string; original: string }> = {}

      rawHeaders.forEach((header, idx) => {
        const cleanHeader = header
          .trim()
          .toLowerCase()
          .replace(/[\s\-_]+/g, '_')
        const target = TECSON_COLUMN_MAP[cleanHeader]

        if (target) {
          headerMapping[idx] = { targetField: target, original: header }
          if (target.endsWith('_ignorado')) {
            const key = `${header.trim()}:${target}`
            if (!seenIgnored.has(key)) {
              seenIgnored.add(key)
              ignoredCols.push({
                column: header.trim(),
                targetField: target,
                reason:
                  TECSON_IGNORED_REASONS[target] ||
                  'Campo auxiliar ignorado conforme regra de negócio',
              })
            }
          }
        } else {
          unrecCols.push(header)
        }
      })

      setUnrecognizedColumns(Array.from(new Set(unrecCols)))
      setIgnoredColumnsReport(ignoredCols)

      const parsed: ParsedTecsonRow[] = []

      for (let r = 1; r < rawMatrix.length; r++) {
        const row = rawMatrix[r]
        if (row.length === 0 || (row.length === 1 && !row[0].trim())) continue

        const mapped: Record<string, any> = {}
        row.forEach((cellVal, colIdx) => {
          const mapInfo = headerMapping[colIdx]
          if (mapInfo) {
            mapped[mapInfo.targetField] = cellVal.trim()
          }
        })

        const stripZeros = (s: string) => {
          const t = (s || '').trim()
          if (!/^\d+$/.test(t)) return t
          const stripped = t.replace(/^0+/, '')
          return stripped === '' ? '0' : stripped
        }
        const idTecson = mapped['id_tecson'] ? String(mapped['id_tecson']).trim() : ''
        const rawCodBarras = mapped['codigo_barras_tecson']
          ? String(mapped['codigo_barras_tecson']).trim()
          : ''
        const codBarras = stripZeros(rawCodBarras)
        const nomeOriginal = mapped['nome_produto'] ? String(mapped['nome_produto']).trim() : ''
        const nomeTrim = nomeOriginal

        const rawImg = mapped['image_url'] || ''
        const cleanImg = extractImgSrc(rawImg)

        const precoVenda = parseBrazilianNumber(mapped['preco_venda'])
        const custo = parseBrazilianNumber(mapped['custo_unitario'])
        const quant = parseInt(mapped['quantidade_estoques'], 10) || 0

        const validationErrors: string[] = []
        if (!codBarras) {
          validationErrors.push('Código de barras obrigatório ausente na linha')
        }
        if (!nomeTrim && !idTecson) {
          validationErrors.push('Linha sem identificador Tecson nem nome')
        }

        parsed.push({
          index: r,
          id_tecson: idTecson,
          codigo_barras_tecson: codBarras,
          nome_produto: nomeTrim,
          nome_original_tecson: nomeOriginal,
          data_inclusao_tecson: mapped['data_inclusao_tecson'] || '',
          fornecedor: mapped['fornecedor'] || '',
          preco_venda: precoVenda,
          custo_unitario: custo,
          quantidade_estoques: quant,
          image_url: cleanImg,
          import_image_path: mapped['import_image_path'] || '',
          tipo_produto_bruto: mapped['tipo_produto_bruto'] || '',
          variacao_resumo_bruto: mapped['variacao_resumo_bruto'] || '',
          nome_produto_pai_bruto: mapped['nome_produto_pai_bruto'] || '',
          cod_produto_pai_bruto: mapped['cod_produto_pai_bruto'] || '',
          codigo_barras_pai_bruto: mapped['codigo_barras_pai_bruto'] || '',
          raw_mapped: mapped,
          unrecognized_columns: unrecCols,
          validation_errors: validationErrors,
        })
      }

      setParsedRows(parsed)
      toast({
        title: 'Arquivo Tecson carregado',
        description: `${parsed.length} produtos mapeados com sucesso.`,
      })
    } catch (err: any) {
      toast({
        title: 'Erro ao ler arquivo',
        description: err.message || 'Falha ao processar CSV do Tecson.',
        variant: 'destructive',
      })
    } finally {
      setIsParsing(false)
    }
  }

  const handleExecuteClearAll = async () => {
    if (!clearChecked) {
      toast({
        title: 'Confirmação necessária',
        description:
          'Marque a caixa de seleção para confirmar que deseja apagar todos os produtos.',
        variant: 'destructive',
      })
      return
    }

    if (safetyPhrase.trim() !== 'APAGAR_TUDO_DEFINITIVAMENTE') {
      toast({
        title: 'Frase de segurança incorreta',
        description: 'Digite exatamente APAGAR_TUDO_DEFINITIVAMENTE para autorizar a limpeza.',
        variant: 'destructive',
      })
      return
    }

    setIsClearing(true)
    setClearResult(null)

    try {
      const res = await productService.clearAllProductsAndStock('APAGAR_TUDO_DEFINITIVAMENTE')
      setClearResult(res.deleted)
      setClearChecked(false)
      setSafetyPhrase('')

      const totalRemoved = Object.values(res.deleted || {}).reduce(
        (acc: number, val: any) => acc + (typeof val === 'number' ? val : 0),
        0,
      )

      toast({
        title: 'Limpeza concluída com sucesso',
        description: `${res.deleted.products ?? 0} produtos e ${totalRemoved} registros vinculados (vendas, listas, movimentações) foram apagados definitivamente.`,
      })
    } catch (err: any) {
      console.error('Erro na limpeza do banco:', err)
      toast({
        title: 'Falha na limpeza do banco',
        description: err.message || 'Ocorreu um erro ao executar a limpeza no backend.',
        variant: 'destructive',
      })
    } finally {
      setIsClearing(false)
    }
  }

  const handleExecuteImport = async (dryRun: boolean) => {
    if (parsedRows.length === 0) return

    const rowsWithErrors = parsedRows.filter((r) => r.validation_errors.length > 0)
    const validRows = parsedRows.filter((r) => r.validation_errors.length === 0)

    if (validRows.length === 0) {
      toast({
        title: 'Nenhum item válido para importar',
        description:
          'Todas as linhas do arquivo possuem erros de validação (ex: codigo_barras vazio).',
        variant: 'destructive',
      })
      setActiveTab('validation')
      return
    }

    setIsProcessing(true)
    setProgress(5)

    try {
      // Preparar payload com apenas as linhas válidas (linhas sem codigo_barras são apontadas como erro)
      const allPayloadItems = validRows.map((r) => ({
        id_tecson: r.id_tecson,
        codigo_barras_tecson: r.codigo_barras_tecson,
        nome_produto: r.nome_produto,
        nome_original_tecson: r.nome_original_tecson,
        data_inclusao_tecson: r.data_inclusao_tecson,
        fornecedor: r.fornecedor,
        preco_venda: r.preco_venda,
        custo_unitario: r.custo_unitario,
        quantidade_estoques: r.quantidade_estoques,
        image_url: r.image_url,
        import_image_path: r.import_image_path,
        tipo_produto_bruto: r.tipo_produto_bruto,
        variacao_resumo_bruto: r.variacao_resumo_bruto,
        nome_produto_pai_bruto: r.nome_produto_pai_bruto,
        cod_produto_pai_bruto: r.cod_produto_pai_bruto,
        codigo_barras_pai_bruto: r.codigo_barras_pai_bruto,
      }))

      // Processar em chunks de 50 itens para garantir alta tolerância a timeouts e feedback visual progressivo
      const CHUNK_SIZE = 50
      const totalItems = allPayloadItems.length
      let accumulatedResult = {
        success: true,
        dry_run: dryRun,
        total_received: parsedRows.length,
        created: 0,
        updated: 0,
        ignored: rowsWithErrors.length,
        conflicts: [] as any[],
        image_failures: [] as any[],
        sample_reports: rowsWithErrors.map((r) => ({
          index: r.index,
          status: 'error',
          code: r.codigo_barras_tecson || '—',
          name: r.nome_produto || '—',
          reason: r.validation_errors.join('; '),
        })) as any[],
      }

      for (let offset = 0; offset < totalItems; offset += CHUNK_SIZE) {
        const chunk = allPayloadItems.slice(offset, offset + CHUNK_SIZE)
        const chunkEnd = Math.min(offset + chunk.length, totalItems)
        setProcessingStatus(`Processando itens ${offset + 1} a ${chunkEnd} de ${totalItems}...`)
        const chunkRes = await productService.importTecsonBatch(chunk, dryRun)

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
          // Ajustar índice de linha
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
        title: dryRun ? 'Teste executado (dry-run)' : 'Importação Tecson concluída',
        description: `${accumulatedResult.created} criados, ${accumulatedResult.updated} atualizados, ${accumulatedResult.ignored} ignorados.${
          accumulatedResult.conflicts?.length
            ? ` (${accumulatedResult.conflicts.length} conflitos identificados)`
            : ''
        }`,
      })
    } catch (err: any) {
      console.error('Erro na importação:', err)
      const errorMsg =
        err?.data?.error ||
        err?.message ||
        'Ocorreu um erro ao enviar o lote para o backend. Verifique a conexão e o formato dos dados.'
      toast({
        title: 'Falha na importação',
        description: errorMsg,
        variant: 'destructive',
      })
    } finally {
      setIsProcessing(false)
      setProcessingStatus('')
    }
  }

  const filteredPreview = parsedRows.filter((r) => {
    if (!searchTerm) return true
    const s = searchTerm.toLowerCase()
    return (
      r.nome_produto.toLowerCase().includes(s) ||
      r.codigo_barras_tecson.toLowerCase().includes(s) ||
      r.id_tecson.toLowerCase().includes(s)
    )
  })

  const rowsWithErrors = parsedRows.filter((r) => r.validation_errors.length > 0)

  return (
    <div className="container mx-auto px-4 py-6 max-w-7xl space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-300">
              Origem Tecson
            </Badge>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Importar Tecson</h1>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Importação independente e idempotente do catálogo legado Tecson com saldo inicial e
            códigos originais
          </p>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".csv,text/csv"
            className="hidden"
          />
          <Button
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={isParsing || isProcessing}
          >
            <FileSpreadsheet className="w-4 h-4 mr-2 text-emerald-600" />
            {csvFile ? 'Trocar Arquivo CSV' : 'Selecionar CSV Tecson'}
          </Button>

          {parsedRows.length > 0 && (
            <>
              <Button
                variant="outline"
                onClick={() => handleExecuteImport(true)}
                disabled={isProcessing}
                className="border-amber-400 text-amber-900 hover:bg-amber-50"
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
                className="bg-emerald-700 hover:bg-emerald-800 text-white font-semibold"
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
      <Alert className="bg-amber-50/60 border-amber-200">
        <Info className="h-4 w-4 text-amber-700" />
        <AlertTitle className="text-amber-900 font-semibold text-sm">
          Regras de Negócio — Origem Tecson
        </AlertTitle>
        <AlertDescription className="text-xs text-amber-800/90 mt-1 space-y-1">
          <p>
            • <strong>Idempotência:</strong> O mesmo arquivo pode ser reimportado sem duplicar
            produtos, imagens ou saldos iniciais (chave de reimportação = <code>id_tecson</code>).
          </p>
          <p>
            • <strong>Código do Produto Exclusivo:</strong> O código de identificação do produto
            provém
            <strong> exclusivamente da coluna codigo_barras</strong> (ex.: 611, 00123, 999984), com
            zeros à esquerda preservados para leitura no PDV. A coluna <code>codigo_produto</code> é
            descartada/ignorada.
          </p>
          <p>
            • <strong>Obrigatoriedade do Código:</strong> Linhas com <code>codigo_barras</code>{' '}
            vazio são apontadas como erro e não são gravadas.
          </p>
          <p>
            • <strong>Publicação e Descrição:</strong> Produtos Tecson iniciam com{' '}
            <code>publicar_no_ecommerce = false</code> e descrição vazia/pendente de revisão.
          </p>
          <p>
            • <strong>Saldo Inicial:</strong> Registrado na localização "A definir", sendo o estoque
            atual calculado automaticamente.
          </p>
        </AlertDescription>
      </Alert>

      {/* Alerta de colunas não reconhecidas ou ignoradas intencionalmente */}
      {(unrecognizedColumns.length > 0 || ignoredColumnsReport.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {unrecognizedColumns.length > 0 ? (
            <Alert variant="destructive" className="bg-red-50 border-red-200 text-red-900">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              <AlertTitle className="text-sm font-semibold">
                Colunas não reconhecidas no CSV
              </AlertTitle>
              <AlertDescription className="text-xs mt-1">
                {unrecognizedColumns.join(', ')} — Não foram descartadas silenciosamente e estão
                listadas para conferência.
              </AlertDescription>
            </Alert>
          ) : (
            <Alert className="bg-emerald-50/70 border-emerald-200 text-emerald-950">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <AlertTitle className="text-sm font-semibold">
                Todas as colunas mapeadas com sucesso
              </AlertTitle>
              <AlertDescription className="text-xs mt-1 text-emerald-800">
                Nenhuma coluna não reconhecida. As colunas foram mapeadas diretamente para cadastro,
                registro bruto de auditoria ou ignoradas por regra explícita de negócio sem
                bloqueio.
              </AlertDescription>
            </Alert>
          )}

          {ignoredColumnsReport.length > 0 && (
            <Alert className="bg-slate-50 border-slate-200 text-slate-800">
              <Layers className="h-4 w-4 text-slate-600" />
              <AlertTitle className="text-sm font-semibold flex items-center justify-between">
                <span>
                  Colunas ignoradas por regra de mapeamento ({ignoredColumnsReport.length})
                </span>
                <Badge variant="secondary" className="text-[10px] bg-slate-200 text-slate-700">
                  Sem bloqueio
                </Badge>
              </AlertTitle>
              <AlertDescription className="text-xs mt-1.5 space-y-1">
                <p className="text-slate-600 font-medium">
                  Estas colunas são tratadas por regra definida e não bloqueiam a importação:
                </p>
                <div className="space-y-1 pt-1 max-h-36 overflow-y-auto">
                  {ignoredColumnsReport.map((item, idx) => (
                    <div key={idx} className="flex items-start gap-1.5 text-[11px] text-slate-700">
                      <span className="font-mono font-semibold text-slate-900 bg-slate-100 px-1 py-0.5 rounded border border-slate-200 shrink-0">
                        {item.column}
                      </span>
                      <span className="text-slate-500">— {item.reason}</span>
                    </div>
                  ))}
                </div>
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}

      {/* Alerta de Linhas com Erros de Validação (ex: codigo_barras vazio) */}
      {rowsWithErrors.length > 0 && (
        <Alert variant="destructive" className="bg-red-50 border-red-200 text-red-900">
          <AlertTriangle className="h-4 w-4 text-red-600" />
          <AlertTitle className="text-sm font-semibold">
            {rowsWithErrors.length} linha(s) com erro de validação (código obrigatório ausente)
          </AlertTitle>
          <AlertDescription className="text-xs mt-1">
            O código de barras (coluna <code>codigo_barras</code>) é obrigatório para todos os
            produtos Tecson. Linhas com este campo vazio não serão gravadas. Verifique a aba
            &quot;Validação de Campos&quot;.
          </AlertDescription>
        </Alert>
      )}

      {isProcessing && (
        <Card className="border-emerald-300 bg-emerald-50/40">
          <CardContent className="pt-6">
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-emerald-700" />
                  <span className="font-medium text-emerald-950">
                    {processingStatus || 'Processando produtos Tecson...'}
                  </span>
                </div>
                <span className="font-mono font-bold text-emerald-800">{progress}%</span>
              </div>
              <Progress value={progress} className="h-2.5" />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Relatório de Execução quando disponível */}
      {runResult && (
        <Card className="border-emerald-200 bg-emerald-50/20">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <CardTitle className="text-lg">
                  {runResult.dry_run
                    ? 'Resultado do Teste (Sem Gravação)'
                    : 'Resultado da Importação'}
                </CardTitle>
              </div>
              <Badge className={runResult.dry_run ? 'bg-amber-600' : 'bg-emerald-600'}>
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
                <p className="text-2xl font-bold text-emerald-600">{runResult.created}</p>
              </div>
              <div className="bg-white p-3 rounded-lg border">
                <span className="text-xs text-slate-500 uppercase font-semibold">
                  Atualizados (Idempotente)
                </span>
                <p className="text-2xl font-bold text-blue-600">{runResult.updated}</p>
              </div>
              <div className="bg-white p-3 rounded-lg border">
                <span className="text-xs text-slate-500 uppercase font-semibold">
                  Ignorados/Inválidos
                </span>
                <p className="text-2xl font-bold text-slate-500">{runResult.ignored}</p>
              </div>
              <div className="bg-white p-3 rounded-lg border">
                <span className="text-xs text-slate-500 uppercase font-semibold">
                  Conflitos de Edição
                </span>
                <p className="text-2xl font-bold text-amber-600">
                  {runResult.conflicts?.length || 0}
                </p>
              </div>
            </div>

            {runResult.conflicts?.length > 0 && (
              <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs">
                <p className="font-semibold text-amber-900 mb-1">
                  Aviso de Conflitos Detectados na Reimportação:
                </p>
                <p className="text-amber-800">
                  {runResult.conflicts.length} produto(s) possuem alterações locais manuais que
                  diferem do CSV. A edição manual foi preservada com segurança.
                </p>
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
              <TabsTrigger value="preview">Prévia Mapeada ({parsedRows.length})</TabsTrigger>
              <TabsTrigger value="validation" className="relative">
                Validação de Campos
                {rowsWithErrors.length > 0 && (
                  <Badge variant="destructive" className="ml-1.5 px-1 py-0 text-[10px] h-4">
                    {rowsWithErrors.length}
                  </Badge>
                )}
              </TabsTrigger>
              {runResult && <TabsTrigger value="report">Relatório por Linha</TabsTrigger>}
            </TabsList>

            <div className="relative w-full sm:w-72">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar por nome, barras, cód..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs border rounded-md"
              />
            </div>
          </div>

          <TabsContent value="preview" className="space-y-4">
            <div className="rounded-md border bg-white overflow-x-auto max-h-[500px]">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-700 sticky top-0 border-b">
                  <tr>
                    <th className="p-2.5">#</th>
                    <th className="p-2.5">ID Tecson</th>
                    <th className="p-2.5">Código do Produto (codigo_barras)</th>
                    <th className="p-2.5">Nome do Produto</th>
                    <th className="p-2.5">Fornecedor</th>
                    <th className="p-2.5 text-right">Preço Venda</th>
                    <th className="p-2.5 text-right">Custo Unit.</th>
                    <th className="p-2.5 text-center">Saldo Inicial</th>
                    <th className="p-2.5 text-center">Imagem</th>
                    <th className="p-2.5 text-center">Validação</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredPreview.slice(0, 100).map((row) => (
                    <tr
                      key={row.index}
                      className={
                        row.validation_errors.length > 0
                          ? 'bg-red-50/60 hover:bg-red-50'
                          : 'hover:bg-slate-50/70'
                      }
                    >
                      <td className="p-2.5 text-slate-400 font-mono">{row.index}</td>
                      <td className="p-2.5 font-mono text-slate-700">{row.id_tecson || '—'}</td>
                      <td className="p-2.5 font-mono font-semibold">
                        {row.codigo_barras_tecson ? (
                          <span className="text-emerald-800 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                            {row.codigo_barras_tecson}
                          </span>
                        ) : (
                          <span className="text-red-700 font-bold bg-red-100 px-1.5 py-0.5 rounded border border-red-300">
                            (Vazio - Erro)
                          </span>
                        )}
                      </td>
                      <td
                        className="p-2.5 max-w-xs truncate font-medium text-slate-900"
                        title={row.nome_produto}
                      >
                        {row.nome_produto || '—'}
                      </td>
                      <td className="p-2.5 text-slate-600">{row.fornecedor || '—'}</td>
                      <td className="p-2.5 text-right font-semibold text-slate-800">
                        {formatCurrency(row.preco_venda)}
                      </td>
                      <td className="p-2.5 text-right text-slate-500">
                        {formatCurrency(row.custo_unitario)}
                      </td>
                      <td className="p-2.5 text-center">
                        <Badge variant="outline" className="font-mono">
                          {row.quantidade_estoques} un
                        </Badge>
                      </td>
                      <td className="p-2.5 text-center">
                        {row.image_url ? (
                          <div className="inline-flex items-center gap-1 text-emerald-600">
                            <Image className="w-3.5 h-3.5" />
                            <span className="text-[10px]">URL</span>
                          </div>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="p-2.5 text-center">
                        {row.validation_errors.length > 0 ? (
                          <Badge
                            variant="destructive"
                            className="text-[10px] bg-red-600"
                            title={row.validation_errors.join('; ')}
                          >
                            Inválido
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="text-[10px] text-emerald-700 border-emerald-300 bg-emerald-50"
                          >
                            OK
                          </Badge>
                        )}
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

          <TabsContent value="validation" className="space-y-4">
            {rowsWithErrors.length > 0 && (
              <Card className="border-red-200 bg-red-50/20">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-red-600" />
                    <CardTitle className="text-base text-red-950">
                      Linhas com Erros de Validação ({rowsWithErrors.length})
                    </CardTitle>
                  </div>
                  <CardDescription className="text-red-700">
                    Estas linhas possuem <code>codigo_barras</code> vazio e NÃO serão gravadas no
                    banco de dados.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="rounded border bg-white overflow-x-auto max-h-60">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-red-50 text-red-900 border-b">
                        <tr>
                          <th className="p-2">Linha</th>
                          <th className="p-2">ID Tecson</th>
                          <th className="p-2">Nome do Produto</th>
                          <th className="p-2">Motivo do Erro</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {rowsWithErrors.map((errRow) => (
                          <tr key={errRow.index} className="hover:bg-red-50/50">
                            <td className="p-2 font-mono text-slate-600">{errRow.index}</td>
                            <td className="p-2 font-mono">{errRow.id_tecson || '—'}</td>
                            <td className="p-2 max-w-xs truncate">{errRow.nome_produto || '—'}</td>
                            <td className="p-2 font-semibold text-red-700">
                              {errRow.validation_errors.join('; ')}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Mapeamento de Origem Tecson → Destino</CardTitle>
                <CardDescription>
                  Garantia de conversão estrita sem preenchimentos presumidos
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-xs">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="p-3 bg-emerald-50 rounded border border-emerald-200">
                    <p className="font-semibold text-emerald-950">
                      CODIGO_BARRAS → code e codigo_barras (Obrigatório)
                    </p>
                    <p className="text-emerald-800 mt-0.5">
                      Código exclusivo do produto Tecson (611 a 999984), preservando zeros à
                      esquerda conforme etiquetas físicas existentes.
                    </p>
                  </div>
                  <div className="p-3 bg-red-50 rounded border border-red-200">
                    <p className="font-semibold text-red-950">
                      COD_PRODUTO / CODIGO_PRODUTO → DESCARTADA / IGNORADA
                    </p>
                    <p className="text-red-800 mt-0.5">
                      Coluna completamente ignorada conforme regra do usuário. Não preenche nenhum
                      campo no sistema.
                    </p>
                  </div>
                  <div className="p-3 bg-slate-50 rounded border">
                    <p className="font-semibold text-slate-800">ID / id → id_tecson</p>
                    <p className="text-slate-600 mt-0.5">
                      Chave primária de reimportação idempotente.
                    </p>
                  </div>
                  <div className="p-3 bg-slate-50 rounded border">
                    <p className="font-semibold text-slate-800">
                      QUANT_EM_ESTOQUES → initial_stocks
                    </p>
                    <p className="text-slate-600 mt-0.5">
                      Registrado como Saldo Inicial (localização &apos;A definir&apos;).
                    </p>
                  </div>
                  <div className="p-3 bg-slate-50 rounded border">
                    <p className="font-semibold text-slate-800">R$_CUSTO → custo_unitario</p>
                    <p className="text-slate-600 mt-0.5">
                      Custo interno, nunca exposto em canais públicos.
                    </p>
                  </div>
                  <div className="p-3 bg-slate-50 rounded border">
                    <p className="font-semibold text-slate-800">publicar_no_ecommerce = false</p>
                    <p className="text-slate-600 mt-0.5">
                      Produtos Tecson não sobem direto no e-commerce.
                    </p>
                  </div>
                  <div className="p-3 bg-slate-50 rounded border">
                    <p className="font-semibold text-slate-800">
                      VARIACAO / variacao_resumo → variacao_resumo_bruto
                    </p>
                    <p className="text-slate-600 mt-0.5">
                      Armazenado apenas no registro bruto de auditoria, sem criar variações de
                      produto automaticamente.
                    </p>
                  </div>
                  <div className="p-3 bg-slate-50 rounded border">
                    <p className="font-semibold text-slate-800">
                      valor_venda_estoques / valor_custo_estoques → Ignoradas
                    </p>
                    <p className="text-slate-600 mt-0.5">
                      Totais calculados de estoque: ignorados por regra sem bloquear importação nem
                      criar campos.
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
                      <th className="p-2.5">Código/Barras</th>
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
                                ? 'bg-emerald-600'
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
            <div className="mx-auto w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center text-amber-700">
              <Upload className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                Selecione o arquivo CSV do Tecson
              </h3>
              <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                Aceita colunas originais do Tecson (ID_EDICAO, DATA_INCLUSAO, IMAGEM, COD_PRODUTO,
                CODIGO_BARRAS, QUANT_EM_ESTOQUES, R$_VENDA, etc).
              </p>
            </div>
            <Button
              onClick={() => fileInputRef.current?.click()}
              className="bg-amber-700 hover:bg-amber-800 text-white"
            >
              <FileSpreadsheet className="w-4 h-4 mr-2" />
              Procurar Arquivo CSV
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ========================================================
          ZONA DE LIMPEZA TOTAL DO BANCO (APENAS ADMINISTRADOR)
      ======================================================== */}
      {isAdmin && (
        <Card className="border-red-200 bg-red-50/20 shadow-xs">
          <CardHeader
            className="pb-3 cursor-pointer select-none"
            onClick={() => setIsClearSectionOpen((prev) => !prev)}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-full bg-red-100 flex items-center justify-center text-red-700">
                  <Trash2 className="h-4 w-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-base font-bold text-red-950">
                      Limpeza Total do Banco de Produtos
                    </CardTitle>
                    <Badge
                      variant="destructive"
                      className="text-[10px] uppercase font-bold tracking-wider"
                    >
                      Apenas Administrador
                    </Badge>
                  </div>
                  <CardDescription className="text-xs text-red-700 mt-0.5">
                    Apagar todos os produtos, vendas (loja e revendedoras), listas de consignação,
                    entregas, comissões/financeiro e estoques antes de importar
                  </CardDescription>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-red-800 hover:bg-red-100/60"
                onClick={(e) => {
                  e.stopPropagation()
                  setIsClearSectionOpen((prev) => !prev)
                }}
              >
                {isClearSectionOpen ? (
                  <>
                    <span className="text-xs mr-1">Recolher</span>
                    <ChevronUp className="h-4 w-4" />
                  </>
                ) : (
                  <>
                    <span className="text-xs mr-1">Expandir</span>
                    <ChevronDown className="h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
          </CardHeader>

          {isClearSectionOpen && (
            <CardContent className="space-y-4 pt-2 border-t border-red-200/60">
              {/* Aviso Crítico */}
              <Alert variant="destructive" className="bg-red-100/60 border-red-300 text-red-950">
                <AlertTriangle className="h-4 w-4 text-red-700" />
                <AlertTitle className="text-xs font-bold uppercase tracking-wider">
                  Aviso: Ação Definitiva e Irreversível
                </AlertTitle>
                <AlertDescription className="text-xs text-red-900 mt-1 space-y-1">
                  <p>
                    Esta operação excluirá <strong>permanentemente</strong> do banco de dados:
                  </p>
                  <ul className="list-disc list-inside space-y-0.5 pl-1">
                    <li>Todos os produtos cadastrados</li>
                    <li>Saldos iniciais de estoque</li>
                    <li>Vendas do PDV da loja e Vendas do PDV de revendedoras</li>
                    <li>Listas de consignação e seus contratos/documentos vinculados</li>
                    <li>Entregas/recebimentos de revendedoras (incluindo assinaturas)</li>
                    <li>Pendências financeiras, extravios e devoluções de revendedoras</li>
                    <li>Produtos em posse ou estoque de revendedoras</li>
                    <li>
                      Movimentações de estoque, histórico de preços, links de categorias e imagens
                    </li>
                  </ul>
                  <p className="pt-1 text-slate-700">
                    <strong>Preservados intactos:</strong> Usuários, cadastros auxiliares (marcas,
                    categorias, tipos, materiais, tamanhos) e configurações da empresa.
                  </p>
                  <p className="pt-1 font-semibold text-red-950">
                    Utilize esta opção quando desejar zerar tudo relacionado a produtos, vendas e
                    consignações para recomeçar a base do zero.
                  </p>
                </AlertDescription>
              </Alert>

              {/* Checkbox de Confirmação */}
              <div className="p-4 rounded-xl bg-white border border-red-200 space-y-3">
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    id="clearTecsonCheck"
                    checked={clearChecked}
                    onChange={(e) => setClearChecked(e.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-red-300 text-red-700 focus:ring-red-400"
                  />
                  <div>
                    <label
                      htmlFor="clearTecsonCheck"
                      className="font-bold text-red-950 text-xs sm:text-sm cursor-pointer block"
                    >
                      Estou ciente e confirmo que desejo apagar TODOS os produtos, vendas,
                      consignações e registros derivados
                    </label>
                    <p className="text-xs text-red-700 mt-0.5">
                      Esta ação não pode ser desfeita. Todos os dados de produtos, vendas (loja e
                      revendedoras), listas e financeiro/estoque de revendedoras serão removidos.
                    </p>
                  </div>
                </div>

                {/* Campo de frase de segurança */}
                {clearChecked && (
                  <div className="pt-3 border-t border-red-100 space-y-2">
                    <Label
                      htmlFor="safetyPhraseInput"
                      className="text-xs font-bold text-red-950 block"
                    >
                      Dupla Confirmação de Segurança:
                    </Label>
                    <p className="text-[11px] text-red-800">
                      Para evitar exclusões acidentais, digite exatamente:{' '}
                      <strong className="font-mono bg-red-50 px-1.5 py-0.5 rounded border border-red-300 text-red-900">
                        APAGAR_TUDO_DEFINITIVAMENTE
                      </strong>
                    </p>
                    <Input
                      id="safetyPhraseInput"
                      value={safetyPhrase}
                      onChange={(e) => setSafetyPhrase(e.target.value)}
                      placeholder="Digite a frase de segurança aqui..."
                      className="bg-white border-red-300 font-mono text-xs text-red-900 focus-visible:ring-red-400"
                      disabled={isClearing}
                    />

                    <div className="flex justify-end pt-2">
                      <Button
                        onClick={handleExecuteClearAll}
                        disabled={
                          isClearing || safetyPhrase.trim() !== 'APAGAR_TUDO_DEFINITIVAMENTE'
                        }
                        variant="destructive"
                        className="bg-red-700 hover:bg-red-800 text-white font-bold flex items-center gap-2 text-xs"
                      >
                        <Trash2 className="h-4 w-4" />
                        <span>
                          {isClearing
                            ? 'Apagando banco de produtos...'
                            : 'Apagar Tudo Definitivamente'}
                        </span>
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {/* Resultado da limpeza se executada nesta sessão */}
              {clearResult && (
                <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-xs space-y-3">
                  <div className="flex items-center gap-2 text-emerald-800 font-bold">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    <span>Limpeza total executada com sucesso!</span>
                  </div>
                  <p className="text-[11px] text-emerald-900">
                    Todos os produtos, vendas, listas e registros vinculados foram apagados
                    definitivamente:
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-2 pt-1 text-center">
                    <div className="bg-white p-2 rounded border border-emerald-200">
                      <span className="text-emerald-700 font-bold block text-base">
                        {clearResult.products ?? 0}
                      </span>
                      <span className="text-[10px] text-slate-500 uppercase">Produtos</span>
                    </div>
                    <div className="bg-white p-2 rounded border border-emerald-200">
                      <span className="text-emerald-700 font-bold block text-base">
                        {clearResult.sales ?? 0}
                      </span>
                      <span className="text-[10px] text-slate-500 uppercase">Vendas Loja</span>
                    </div>
                    <div className="bg-white p-2 rounded border border-emerald-200">
                      <span className="text-emerald-700 font-bold block text-base">
                        {clearResult.reseller_sales ?? 0}
                      </span>
                      <span className="text-[10px] text-slate-500 uppercase">
                        Vendas Revendedora
                      </span>
                    </div>
                    <div className="bg-white p-2 rounded border border-emerald-200">
                      <span className="text-emerald-700 font-bold block text-base">
                        {clearResult.consignment_lists ?? 0}
                      </span>
                      <span className="text-[10px] text-slate-500 uppercase">
                        Listas Consignação
                      </span>
                    </div>
                    <div className="bg-white p-2 rounded border border-emerald-200">
                      <span className="text-emerald-700 font-bold block text-base">
                        {clearResult.consignment_documents ?? 0}
                      </span>
                      <span className="text-[10px] text-slate-500 uppercase">
                        Contratos Assinados
                      </span>
                    </div>
                    <div className="bg-white p-2 rounded border border-emerald-200">
                      <span className="text-emerald-700 font-bold block text-base">
                        {clearResult.reseller_deliveries ?? 0}
                      </span>
                      <span className="text-[10px] text-slate-500 uppercase">
                        Entregas Revendedora
                      </span>
                    </div>
                    <div className="bg-white p-2 rounded border border-emerald-200">
                      <span className="text-emerald-700 font-bold block text-base">
                        {clearResult.reseller_stock_items ?? 0}
                      </span>
                      <span className="text-[10px] text-slate-500 uppercase">
                        Estoque Revendedora
                      </span>
                    </div>
                    <div className="bg-white p-2 rounded border border-emerald-200">
                      <span className="text-emerald-700 font-bold block text-base">
                        {clearResult.reseller_issues ?? 0}
                      </span>
                      <span className="text-[10px] text-slate-500 uppercase">
                        Pendências / Extravios
                      </span>
                    </div>
                    <div className="bg-white p-2 rounded border border-emerald-200">
                      <span className="text-emerald-700 font-bold block text-base">
                        {clearResult.reseller_returns ?? 0}
                      </span>
                      <span className="text-[10px] text-slate-500 uppercase">Devoluções</span>
                    </div>
                    <div className="bg-white p-2 rounded border border-emerald-200">
                      <span className="text-emerald-700 font-bold block text-base">
                        {clearResult.initial_stocks ?? 0}
                      </span>
                      <span className="text-[10px] text-slate-500 uppercase">Saldos Iniciais</span>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          )}
        </Card>
      )}
    </div>
  )
}
