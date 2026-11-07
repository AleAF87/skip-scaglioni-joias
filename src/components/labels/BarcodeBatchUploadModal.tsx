import React, { useState, useMemo, useRef } from 'react'
import {
  Upload,
  FileText,
  AlertTriangle,
  CheckCircle2,
  X,
  FileUp,
  ClipboardPaste,
  HelpCircle,
} from 'lucide-react'
import { Product } from '@/types'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { parseRawCodeInput, matchCodesWithProducts, MatchResult } from '@/lib/barcodeBatchMatcher'
import { getProductDisplayPhoto } from '@/lib/formatters'

interface BarcodeBatchUploadModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  products: Product[]
  onApplySelection: (matchedIds: string[], result: MatchResult) => void
}

export const BarcodeBatchUploadModal: React.FC<BarcodeBatchUploadModalProps> = ({
  open,
  onOpenChange,
  products,
  onApplySelection,
}) => {
  const [activeTab, setActiveTab] = useState<'upload' | 'paste'>('upload')
  const [pastedText, setPastedText] = useState('')
  const [fileName, setFileName] = useState<string | null>(null)
  const [fileContent, setFileContent] = useState<string>('')
  const [fileError, setFileError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Texto bruto a processar de acordo com a aba ativa
  const rawText = activeTab === 'upload' ? fileContent : pastedText

  // Extrai lista única de códigos informados
  const parsedCodes = useMemo(() => {
    return parseRawCodeInput(rawText)
  }, [rawText])

  // Realiza o cruzamento com os produtos cadastrados
  const matchResult = useMemo(() => {
    if (parsedCodes.length === 0) return null
    return matchCodesWithProducts(parsedCodes, products)
  }, [parsedCodes, products])

  // Handler de leitura do arquivo no navegador
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    setFileError(null)
    if (!file) return

    const ext = file.name.split('.').pop()?.toLowerCase()
    if (!['csv', 'txt'].includes(ext || '')) {
      setFileError('Selecione um arquivo .csv ou .txt.')
      return
    }

    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = (event) => {
      const content = event.target?.result as string
      setFileContent(content || '')
    }
    reader.onerror = () => {
      setFileError('Erro ao ler o arquivo no computador.')
    }
    reader.readAsText(file)
  }

  const handleClearFile = () => {
    setFileName(null)
    setFileContent('')
    setFileError(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleClearPasted = () => {
    setPastedText('')
  }

  const handleApply = () => {
    if (!matchResult) return
    onApplySelection(matchResult.matchedIds, matchResult)
    onOpenChange(false)
  }

  const handleClose = () => {
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden bg-white border-[#E5DFD5]">
        <DialogHeader className="p-5 pb-3 border-b border-[#E5DFD5] bg-[#FDFBF7]">
          <DialogTitle className="font-serif text-xl font-bold text-[#2D2A26] flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-[#C6A664]/20 text-[#7A5C2E]">
              <Upload className="h-5 w-5" />
            </span>
            Carregar Lista de Códigos para Seleção
          </DialogTitle>
          <DialogDescription className="text-xs text-[#6B655E] mt-1">
            Envie uma planilha CSV/TXT ou cole a lista de códigos de barras para marcar
            automaticamente as peças na folha de impressão de etiquetas.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <Tabs
            value={activeTab}
            onValueChange={(val) => setActiveTab(val as 'upload' | 'paste')}
            className="w-full"
          >
            <TabsList className="grid w-full grid-cols-2 bg-[#F3EAD8]/60 p-1">
              <TabsTrigger
                value="upload"
                className="text-xs font-semibold data-[state=active]:bg-white data-[state=active]:text-[#7A5C2E] data-[state=active]:shadow-xs"
              >
                <FileUp className="h-3.5 w-3.5 mr-1.5" />
                Upload de Arquivo (.csv ou .txt)
              </TabsTrigger>
              <TabsTrigger
                value="paste"
                className="text-xs font-semibold data-[state=active]:bg-white data-[state=active]:text-[#7A5C2E] data-[state=active]:shadow-xs"
              >
                <ClipboardPaste className="h-3.5 w-3.5 mr-1.5" />
                Colar Texto / Códigos
              </TabsTrigger>
            </TabsList>

            {/* TAB UPLOAD */}
            <TabsContent value="upload" className="pt-3 space-y-3">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.txt"
                onChange={handleFileUpload}
                className="hidden"
              />

              {!fileName ? (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-[#C6A664]/60 hover:border-[#7A5C2E] rounded-xl p-8 text-center cursor-pointer bg-[#FDFBF7] hover:bg-[#F8F3EA] transition-colors"
                >
                  <FileUp className="h-10 w-10 mx-auto text-[#7A5C2E] mb-2" />
                  <p className="font-semibold text-sm text-[#2D2A26]">
                    Clique aqui para selecionar o arquivo do seu computador
                  </p>
                  <p className="text-xs text-[#6B655E] mt-1">
                    Formatos aceitos: <strong>.csv</strong> ou <strong>.txt</strong> (ex.:
                    exportações com coluna{' '}
                    <code className="font-mono bg-white px-1 rounded">codigo_lido</code> ou lista
                    simples).
                  </p>
                </div>
              ) : (
                <div className="flex items-center justify-between p-3.5 rounded-xl border border-[#C6A664] bg-[#FDFBF7]">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <FileText className="h-5 w-5 text-[#7A5C2E] shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-[#2D2A26] truncate">{fileName}</p>
                      <p className="text-[11px] text-[#6B655E]">
                        {parsedCodes.length} código(s) extraído(s) do arquivo
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      className="h-8 text-xs border-[#E5DFD5]"
                    >
                      Trocar arquivo
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleClearFile}
                      className="h-8 w-8 p-0 text-[#B3261E] hover:bg-[#B3261E]/10"
                      title="Remover arquivo"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}

              {fileError && (
                <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-red-600" />
                  <span>{fileError}</span>
                </div>
              )}
            </TabsContent>

            {/* TAB COLAR */}
            <TabsContent value="paste" className="pt-3 space-y-2">
              <div className="flex items-center justify-between text-xs text-[#6B655E]">
                <span>Cole os códigos abaixo (um por linha, ou separados por vírgula):</span>
                {pastedText && (
                  <button
                    type="button"
                    onClick={handleClearPasted}
                    className="text-[#B3261E] hover:underline"
                  >
                    Limpar
                  </button>
                )}
              </div>
              <Textarea
                value={pastedText}
                onChange={(e) => setPastedText(e.target.value)}
                placeholder="Exemplo:&#10;776981 PRATA 19&#10;525176 Prata 26&#10;791793&#10;631587"
                rows={6}
                className="font-mono text-xs border-[#E5DFD5] focus-visible:ring-[#C6A664]"
              />
              <p className="text-[11px] text-[#6B655E] flex items-center gap-1">
                <HelpCircle className="h-3.5 w-3.5 text-[#7A5C2E]" />
                Espaços extras no início/fim e diferenças entre maiúsculas/minúsculas são ignorados
                automaticamente.
              </p>
            </TabsContent>
          </Tabs>

          {/* PAINEL DE RESULTADO / PRÉVIA DO MATCH */}
          {matchResult && (
            <div className="space-y-3 pt-2 border-t border-[#E5DFD5]">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-3 rounded-lg border border-[#2E7D4F]/30 bg-[#2E7D4F]/5 flex items-start gap-2.5">
                  <CheckCircle2 className="h-4 w-4 text-[#2E7D4F] shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-[#2E7D4F] block">
                      {matchResult.matchedCount} produto(s) correspondente(s)
                    </span>
                    <span className="text-[#2D2A26] text-[11px]">
                      Encontrados na base de produtos cadastrados.
                    </span>
                  </div>
                </div>

                <div
                  className={`p-3 rounded-lg border flex items-start gap-2.5 ${
                    matchResult.unmatchedCount > 0
                      ? 'border-amber-300 bg-amber-50 text-amber-900'
                      : 'border-[#E5DFD5] bg-[#FDFBF7] text-[#6B655E]'
                  }`}
                >
                  <AlertTriangle
                    className={`h-4 w-4 shrink-0 mt-0.5 ${
                      matchResult.unmatchedCount > 0 ? 'text-amber-600' : 'text-[#6B655E]'
                    }`}
                  />
                  <div>
                    <span className="font-bold block">
                      {matchResult.unmatchedCount} código(s) sem correspondência
                    </span>
                    <span className="text-[11px]">
                      {matchResult.unmatchedCount > 0
                        ? 'Não encontrados entre os produtos cadastrados.'
                        : 'Todos os códigos da lista foram localizados.'}
                    </span>
                  </div>
                </div>
              </div>

              {/* LISTA DE NÃO CORRESPONDIDOS COM AVISO */}
              {matchResult.unmatchedCount > 0 && (
                <div className="p-3 rounded-lg border border-amber-200 bg-amber-50/70 text-xs space-y-2">
                  <div className="flex items-center justify-between font-semibold text-amber-900">
                    <span className="flex items-center gap-1.5">
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                      Códigos da lista que não estão no cadastro ({matchResult.unmatchedCount})
                    </span>
                    <span className="text-[11px] font-normal text-amber-700">
                      Você pode prosseguir normalmente com os correspondentes.
                    </span>
                  </div>
                  <div className="max-h-24 overflow-y-auto flex flex-wrap gap-1 p-2 bg-white rounded border border-amber-200 font-mono text-[11px]">
                    {matchResult.unmatchedCodes.slice(0, 30).map((code, idx) => (
                      <Badge
                        key={idx}
                        variant="outline"
                        className="border-amber-300 bg-amber-50 text-amber-900 text-[10px]"
                      >
                        {code}
                      </Badge>
                    ))}
                    {matchResult.unmatchedCodes.length > 30 && (
                      <span className="text-[10px] text-amber-700 self-center">
                        +{matchResult.unmatchedCodes.length - 30} outros...
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* AMOSTRA DE PRODUTOS CORRESPONDENTES */}
              {matchResult.matchedCount > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-[#2D2A26]">
                    Prévia dos produtos que serão selecionados ({matchResult.matchedCount}):
                  </p>
                  <div className="max-h-36 overflow-y-auto divide-y divide-[#E5DFD5] border border-[#E5DFD5] rounded-lg bg-white">
                    {matchResult.matchedProducts.slice(0, 8).map((p) => {
                      const photo = getProductDisplayPhoto(p)
                      return (
                        <div
                          key={p.id}
                          className="p-2 px-3 flex items-center justify-between text-xs"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            {photo ? (
                              <img
                                src={photo}
                                alt=""
                                className="h-6 w-6 rounded object-cover border border-[#E5DFD5] shrink-0"
                              />
                            ) : (
                              <div className="h-6 w-6 rounded bg-[#F3EAD8] text-[9px] font-bold text-[#7A5C2E] flex items-center justify-center shrink-0">
                                J
                              </div>
                            )}
                            <span className="font-semibold text-[#2D2A26] truncate">
                              {p.nome_produto || p.description}
                            </span>
                          </div>
                          <span className="font-mono font-bold text-[#7A5C2E] shrink-0 text-[11px]">
                            {p.code}
                          </span>
                        </div>
                      )
                    })}
                    {matchResult.matchedCount > 8 && (
                      <div className="p-2 text-center text-[11px] text-[#6B655E] bg-[#FDFBF7]">
                        +{matchResult.matchedCount - 8} outros produtos selecionados...
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="p-4 border-t border-[#E5DFD5] bg-[#FDFBF7] flex sm:justify-between items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleClose}
            className="text-[#6B655E] hover:bg-[#E5DFD5]"
          >
            Cancelar
          </Button>

          <Button
            type="button"
            onClick={handleApply}
            disabled={!matchResult || matchResult.matchedCount === 0}
            className="bg-[#7A5C2E] hover:bg-[#634924] text-white font-semibold text-xs h-9 px-4 shadow-xs"
          >
            <CheckCircle2 className="h-4 w-4 mr-1.5" />
            Aplicar Seleção ({matchResult?.matchedCount ?? 0} produtos)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
