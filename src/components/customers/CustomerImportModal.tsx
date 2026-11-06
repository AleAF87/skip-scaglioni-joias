import React, { useRef, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Loader2, Upload, FileSpreadsheet, CheckCircle2, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import {
  CustomerImportRow,
  ImportSummary,
  importCustomers,
  isExcludedStatus,
  parseCustomerSpreadsheet,
} from '@/services/customerImportService'

interface CustomerImportModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onImported: () => void
}

const PREVIEW_LIMIT = 8

export function CustomerImportModal({ open, onOpenChange, onImported }: CustomerImportModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [rows, setRows] = useState<CustomerImportRow[]>([])
  const [parsing, setParsing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [summary, setSummary] = useState<ImportSummary | null>(null)

  const reset = () => {
    setFile(null)
    setRows([])
    setSummary(null)
    setProgress({ done: 0, total: 0 })
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleClose = (next: boolean) => {
    if (!next && importing) return
    onOpenChange(next)
    if (!next) reset()
  }

  const handleFile = async (f: File | undefined) => {
    if (!f) return
    if (!/\.(xlsx|xls|csv)$/i.test(f.name)) {
      toast.error('Envie um arquivo .xlsx ou .csv.')
      return
    }
    setParsing(true)
    setSummary(null)
    try {
      const parsed = await parseCustomerSpreadsheet(f)
      if (parsed.length === 0) {
        toast.error('Nenhuma linha encontrada na planilha.')
        setFile(null)
        setRows([])
        return
      }
      setFile(f)
      setRows(parsed)
    } catch (err) {
      console.error('Erro ao ler a planilha:', err)
      toast.error('Não foi possível ler a planilha. Verifique o formato (.xlsx ou .csv).')
      setFile(null)
      setRows([])
    } finally {
      setParsing(false)
    }
  }

  const handleImport = async () => {
    if (rows.length === 0) return
    setImporting(true)
    setSummary(null)
    try {
      const result = await importCustomers(rows, (done, total) => setProgress({ done, total }))
      setSummary(result)
      onImported()
      if (result.imported > 0) {
        toast.success(`${result.imported} cliente(s) importado(s) com sucesso.`)
      } else {
        toast.info('Nenhum cliente novo importado (todos pulados como duplicados ou EXCLUÍDO).')
      }
    } catch (err: any) {
      console.error('Erro na importação:', err)
      toast.error(err?.message || 'Falha na importação da planilha.')
    } finally {
      setImporting(false)
    }
  }

  const statusLabel = (row: CustomerImportRow) => {
    if (!row.name) return { text: 'Sem nome', cls: 'bg-[#F8F5F0] text-[#6B655E] border-[#E5DFD5]' }
    if (isExcludedStatus(row.data.status))
      return {
        text: 'EXCLUÍDO — será pulado',
        cls: 'bg-[#B3261E]/10 text-[#B3261E] border-[#B3261E]/30',
      }
    return { text: 'Pronto p/ importar', cls: 'bg-[#C6A664]/15 text-[#7A5C2E] border-[#C6A664]/40' }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto bg-white p-6">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-lg bg-[#C6A664]/20 text-[#7A5C2E]">
              <FileSpreadsheet className="h-5 w-5" />
            </span>
            <div>
              <DialogTitle className="font-serif text-xl text-[#2D2A26]">
                Importar planilha de clientes
              </DialogTitle>
              <DialogDescription className="text-xs text-[#6B655E] mt-0.5">
                Envie um arquivo .xlsx ou .csv. Linhas com STATUS “EXCLUÍDO” e duplicados (mesmo
                CPF, ou nome+telefone quando sem CPF) são pulados automaticamente.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />

        <div className="space-y-4">
          {/* Seleção de arquivo */}
          <div
            className="border-2 border-dashed border-[#E5DFD5] rounded-lg p-6 text-center bg-[#FDFBF7] cursor-pointer hover:bg-[#F8F5F0] transition-colors"
            onClick={() => !importing && fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              if (!importing) handleFile(e.dataTransfer.files?.[0])
            }}
          >
            {parsing ? (
              <Loader2 className="h-6 w-6 animate-spin mx-auto text-[#C6A664]" />
            ) : (
              <Upload className="h-6 w-6 mx-auto text-[#C6A664]" />
            )}
            <p className="text-xs text-[#2D2A26] font-medium mt-2">
              {file ? file.name : 'Clique ou arraste a planilha aqui'}
            </p>
            <p className="text-[11px] text-[#6B655E] mt-0.5">Formatos aceitos: .xlsx, .xls, .csv</p>
          </div>

          {/* Prévia */}
          {rows.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-[#2D2A26]">
                Prévia — {rows.length} linha{rows.length === 1 ? '' : 's'} encontrada
                {rows.length === 1 ? '' : 's'}:
              </p>
              <div className="overflow-x-auto border border-[#E5DFD5] rounded-lg">
                <table className="w-full text-left text-[11px]">
                  <thead className="bg-[#F8F5F0] text-[#6B655E] border-b border-[#E5DFD5]">
                    <tr>
                      <th className="py-2 px-3 font-semibold">Linha</th>
                      <th className="py-2 px-3 font-semibold">Nome</th>
                      <th className="py-2 px-3 font-semibold">CPF</th>
                      <th className="py-2 px-3 font-semibold">Telefone</th>
                      <th className="py-2 px-3 font-semibold">E-mail (compras)</th>
                      <th className="py-2 px-3 font-semibold">Status</th>
                      <th className="py-2 px-3 font-semibold">Situação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E5DFD5]">
                    {rows.slice(0, PREVIEW_LIMIT).map((row) => {
                      const st = statusLabel(row)
                      return (
                        <tr key={row.line}>
                          <td className="py-1.5 px-3 font-mono text-[#6B655E]">{row.line}</td>
                          <td className="py-1.5 px-3 text-[#2D2A26] font-medium">
                            {row.name || '—'}
                          </td>
                          <td className="py-1.5 px-3 font-mono text-[#2D2A26]">
                            {row.data.cpf || '—'}
                          </td>
                          <td className="py-1.5 px-3 text-[#2D2A26]">{row.data.phone || '—'}</td>
                          <td className="py-1.5 px-3 text-[#2D2A26]">
                            {row.data.contact_purchases_email || '—'}
                          </td>
                          <td className="py-1.5 px-3 text-[#6B655E]">{row.data.status || '—'}</td>
                          <td className="py-1.5 px-3">
                            <span
                              className={`inline-block px-2 py-0.5 rounded-full border text-[10px] font-semibold ${st.cls}`}
                            >
                              {st.text}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              {rows.length > PREVIEW_LIMIT && (
                <p className="text-[11px] text-[#6B655E]">
                  Mostrando as primeiras {PREVIEW_LIMIT} linhas de {rows.length}.
                </p>
              )}

              <Button
                onClick={handleImport}
                disabled={importing}
                className="bg-gradient-to-r from-[#7A5C2E] to-[#C6A664] hover:opacity-90 text-white font-semibold text-xs"
              >
                {importing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Importando{' '}
                    {progress.total > 0 ? `${progress.done}/${progress.total}` : ''}...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" /> Importar {rows.length} cliente
                    {rows.length === 1 ? '' : 's'}
                  </>
                )}
              </Button>
            </div>
          )}

          {/* Resumo final */}
          {summary && (
            <div className="bg-[#FDFBF7] border border-[#E5DFD5] rounded-lg p-4 space-y-2">
              <p className="text-xs font-bold text-[#2D2A26] flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-[#7A5C2E]" /> Resumo da importação
              </p>
              <ul className="text-xs text-[#2D2A26] space-y-1">
                <li>
                  <strong className="text-[#7A5C2E]">{summary.imported}</strong> cliente(s)
                  importado(s)
                </li>
                <li>
                  <strong className="text-[#C6A664]">{summary.skippedDuplicate}</strong> pulado(s)
                  por duplicidade (mesmo CPF, ou nome+telefone iguais)
                </li>
                <li>
                  <strong className="text-[#B3261E]">{summary.skippedExcluded}</strong> pulado(s)
                  por STATUS “EXCLUÍDO”
                </li>
                {summary.failed > 0 && (
                  <li className="flex items-start gap-1.5 text-[#B3261E]">
                    <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <span>
                      <strong>{summary.failed}</strong> com erro:{' '}
                      {summary.failedNames.slice(0, 5).join('; ')}
                      {summary.failedNames.length > 5 ? '…' : ''}
                    </span>
                  </li>
                )}
              </ul>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
