import React, { useState, useRef } from 'react'
import {
  Upload,
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  FileArchive,
  Trash2,
  RefreshCw,
  ArrowRight,
  ArrowLeft,
  Info,
  Check,
  XCircle,
  HelpCircle,
  ExternalLink,
  Layers,
  Image as ImageIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import {
  decodeFileTolerant,
  parseProductsCsv,
  CsvParseResult,
  ParsedCsvProduct,
} from '@/lib/csvParser'
import { extractZipEntries, ZipExtractedFile } from '@/lib/zipExtractor'
import { productService } from '@/services/productService'
import { formatCurrency } from '@/lib/formatters'

export function ImportProductsPage() {
  // Stepper state: 1: CSV, 2: Limpeza & Importação, 3: ZIP Imagens, 4: Relatório Final
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4>(1)

  // Step 1: CSV state
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const [csvParsing, setCsvParsing] = useState(false)
  const [csvResult, setCsvResult] = useState<CsvParseResult | null>(null)

  // Step 2: Clear & Database Import state
  const [clearChecked, setClearChecked] = useState(true)
  const [safetyPhrase, setSafetyPhrase] = useState('')
  const [isProcessingImport, setIsProcessingImport] = useState(false)
  const [importProgressText, setImportProgressText] = useState('')
  const [clearResult, setClearResult] = useState<Record<string, number> | null>(null)
  const [dbImportResult, setDbImportResult] = useState<{
    imported: number
    updated: number
    skipped: number
    total_received: number
    errors: Array<{ index: number; code?: string; description?: string; error: string }>
  } | null>(null)

  // Step 3: ZIP Images state
  const [zipFiles, setZipFiles] = useState<File[]>([])
  const [isProcessingZip, setIsProcessingZip] = useState(false)
  const [zipProgress, setZipProgress] = useState<{
    phase: 'extracting' | 'uploading' | 'idle'
    loaded: number
    total: number
    currentFileName: string
  }>({ phase: 'idle', loaded: 0, total: 0, currentFileName: '' })

  const [zipStats, setZipStats] = useState<{
    matchedUploaded: number
    unmatched: number
    failedUploads: number
    totalInZip: number
  }>({ matchedUploaded: 0, unmatched: 0, failedUploads: 0, totalInZip: 0 })

  const fileInputCsvRef = useRef<HTMLInputElement>(null)
  const fileInputZipRef = useRef<HTMLInputElement>(null)

  // ==========================================
  // PASSO 1: Leitura e validação do CSV
  // ==========================================
  const handleCsvFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setCsvFile(file)
    setCsvParsing(true)
    try {
      const { text, encoding } = await decodeFileTolerant(file)
      const parsed = parseProductsCsv(text, encoding)
      setCsvResult(parsed)

      if (parsed.validProducts.length === 0) {
        toast.error('Nenhum produto válido foi identificado no arquivo CSV.')
      } else {
        toast.success(
          `${parsed.validProducts.length} produtos identificados com sucesso (${parsed.encodingUsed}).`,
        )
      }
    } catch (err: any) {
      console.error('Erro ao ler CSV:', err)
      toast.error('Falha ao processar CSV: ' + (err?.message || 'Arquivo corrompido'))
      setCsvResult(null)
    } finally {
      setCsvParsing(false)
    }
  }

  // ==========================================
  // PASSO 2: Limpeza do Banco e Importação em Lote
  // ==========================================
  const handleExecuteImport = async () => {
    if (!csvResult || csvResult.validProducts.length === 0) {
      toast.warning('É necessário primeiro selecionar um CSV com produtos válidos.')
      return
    }

    if (clearChecked && safetyPhrase.trim() !== 'APAGAR_TUDO_DEFINITIVAMENTE') {
      toast.warning(
        'Para confirmar a exclusão de todos os produtos anteriores, digite a frase de confirmação exatamente.',
      )
      return
    }

    setIsProcessingImport(true)
    setImportProgressText('Iniciando processo de importação...')

    try {
      // 1. Limpeza se solicitada
      if (clearChecked) {
        setImportProgressText('Apagando produtos e movimentações anteriores do banco de dados...')
        const clearRes = await productService.clearAllProductsAndStock(
          'APAGAR_TUDO_DEFINITIVAMENTE',
        )
        setClearResult(clearRes.deleted)
      }

      // 2. Importação em batches de 200 itens para não sobrecarregar
      const BATCH_SIZE = 200
      const totalItems = csvResult.validProducts.length
      let totalImported = 0
      let totalUpdated = 0
      let totalSkipped = 0
      const aggregatedErrors: Array<{
        index: number
        code?: string
        description?: string
        error: string
      }> = []

      for (let i = 0; i < totalItems; i += BATCH_SIZE) {
        const slice = csvResult.validProducts.slice(i, i + BATCH_SIZE)
        setImportProgressText(
          `Importando lote de produtos (${Math.min(i + BATCH_SIZE, totalItems)} de ${totalItems})...`,
        )

        const payload = slice.map((p) => ({
          code: p.code,
          description: p.description,
          quantity: p.quantity,
          selling_price: p.selling_price,
          invested_value: p.invested_value,
          image_url: p.image_url,
          import_image_path: p.import_image_path,
        }))

        const res = await productService.importProductsBatch(payload)
        totalImported += res.imported
        totalUpdated += res.updated
        totalSkipped += res.skipped
        if (res.errors && res.errors.length > 0) {
          aggregatedErrors.push(...res.errors)
        }
      }

      setDbImportResult({
        imported: totalImported,
        updated: totalUpdated,
        skipped: totalSkipped,
        total_received: totalItems,
        errors: aggregatedErrors,
      })

      toast.success(
        `Importação concluída: ${totalImported} novos produtos inseridos no banco de dados!`,
      )
      setCurrentStep(3)
    } catch (err: any) {
      console.error('Erro na importação:', err)
      toast.error(
        'Erro durante a importação: ' + (err?.message || 'Falha de comunicação com o servidor'),
      )
    } finally {
      setIsProcessingImport(false)
      setImportProgressText('')
    }
  }

  // ==========================================
  // PASSO 3: Extração de ZIP e Casamento de Imagens
  // ==========================================
  const handleZipFilesSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    const newFiles = Array.from(files).filter((f) => f.name.toLowerCase().endsWith('.zip'))
    if (newFiles.length === 0) {
      toast.warning('Por favor selecione arquivos com extensão .zip.')
      return
    }
    setZipFiles((prev) => [...prev, ...newFiles])
    toast.success(`${newFiles.length} arquivo(s) ZIP adicionado(s) à fila.`)
  }

  const handleProcessZips = async () => {
    if (zipFiles.length === 0) {
      toast.warning('Nenhum arquivo ZIP foi selecionado.')
      return
    }

    setIsProcessingZip(true)
    setZipProgress({
      phase: 'extracting',
      loaded: 0,
      total: 0,
      currentFileName: 'Lendo banco de dados...',
    })

    try {
      // 1. Obter mapa de produtos com import_image_path
      const imageMapRes = await productService.getImportImageMap()
      const productMapByPath = new Map<string, { id: string; code: string; photos: string[] }>()

      // Indexação tolerante (ex: "imagens/2974873.webp", "2974873.webp", lowercase)
      imageMapRes.items.forEach((p) => {
        if (p.import_image_path) {
          const norm = p.import_image_path.toLowerCase().replace(/\\/g, '/').trim()
          productMapByPath.set(norm, { id: p.id, code: p.code, photos: p.photos || [] })

          // Indexar também só pelo nome do arquivo (ex: "2974873.webp")
          const baseName = norm.split('/').pop() || ''
          if (baseName && !productMapByPath.has(baseName)) {
            productMapByPath.set(baseName, { id: p.id, code: p.code, photos: p.photos || [] })
          }
        }
      })

      // 2. Extrair entradas de todos os ZIPs
      const allExtractedFiles: ZipExtractedFile[] = []

      for (let z = 0; z < zipFiles.length; z++) {
        const zipFile = zipFiles[z]
        setZipProgress({
          phase: 'extracting',
          loaded: z + 1,
          total: zipFiles.length,
          currentFileName: `Extraindo ${zipFile.name}...`,
        })

        const entries = await extractZipEntries(zipFile, (loaded, total, name) => {
          setZipProgress({
            phase: 'extracting',
            loaded,
            total,
            currentFileName: `${zipFile.name}: ${name}`,
          })
        })
        allExtractedFiles.push(...entries)
      }

      // 3. Fazer upload das fotos casadas
      let matchedCount = 0
      let unmatchedCount = 0
      let failedCount = 0

      setZipProgress({
        phase: 'uploading',
        loaded: 0,
        total: allExtractedFiles.length,
        currentFileName: 'Iniciando upload e vinculação...',
      })

      for (let i = 0; i < allExtractedFiles.length; i++) {
        const item = allExtractedFiles[i]
        const cleanName = item.name.toLowerCase().replace(/\\/g, '/').trim()
        const baseName = cleanName.split('/').pop() || ''

        // Tentar casamento pela rota completa ou pelo basename
        const matchedProduct = productMapByPath.get(cleanName) || productMapByPath.get(baseName)

        setZipProgress({
          phase: 'uploading',
          loaded: i + 1,
          total: allExtractedFiles.length,
          currentFileName: item.name,
        })

        if (!matchedProduct) {
          unmatchedCount++
          continue
        }

        try {
          // Upload da foto para a coleção products via FormData
          const safeFilename = baseName || 'foto.webp'
          await productService.uploadProductPhoto(matchedProduct.id, item.blob, safeFilename)
          matchedCount++
        } catch (upErr: any) {
          console.warn(`Erro ao enviar foto para produto ${matchedProduct.code}:`, upErr?.message)
          failedCount++
        }
      }

      setZipStats((prev) => ({
        matchedUploaded: prev.matchedUploaded + matchedCount,
        unmatched: prev.unmatched + unmatchedCount,
        failedUploads: prev.failedUploads + failedCount,
        totalInZip: prev.totalInZip + allExtractedFiles.length,
      }))

      toast.success(
        `Processamento concluído: ${matchedCount} fotos vinculadas aos produtos com sucesso!`,
      )
      setCurrentStep(4)
    } catch (err: any) {
      console.error('Erro ao processar ZIPs:', err)
      toast.error('Falha no processamento do ZIP: ' + (err?.message || 'Arquivo corrompido'))
    } finally {
      setIsProcessingZip(false)
      setZipProgress({ phase: 'idle', loaded: 0, total: 0, currentFileName: '' })
    }
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* Header com badge de administrador */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E5DFD5] pb-5">
        <div>
          <div className="flex items-center gap-2">
            <Badge className="bg-[#7A5C2E] text-white hover:bg-[#634924] text-[10px] uppercase font-bold tracking-wider">
              Área Administrativa
            </Badge>
            <span className="text-xs text-[#6B655E]">Migração de Sistema Antigo</span>
          </div>
          <h1 className="font-serif text-2xl sm:text-3xl font-bold text-[#2D2A26] mt-1">
            Importação de Produtos & Estoque
          </h1>
          <p className="text-xs sm:text-sm text-[#6B655E] mt-1 max-w-2xl">
            Importe seu banco de joias a partir de arquivos CSV e pastas de fotos em ZIP. Mapeamento
            automático com respeito ao código de barras, tolerância de acentuação e fallback online.
          </p>
        </div>
      </div>

      {/* Stepper Wizard Visual */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {[
          { num: 1, title: '1. Enviar CSV', desc: 'Leitura & Preview' },
          { num: 2, title: '2. Limpeza & Banco', desc: 'Importar Registros' },
          { num: 3, title: '3. Enviar Imagens', desc: 'Upload do ZIP' },
          { num: 4, title: '4. Relatório', desc: 'Resumo Completo' },
        ].map((s) => {
          const isActive = currentStep === s.num
          const isDone = currentStep > s.num
          return (
            <div
              key={s.num}
              onClick={() => {
                // Só permite navegar para passos já liberados
                if (isDone || (s.num === 1 && !isProcessingImport && !isProcessingZip)) {
                  setCurrentStep(s.num as any)
                }
              }}
              className={`p-3.5 rounded-xl border transition-all ${
                isActive
                  ? 'border-[#7A5C2E] bg-white shadow-sm ring-2 ring-[#C6A664]/30'
                  : isDone
                    ? 'border-[#2E7D4F]/40 bg-[#2E7D4F]/5 cursor-pointer hover:bg-[#2E7D4F]/10'
                    : 'border-[#E5DFD5] bg-[#FDFBF7] opacity-60'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <div
                  className={`h-7 w-7 rounded-full flex items-center justify-center font-bold text-xs ${
                    isActive
                      ? 'bg-[#7A5C2E] text-white'
                      : isDone
                        ? 'bg-[#2E7D4F] text-white'
                        : 'bg-[#E5DFD5] text-[#6B655E]'
                  }`}
                >
                  {isDone ? <Check className="h-4 w-4" /> : s.num}
                </div>
                <div>
                  <span className="block font-serif text-xs sm:text-sm font-bold text-[#2D2A26]">
                    {s.title}
                  </span>
                  <span className="text-[10px] text-[#6B655E] block">{s.desc}</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* ========================================================
          PASSO 1: UPLOAD DO CSV E PREVIEW DAS COLUNAS E LINHAS
      ======================================================== */}
      {currentStep === 1 && (
        <div className="space-y-6">
          <Card className="border-[#E5DFD5] bg-white shadow-xs">
            <CardHeader className="pb-3">
              <CardTitle className="font-serif text-lg text-[#2D2A26] flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5 text-[#7A5C2E]" />
                Selecione o Arquivo CSV de Produtos
              </CardTitle>
              <CardDescription className="text-xs text-[#6B655E]">
                O importador lê automaticamente o separador (ponto-e-vírgula ou vírgula), detecta a
                codificação (UTF-8 ou Windows-1252/Latin-1) e mapeia as colunas necessárias.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div
                onClick={() => fileInputCsvRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
                  csvFile
                    ? 'border-[#7A5C2E] bg-[#FDFBF7]'
                    : 'border-[#E5DFD5] hover:border-[#C6A664] bg-[#FDFBF7]/50'
                }`}
              >
                <input
                  ref={fileInputCsvRef}
                  type="file"
                  accept=".csv,text/csv,text/plain"
                  className="hidden"
                  onChange={handleCsvFileSelect}
                />
                <div className="flex flex-col items-center justify-center gap-2">
                  <div className="h-12 w-12 rounded-full bg-[#F3EAD8] text-[#7A5C2E] flex items-center justify-center">
                    <Upload className="h-6 w-6" />
                  </div>
                  <div>
                    <span className="font-serif text-sm font-bold text-[#2D2A26] block">
                      {csvFile ? csvFile.name : 'Clique para selecionar o arquivo .csv'}
                    </span>
                    <span className="text-xs text-[#6B655E] block mt-0.5">
                      {csvFile
                        ? `${(csvFile.size / 1024).toFixed(1)} KB — Clique para substituir`
                        : 'Arraste ou selecione o arquivo do seu computador'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Mapeamento explicativo */}
              <div className="p-4 rounded-xl bg-[#FDFBF7] border border-[#E5DFD5] text-xs space-y-2">
                <div className="flex items-center gap-1.5 font-semibold text-[#7A5C2E]">
                  <Info className="h-4 w-4" /> Mapeamento de Colunas do Sistema Antigo:
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 text-[#2D2A26]">
                  <div className="bg-white p-2 rounded-lg border border-[#E5DFD5]">
                    <span className="text-[#6B655E] block text-[10px] uppercase">
                      Código da Joia
                    </span>
                    <strong className="text-[#7A5C2E]">codigo_barras</strong> → Mantém zeros à
                    esquerda
                  </div>
                  <div className="bg-white p-2 rounded-lg border border-[#E5DFD5]">
                    <span className="text-[#6B655E] block text-[10px] uppercase">Descrição</span>
                    <strong className="text-[#7A5C2E]">nome</strong> → Descrição completa
                  </div>
                  <div className="bg-white p-2 rounded-lg border border-[#E5DFD5]">
                    <span className="text-[#6B655E] block text-[10px] uppercase">Estoque</span>
                    <strong className="text-[#7A5C2E]">quantidade_estoques</strong> → Saldo
                    disponível
                  </div>
                  <div className="bg-white p-2 rounded-lg border border-[#E5DFD5]">
                    <span className="text-[#6B655E] block text-[10px] uppercase">Preço Venda</span>
                    <strong className="text-[#7A5C2E]">preco_venda</strong> → Formato R$ decimal
                  </div>
                  <div className="bg-white p-2 rounded-lg border border-[#E5DFD5]">
                    <span className="text-[#6B655E] block text-[10px] uppercase">
                      Custo / Investido
                    </span>
                    <strong className="text-[#7A5C2E]">preco_custo</strong> → Valor investido
                  </div>
                  <div className="bg-white p-2 rounded-lg border border-[#E5DFD5]">
                    <span className="text-[#6B655E] block text-[10px] uppercase">
                      Foto / Casamento
                    </span>
                    <strong className="text-[#7A5C2E]">arquivo_imagem / url_imagem</strong>
                  </div>
                </div>
                <p className="text-[11px] text-[#6B655E] pt-1">
                  * Colunas como <em>fornecedor, variacao, nome_produto_pai</em> e valores totais de
                  estoque são ignoradas por padrão conforme solicitado.
                </p>
              </div>

              {/* Resumo do CSV reconhecido */}
              {csvResult && (
                <div className="space-y-4 pt-2">
                  <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 bg-[#2E7D4F]/10 border border-[#2E7D4F]/30 rounded-xl text-xs">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-5 w-5 text-[#2E7D4F]" />
                      <div>
                        <span className="font-bold text-[#2E7D4F] block">
                          CSV Validado: {csvResult.validProducts.length} produtos reconhecidos
                        </span>
                        <span className="text-[#6B655E]">
                          Codificação detectada: <strong>{csvResult.encodingUsed}</strong> |
                          Delimitador:{' '}
                          <code className="bg-white px-1 py-0.2 rounded border">
                            {csvResult.detectedDelimiter === ';'
                              ? 'ponto-e-vírgula (;)'
                              : 'vírgula (,)'}
                          </code>
                        </span>
                      </div>
                    </div>

                    {csvResult.invalidRows.length > 0 && (
                      <Badge variant="outline" className="border-[#B3261E] text-[#B3261E] bg-white">
                        {csvResult.invalidRows.length} linha(s) ignorada(s)
                      </Badge>
                    )}
                  </div>

                  {/* Tabela de Preview dos 5 primeiros itens */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-serif text-xs font-bold text-[#2D2A26] uppercase tracking-wider">
                        Amostra dos Dados Reconhecidos (primeiras 5 linhas)
                      </span>
                      <span className="text-[11px] text-[#6B655E]">
                        Total de {csvResult.validProducts.length} itens prontos
                      </span>
                    </div>

                    <div className="overflow-x-auto rounded-xl border border-[#E5DFD5] bg-white shadow-xs">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead className="bg-[#F3EAD8] text-[#2D2A26] font-semibold border-b border-[#E5DFD5]">
                          <tr>
                            <th className="py-2.5 px-3">Código (Barra)</th>
                            <th className="py-2.5 px-3">Descrição (Nome)</th>
                            <th className="py-2.5 px-3 text-center">Estoque</th>
                            <th className="py-2.5 px-3 text-right">Venda</th>
                            <th className="py-2.5 px-3 text-right">Custo</th>
                            <th className="py-2.5 px-3">Arquivo Imagem</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#E5DFD5]">
                          {csvResult.validProducts.slice(0, 5).map((p, idx) => (
                            <tr key={idx} className="hover:bg-[#FDFBF7]">
                              <td className="py-2.5 px-3 font-mono font-bold text-[#7A5C2E]">
                                {p.code}
                              </td>
                              <td className="py-2.5 px-3 font-medium text-[#2D2A26]">
                                {p.description}
                              </td>
                              <td className="py-2.5 px-3 text-center font-bold">{p.quantity}</td>
                              <td className="py-2.5 px-3 text-right font-semibold text-[#2E7D4F]">
                                {formatCurrency(p.selling_price)}
                              </td>
                              <td className="py-2.5 px-3 text-right text-[#6B655E]">
                                {formatCurrency(p.invested_value)}
                              </td>
                              <td className="py-2.5 px-3 font-mono text-[11px] text-[#6B655E] truncate max-w-[150px]">
                                {p.import_image_path || (p.image_url ? 'URL Remota' : '—')}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Linhas ignoradas se houver */}
                  {csvResult.invalidRows.length > 0 && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs space-y-1">
                      <div className="flex items-center gap-1.5 font-bold text-red-700">
                        <AlertTriangle className="h-4 w-4" /> Linhas Ignoradas (sem código ou
                        descrição):
                      </div>
                      <div className="max-h-24 overflow-y-auto space-y-1">
                        {csvResult.invalidRows.map((inv, idx) => (
                          <div key={idx} className="text-red-600 font-mono text-[11px]">
                            Linha {inv.lineIndex}: {inv.reason} ({inv.rawText})
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Botão de avanço */}
                  <div className="flex justify-end pt-3">
                    <Button
                      onClick={() => setCurrentStep(2)}
                      className="bg-[#7A5C2E] hover:bg-[#634924] text-white flex items-center gap-2"
                    >
                      <span>Avançar para Limpeza & Importação</span>
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ========================================================
          PASSO 2: CONFIRMAÇÃO DE LIMPEZA & IMPORTAÇÃO EM BANCO
      ======================================================== */}
      {currentStep === 2 && (
        <div className="space-y-6">
          <Card className="border-[#B3261E]/40 bg-white shadow-xs">
            <CardHeader className="pb-3 border-b border-[#E5DFD5]">
              <CardTitle className="font-serif text-lg text-[#2D2A26] flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-[#B3261E]" />
                Confirmação de Limpeza e Gravação no Banco de Dados
              </CardTitle>
              <CardDescription className="text-xs text-[#6B655E]">
                Esta etapa gravará todos os produtos do CSV na coleção principal do sistema.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5 pt-4">
              {/* Opção de Apagar Tudo com Dupla Confirmação */}
              <div className="p-4 rounded-xl bg-red-50 border border-red-200 space-y-3">
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    id="clearCheck"
                    checked={clearChecked}
                    onChange={(e) => setClearChecked(e.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-red-300 text-[#B3261E] focus:ring-red-400"
                  />
                  <div>
                    <label
                      htmlFor="clearCheck"
                      className="font-bold text-red-900 text-sm cursor-pointer block"
                    >
                      Apagar TODOS os produtos, vendas, consignações e movimentações existentes
                      antes de importar
                    </label>
                    <p className="text-xs text-red-700 mt-0.5">
                      Você escolheu limpar o banco para começar com a nova base do sistema antigo.
                      Isto apagará produtos de teste, vendas (loja e revendedoras), listas de
                      consignação, documentos de listas, estoques em revendedoras, entregas e
                      pendências financeiras.
                    </p>
                  </div>
                </div>

                {clearChecked && (
                  <div className="pt-2 border-t border-red-200/80 space-y-1.5">
                    <Label className="text-xs font-bold text-red-900 block">
                      Dupla Confirmação de Segurança:
                    </Label>
                    <p className="text-[11px] text-red-700">
                      Para evitar exclusões acidentais, digite exatamente:{' '}
                      <strong className="font-mono bg-white px-1.5 py-0.5 rounded border border-red-300 text-red-900">
                        APAGAR_TUDO_DEFINITIVAMENTE
                      </strong>
                    </p>
                    <Input
                      value={safetyPhrase}
                      onChange={(e) => setSafetyPhrase(e.target.value)}
                      placeholder="Digite a frase de segurança aqui..."
                      className="bg-white border-red-300 font-mono text-xs text-red-900"
                    />
                  </div>
                )}
              </div>

              {/* Resumo do que será gravado */}
              <div className="p-4 rounded-xl bg-[#FDFBF7] border border-[#E5DFD5] text-xs space-y-2">
                <span className="font-semibold text-[#7A5C2E] block">Resumo da Operação:</span>
                <ul className="list-disc list-inside space-y-1 text-[#2D2A26]">
                  <li>
                    <strong>{csvResult?.validProducts.length || 0} produtos</strong> serão gravados
                    no banco de dados oficial do Scaglioni Joias.
                  </li>
                  <li>
                    O código do produto será o código de barras exato (preservando zeros à
                    esquerda).
                  </li>
                  <li>
                    Campos de classificação (tipo, material, tamanho, perfil) permanecerão vazios
                    conforme sua orientação.
                  </li>
                  <li>
                    A URL da imagem remota e o caminho do arquivo de imagem ficarão salvos para
                    casamento com o ZIP.
                  </li>
                </ul>
              </div>

              {/* Progresso de Importação */}
              {isProcessingImport && (
                <div className="space-y-2 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                  <div className="flex items-center gap-2 text-xs font-bold text-amber-900">
                    <RefreshCw className="h-4 w-4 animate-spin text-amber-700" />
                    <span>{importProgressText}</span>
                  </div>
                  <Progress value={50} className="h-2 bg-amber-200" />
                </div>
              )}

              {/* Botões de Ação */}
              <div className="flex items-center justify-between pt-3 border-t border-[#E5DFD5]">
                <Button
                  variant="outline"
                  onClick={() => setCurrentStep(1)}
                  disabled={isProcessingImport}
                  className="text-xs"
                >
                  <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Voltar ao CSV
                </Button>

                <Button
                  onClick={handleExecuteImport}
                  disabled={
                    isProcessingImport ||
                    (clearChecked && safetyPhrase.trim() !== 'APAGAR_TUDO_DEFINITIVAMENTE')
                  }
                  className="bg-[#2E7D4F] hover:bg-[#256640] text-white flex items-center gap-2 font-bold"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  <span>
                    {clearChecked
                      ? 'Confirmar Limpeza & Importar Produtos'
                      : 'Importar Produtos no Banco'}
                  </span>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ========================================================
          PASSO 3: UPLOAD DO ZIP E CASAMENTO DAS IMAGENS
      ======================================================== */}
      {currentStep === 3 && (
        <div className="space-y-6">
          <Card className="border-[#E5DFD5] bg-white shadow-xs">
            <CardHeader className="pb-3">
              <CardTitle className="font-serif text-lg text-[#2D2A26] flex items-center gap-2">
                <FileArchive className="h-5 w-5 text-[#7A5C2E]" />
                Upload das Imagens em ZIP
              </CardTitle>
              <CardDescription className="text-xs text-[#6B655E]">
                Selecione o arquivo .zip com a pasta de fotos (ex: nomes no formato{' '}
                <code>imagens/2974873.webp</code> ou <code>2974873.webp</code>). O sistema
                descompacta automaticamente no seu navegador e casa cada foto com o produto
                correspondente.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Alerta de sucesso da etapa anterior */}
              {dbImportResult && (
                <div className="p-3.5 bg-[#2E7D4F]/10 border border-[#2E7D4F]/30 rounded-xl text-xs flex items-center gap-2.5">
                  <CheckCircle2 className="h-5 w-5 text-[#2E7D4F] shrink-0" />
                  <div>
                    <strong className="text-[#2E7D4F] block">
                      {dbImportResult.imported} produtos já estão gravados no estoque!
                    </strong>
                    <span className="text-[#6B655E]">
                      Agora você pode enviar a pasta ZIP de imagens para vincular as fotos reais aos
                      produtos.
                    </span>
                  </div>
                </div>
              )}

              {/* Área de Seleção do ZIP */}
              <div
                onClick={() => fileInputZipRef.current?.click()}
                className="border-2 border-dashed border-[#E5DFD5] hover:border-[#7A5C2E] rounded-2xl p-8 text-center cursor-pointer bg-[#FDFBF7]/60 transition-all"
              >
                <input
                  ref={fileInputZipRef}
                  type="file"
                  accept=".zip,application/zip"
                  multiple
                  className="hidden"
                  onChange={handleZipFilesSelected}
                />
                <div className="flex flex-col items-center justify-center gap-2">
                  <div className="h-12 w-12 rounded-full bg-[#F3EAD8] text-[#7A5C2E] flex items-center justify-center">
                    <FileArchive className="h-6 w-6" />
                  </div>
                  <div>
                    <span className="font-serif text-sm font-bold text-[#2D2A26] block">
                      Clique para selecionar o(s) arquivo(s) .ZIP
                    </span>
                    <span className="text-xs text-[#6B655E] block mt-0.5">
                      Você pode selecionar um ou múltiplos arquivos ZIP (processamento cumulativo)
                    </span>
                  </div>
                </div>
              </div>

              {/* Lista de ZIPs selecionados */}
              {zipFiles.length > 0 && (
                <div className="space-y-2">
                  <span className="font-serif text-xs font-bold text-[#2D2A26] uppercase tracking-wider block">
                    Arquivos ZIP na Fila ({zipFiles.length})
                  </span>
                  <div className="divide-y divide-[#E5DFD5] border border-[#E5DFD5] rounded-xl overflow-hidden bg-white">
                    {zipFiles.map((zf, idx) => (
                      <div key={idx} className="p-2.5 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <FileArchive className="h-4 w-4 text-[#7A5C2E]" />
                          <span className="font-medium text-[#2D2A26]">{zf.name}</span>
                          <span className="text-[#6B655E]">
                            ({(zf.size / (1024 * 1024)).toFixed(2)} MB)
                          </span>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={isProcessingZip}
                          onClick={() => setZipFiles((prev) => prev.filter((_, i) => i !== idx))}
                          className="h-6 px-1.5 text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Barra de Progresso do ZIP */}
              {isProcessingZip && (
                <div className="space-y-2 p-4 bg-[#F3EAD8]/40 border border-[#C6A664]/50 rounded-xl">
                  <div className="flex items-center justify-between text-xs font-semibold text-[#7A5C2E]">
                    <div className="flex items-center gap-2">
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      <span>
                        {zipProgress.phase === 'extracting'
                          ? `Descompactando arquivos: ${zipProgress.currentFileName}`
                          : `Enviando e vinculando fotos (${zipProgress.loaded} de ${zipProgress.total})`}
                      </span>
                    </div>
                    <span>
                      {zipProgress.total > 0
                        ? `${Math.round((zipProgress.loaded / zipProgress.total) * 100)}%`
                        : ''}
                    </span>
                  </div>
                  <Progress
                    value={
                      zipProgress.total > 0 ? (zipProgress.loaded / zipProgress.total) * 100 : 15
                    }
                    className="h-2 bg-[#E5DFD5]"
                  />
                  <span className="text-[10px] text-[#6B655E] block font-mono truncate">
                    {zipProgress.currentFileName}
                  </span>
                </div>
              )}

              {/* Estatísticas parciais de fotos */}
              {zipStats.matchedUploaded > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div className="bg-[#2E7D4F]/10 p-2.5 rounded-lg border border-[#2E7D4F]/30 text-center">
                    <span className="text-[#2E7D4F] block font-bold text-base">
                      {zipStats.matchedUploaded}
                    </span>
                    <span className="text-[#6B655E] text-[10px] uppercase">
                      Fotos Casadas & Salvas
                    </span>
                  </div>
                  <div className="bg-[#FDFBF7] p-2.5 rounded-lg border border-[#E5DFD5] text-center">
                    <span className="text-[#2D2A26] block font-bold text-base">
                      {zipStats.totalInZip}
                    </span>
                    <span className="text-[#6B655E] text-[10px] uppercase">
                      Total de Imagens no ZIP
                    </span>
                  </div>
                  <div className="bg-amber-50 p-2.5 rounded-lg border border-amber-200 text-center">
                    <span className="text-amber-800 block font-bold text-base">
                      {zipStats.unmatched}
                    </span>
                    <span className="text-[#6B655E] text-[10px] uppercase">
                      Sem Correspondência
                    </span>
                  </div>
                  <div className="bg-neutral-50 p-2.5 rounded-lg border border-neutral-200 text-center">
                    <span className="text-neutral-700 block font-bold text-base">
                      {zipStats.failedUploads}
                    </span>
                    <span className="text-[#6B655E] text-[10px] uppercase">Falhas de Envio</span>
                  </div>
                </div>
              )}

              {/* Botões de Ação */}
              <div className="flex items-center justify-between pt-3 border-t border-[#E5DFD5]">
                <Button
                  variant="outline"
                  onClick={() => setCurrentStep(4)}
                  className="text-xs text-[#6B655E]"
                >
                  Pular Upload de Imagens (Concluir Agora)
                </Button>

                <Button
                  onClick={handleProcessZips}
                  disabled={isProcessingZip || zipFiles.length === 0}
                  className="bg-[#7A5C2E] hover:bg-[#634924] text-white flex items-center gap-2 font-bold"
                >
                  <Upload className="h-4 w-4" />
                  <span>Processar & Vincular Imagens do ZIP</span>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ========================================================
          PASSO 4: RELATÓRIO FINAL
      ======================================================== */}
      {currentStep === 4 && (
        <div className="space-y-6">
          <Card className="border-[#2E7D4F]/40 bg-white shadow-sm">
            <CardHeader className="pb-3 border-b border-[#E5DFD5] bg-[#FDFBF7]">
              <div className="flex items-center gap-2 text-[#2E7D4F]">
                <CheckCircle2 className="h-6 w-6" />
                <CardTitle className="font-serif text-xl text-[#2D2A26]">
                  Processo de Importação Concluído com Sucesso!
                </CardTitle>
              </div>
              <CardDescription className="text-xs text-[#6B655E]">
                Todos os produtos foram consolidados e já estão disponíveis no sistema.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 pt-5">
              {/* Quadro de Totais */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                <div className="p-4 rounded-xl bg-[#2E7D4F]/10 border border-[#2E7D4F]/30">
                  <span className="text-2xl font-serif font-bold text-[#2E7D4F] block">
                    {dbImportResult?.imported ?? csvResult?.validProducts.length ?? 0}
                  </span>
                  <span className="text-xs font-semibold text-[#2D2A26] uppercase tracking-wider block mt-1">
                    Produtos Importados
                  </span>
                </div>

                <div className="p-4 rounded-xl bg-[#C6A664]/10 border border-[#C6A664]/30">
                  <span className="text-2xl font-serif font-bold text-[#7A5C2E] block">
                    {zipStats.matchedUploaded}
                  </span>
                  <span className="text-xs font-semibold text-[#2D2A26] uppercase tracking-wider block mt-1">
                    Fotos do ZIP Vinculadas
                  </span>
                </div>

                <div className="p-4 rounded-xl bg-blue-50 border border-blue-200">
                  <span className="text-2xl font-serif font-bold text-blue-800 block">
                    {Math.max(
                      0,
                      (dbImportResult?.imported ?? csvResult?.validProducts.length ?? 0) -
                        zipStats.matchedUploaded,
                    )}
                  </span>
                  <span className="text-xs font-semibold text-[#2D2A26] uppercase tracking-wider block mt-1">
                    Com URL Remota ou Sem Foto
                  </span>
                </div>

                <div className="p-4 rounded-xl bg-red-50 border border-red-200">
                  <span className="text-2xl font-serif font-bold text-red-700 block">
                    {clearResult?.products ?? 0}
                  </span>
                  <span className="text-xs font-semibold text-[#2D2A26] uppercase tracking-wider block mt-1">
                    Itens Antigos Limpos
                  </span>
                </div>
              </div>

              {/* Informações de Onde Ver os Produtos */}
              <div className="p-4 rounded-xl bg-[#FDFBF7] border border-[#E5DFD5] space-y-3">
                <span className="font-serif text-sm font-bold text-[#2D2A26] block">
                  O que acontece agora?
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div className="bg-white p-3 rounded-lg border border-[#E5DFD5]">
                    <strong className="text-[#7A5C2E] block mb-1">Estoque da Loja</strong>
                    Veja todas as peças importadas com saldo, código de barras e edição rápida de
                    preços e quantidades.
                  </div>
                  <div className="bg-white p-3 rounded-lg border border-[#E5DFD5]">
                    <strong className="text-[#7A5C2E] block mb-1">Vitrine & Catálogo</strong>
                    As fotos vinculadas pelo ZIP já aparecem nas miniaturas e no visualizador em
                    tela cheia (Lightbox).
                  </div>
                  <div className="bg-white p-3 rounded-lg border border-[#E5DFD5]">
                    <strong className="text-[#7A5C2E] block mb-1">PDV & Vendas Rápidas</strong>
                    Você já pode buscar pelo código de barras ou nome do produto para realizar
                    vendas imediatas.
                  </div>
                </div>
              </div>

              {/* Ações Finais */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-[#E5DFD5]">
                <Button
                  variant="outline"
                  onClick={() => {
                    setCurrentStep(1)
                    setCsvFile(null)
                    setCsvResult(null)
                    setZipFiles([])
                    setSafetyPhrase('')
                  }}
                  className="text-xs"
                >
                  <RefreshCw className="h-3.5 w-3.5 mr-1" /> Realizar Nova Importação
                </Button>

                <div className="flex items-center gap-2">
                  <Button
                    onClick={() => (window.location.href = '/estoque')}
                    className="bg-[#7A5C2E] hover:bg-[#634924] text-white flex items-center gap-1.5 font-bold"
                  >
                    <span>Ir para o Estoque</span>
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
export default ImportProductsPage
