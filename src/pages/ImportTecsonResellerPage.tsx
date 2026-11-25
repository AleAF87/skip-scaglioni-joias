import React, { useCallback, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import pb from '@/lib/pocketbase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { normalizeBarcode, isValidBarcode, auditBarcode } from '@/lib/barcode'
import { cn } from '@/lib/utils'
import type { Reseller } from '@/types'

interface ParsedRow {
  line: number
  barcode: string // valor original do CSV
  description: string
  quantity: number
  selling_price?: number
}

interface GroupedRow {
  key: string // código de barras normalizado
  barcode: string // valor original (auditoria)
  description: string
  quantity: number
  selling_price?: number
  lines: number[]
}

interface ExistingMatch {
  id: string
  description: string
  fisico: number
  posseAtual: number
  preco: number
}

interface PreviewRow extends GroupedRow {
  status: 'existing' | 'new' | 'invalid' | 'conflict'
  existing?: ExistingMatch
  reason?: string
}

interface ImportResult {
  products_updated: number
  products_created: number
  stock_items_created: number
  stock_items_updated: number
  maleta_id?: string
  maleta_code?: string
  skipped: Array<{ line: number; barcode: string; reason: string }>
}

function parseNumberBr(v: string): number {
  if (!v) return 0
  const cleaned = String(v).trim().replace(/\s/g, '').replace(/\./g, '').replace(',', '.')
  const n = parseFloat(cleaned)
  return isNaN(n) ? 0 : n
}

function parseCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if ((ch === ';' || ch === ',') && !inQuotes) {
      out.push(cur)
      cur = ''
    } else {
      cur += ch
    }
  }
  out.push(cur)
  return out
}

function decodeFileTolerant(buf: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf)
  } catch (_) {
    return new TextDecoder('iso-8859-1').decode(buf)
  }
}

const HEADER_ALIASES: Record<string, string> = {
  codigo_barras: 'barcode',
  codigobarras: 'barcode',
  ean: 'barcode',
  ean13: 'barcode',
  gtin: 'barcode',
  descricao: 'description',
  produto: 'description',
  nome_produto: 'description',
  quantidade: 'quantity',
  qtde: 'quantity',
  qtd: 'quantity',
  estoque: 'quantity',
  preco: 'selling_price',
  preco_venda: 'selling_price',
  preco_unitario: 'selling_price',
}

function normalizeHeaderKey(h: string): string {
  return h
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
}

export default function ImportTecsonResellerPage() {
  const [csvText, setCsvText] = useState('')
  const [fileName, setFileName] = useState('')
  const [rows, setRows] = useState<ParsedRow[]>([])
  const [resellers, setResellers] = useState<Reseller[]>([])
  const [resellerId, setResellerId] = useState('')
  const [newResellerName, setNewResellerName] = useState('')
  const [newResellerEmail, setNewResellerEmail] = useState('')
  const [createMode, setCreateMode] = useState(false)
  const [preview, setPreview] = useState<PreviewRow[] | null>(null)
  const [committing, setCommitting] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    let alive = true
    pb.collection('resellers')
      .getFullList<Reseller>({ sort: 'name', filter: "status = 'active'" })
      .then((list) => {
        if (alive) setResellers(list)
      })
      .catch(() => toast.error('Falha ao carregar revendedoras.'))
    return () => {
      alive = false
    }
  }, [])

  const handleFile = useCallback(async (file: File) => {
    const buf = await file.arrayBuffer()
    const text = decodeFileTolerant(buf)
    setCsvText(text)
    setFileName(file.name)
    setResult(null)
    setPreview(null)

    const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '')
    if (lines.length < 2) {
      toast.error('CSV sem linhas de dados.')
      setRows([])
      return
    }
    // Header: detecta separador na primeira linha
    const headerLine = lines[0]
    const sep =
      (headerLine.match(/;/g) || []).length > (headerLine.match(/,/g) || []).length ? ';' : ','
    const headers = parseCsvLine(headerLine).map(normalizeHeaderKey)
    const colMap: Record<string, number> = {}
    headers.forEach((h, idx) => {
      const alias = HEADER_ALIASES[h]
      if (alias && colMap[alias] === undefined) colMap[alias] = idx
    })
    if (colMap['barcode'] === undefined) {
      toast.error('Coluna de código de barras não encontrada. Use: CODIGO_BARRAS (ou EAN/GTIN).')
      setRows([])
      return
    }
    if (colMap['quantity'] === undefined) {
      toast.error('Coluna de quantidade não encontrada. Use: QUANTIDADE (ou QTDE/ESTOQUE).')
      setRows([])
      return
    }

    const parsed: ParsedRow[] = []
    for (let i = 1; i < lines.length; i++) {
      const cells = parseCsvLine(lines[i])
      const barcode = (cells[colMap['barcode']] || '').trim()
      const description = (cells[colMap['description']] || '').trim()
      const quantity = parseInt(cells[colMap['quantity']] || '0', 10) || 0
      const selling_price =
        colMap['selling_price'] !== undefined
          ? parseNumberBr(cells[colMap['selling_price']])
          : undefined
      parsed.push({ line: i + 1, barcode, description, quantity, selling_price })
    }
    setRows(parsed)
  }, [])

  // Agrupamento por código de barras normalizado (mesmo código repetido soma).
  const grouped = useMemo<GroupedRow[]>(() => {
    const map = new Map<string, GroupedRow>()
    rows.forEach((r) => {
      const key = normalizeBarcode(r.barcode)
      if (!map.has(key)) {
        map.set(key, {
          key,
          barcode: auditBarcode(r.barcode),
          description: r.description,
          quantity: r.quantity,
          selling_price: r.selling_price,
          lines: [r.line],
        })
      } else {
        const g = map.get(key)!
        g.quantity += r.quantity
        g.lines.push(r.line)
        if (!g.description && r.description) g.description = r.description
      }
    })
    return Array.from(map.values())
  }, [rows])

  const buildPreview = useCallback(
    async (targetResellerId: string) => {
      // Busca produtos + posses atuais da revendedora para classificar cada linha
      const previewRows: PreviewRow[] = []
      // Códigos agrupados
      const byKey = new Map(grouped.map((g) => [g.key, g]))
      const keys = Array.from(byKey.keys()).filter((k) => k !== '')
      // Busca produtos por código de barras (por dígito, em memória, via getFullList
      // paginado — o volume de produtos é de poucos milhares)
      const products = await pb.collection('products').getFullList<any>({
        filter: "codigo_barras != ''",
        fields: 'id,description,quantity,codigo_barras,selling_price',
      })
      const byBarcode = new Map<string, any>()
      products.forEach((p) => {
        const k = normalizeBarcode(p.codigo_barras)
        if (byBarcode.has(k)) {
          byBarcode.set(k, { conflict: true, first: byBarcode.get(k), second: p })
        } else {
          byBarcode.set(k, p)
        }
      })
      const stockItems = await pb
        .collection('reseller_stock_items')
        .getFullList<any>({ filter: `reseller = '${targetResellerId}'` })
      const posseByProduct = new Map<string, number>()
      stockItems.forEach((s) => {
        posseByProduct.set(s.product, (posseByProduct.get(s.product) || 0) + (s.quantity || 0))
      })

      for (const g of grouped) {
        if (!isValidBarcode(g.barcode)) {
          previewRows.push({
            ...g,
            status: 'invalid',
            reason: 'Código de barras inválido (menos de 8 dígitos úteis ou repetido).',
          })
          continue
        }
        const found = byBarcode.get(g.key)
        if (found && found.conflict) {
          previewRows.push({
            ...g,
            status: 'conflict',
            reason: 'Mais de um produto cadastrado com este código de barras.',
          })
          continue
        }
        if (found) {
          previewRows.push({
            ...g,
            status: 'existing',
            existing: {
              id: found.id,
              description: found.description || '',
              fisico: found.quantity || 0,
              posseAtual: posseByProduct.get(found.id) || 0,
              preco: found.selling_price || 0,
            },
          })
        } else {
          previewRows.push({ ...g, status: 'new' })
        }
      }
      return previewRows
    },
    [grouped],
  )

  const handlePreview = useCallback(async () => {
    if (rows.length === 0) {
      toast.error('Selecione um CSV primeiro.')
      return
    }
    if (!resellerId && !createMode) {
      toast.error('Selecione ou cadastre a revendedora.')
      return
    }
    try {
      const p = await buildPreview(resellerId)
      setPreview(p)
      // Validação server-side extra (dry_run) — opcional, silenciosa.
      try {
        const targetId = resellerId || 'new'
        if (targetId !== 'new') {
          await pb.send('/backend/v1/tecson/reseller-import', {
            method: 'POST',
            body: JSON.stringify({
              reseller_id: targetId,
              rows: rows.map((r) => ({
                line: r.line,
                barcode: r.barcode,
                description: r.description,
                quantity: r.quantity,
                selling_price: r.selling_price,
              })),
              dry_run: true,
            }),
          })
        }
      } catch (_) {
        /* falha silenciosa — preview client-side é suficiente */
      }
      toast.success('Prévia gerada. Revise e confirme.')
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao gerar prévia.')
    }
  }, [rows, resellerId, createMode, buildPreview])

  const handleCreateReseller = useCallback(async () => {
    // Localizar por nome normalizado; se não existir, cadastrar com acesso pendente
    const name = newResellerName.trim()
    if (!name) {
      toast.error('Informe o nome da revendedora.')
      return
    }
    const norm = (s: string) =>
      s
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
    try {
      const all = await pb.collection('resellers').getFullList<Reseller>({})
      const found = all.find((r) => norm(r.name) === norm(name))
      if (found) {
        setResellerId(found.id)
        setCreateMode(false)
        toast.info(`Revendedora existente encontrada: ${found.name}`)
        return
      }
      const email =
        newResellerEmail.trim() || `migracao.${norm(name).replace(/\s+/g, '.')}@tecson.local`
      const rec = await pb.collection('resellers').create<Reseller>({
        name,
        email,
        status: 'pending', // acesso pendente, sem usuário fictício
      })
      setResellers((prev) => [...prev, rec])
      setResellerId(rec.id)
      setCreateMode(false)
      toast.success(`Revendedora criada (acesso pendente): ${rec.name}`)
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao localizar/cadastrar revendedora.')
    }
  }, [newResellerName, newResellerEmail])

  const handleConfirm = useCallback(async () => {
    if (!preview || !resellerId) return
    const importable = preview.filter((p) => p.status === 'existing' || p.status === 'new')
    if (importable.length === 0) {
      toast.error('Nada importável (todas as linhas inválidas ou em conflito).')
      return
    }
    const confirmed = window.confirm(
      `Confirmar importação de ${importable.length} código(s) para a revendedora selecionada?\n` +
        `Esta operação é tudo-ou-nada.`,
    )
    if (!confirmed) return
    setCommitting(true)
    try {
      const res = await pb.send<ImportResult>('/backend/v1/tecson/reseller-import', {
        method: 'POST',
        body: JSON.stringify({
          reseller_id: resellerId,
          rows: rows.map((r) => ({
            line: r.line,
            barcode: r.barcode,
            description: r.description,
            quantity: r.quantity,
            selling_price: r.selling_price,
          })),
          dry_run: false,
        }),
      })
      setResult(res)
      toast.success('Importação concluída.')
      setPreview(null)
    } catch (err: any) {
      toast.error(err?.message || 'Erro na importação.')
    } finally {
      setCommitting(false)
    }
  }, [preview, resellerId, rows])

  const stats = useMemo(() => {
    if (!preview) return null
    return {
      total: preview.length,
      existing: preview.filter((p) => p.status === 'existing').length,
      created: preview.filter((p) => p.status === 'new').length,
      invalid: preview.filter((p) => p.status === 'invalid').length,
      conflict: preview.filter((p) => p.status === 'conflict').length,
      totalQty: preview
        .filter((p) => p.status !== 'invalid' && p.status !== 'conflict')
        .reduce((a, p) => a + p.quantity, 0),
    }
  }, [preview])

  return (
    <div className="container mx-auto space-y-4 p-4">
      <div>
        <h1 className="text-2xl font-bold">Importar Tecson — Revendedora</h1>
        <p className="text-sm text-muted-foreground">
          Uma revendedora por vez. CSV do depósito dela no Tecson. Prévia antes de gravar;
          confirmação explícita; transação tudo-ou-nada.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>1. CSV do depósito</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3">
            <Input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="max-w-md"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) handleFile(f)
              }}
            />
            {fileName && <span className="text-sm text-muted-foreground">{fileName}</span>}
          </div>
          <div className="text-xs text-muted-foreground">
            Colunas esperadas: CODIGO_BARRAS (ou EAN/GTIN), QUANTIDADE (ou QTDE/ESTOQUE), DESCRICAO
            (opcional), PRECO (opcional). Separador ; ou ,
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>2. Revendedora</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label htmlFor="sel-reseller">Revendedora</Label>
              <select
                id="sel-reseller"
                className="border rounded px-3 py-2 text-sm w-72"
                value={resellerId}
                onChange={(e) => setResellerId(e.target.value)}
              >
                <option value="">— Selecione —</option>
                {resellers.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
            <Button variant="outline" onClick={() => setCreateMode((v) => !v)}>
              {createMode ? 'Cancelar' : 'Cadastrar nova'}
            </Button>
          </div>
          {createMode && (
            <div className="flex flex-wrap items-end gap-3 border rounded-md p-3">
              <div className="space-y-1">
                <Label htmlFor="nr-name">Nome</Label>
                <Input
                  id="nr-name"
                  value={newResellerName}
                  onChange={(e) => setNewResellerName(e.target.value)}
                  className="w-64"
                  autoComplete="off"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="nr-email">E-mail (opcional)</Label>
                <Input
                  id="nr-email"
                  type="email"
                  value={newResellerEmail}
                  onChange={(e) => setNewResellerEmail(e.target.value)}
                  className="w-64"
                  autoComplete="off"
                />
              </div>
              <Button onClick={handleCreateReseller}>Localizar ou cadastrar</Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>3. Prévia</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button onClick={handlePreview} disabled={rows.length === 0}>
            Gerar prévia
          </Button>
          {preview && stats && (
            <>
              <div className="flex flex-wrap gap-2 text-sm">
                <Badge>Códigos: {stats.total}</Badge>
                <Badge variant="secondary">Existentes: {stats.existing}</Badge>
                <Badge variant="secondary">Novos: {stats.created}</Badge>
                <Badge variant="destructive">Inválidos: {stats.invalid}</Badge>
                <Badge variant="destructive">Conflitos: {stats.conflict}</Badge>
                <Badge>Qtd total: {stats.totalQty}</Badge>
              </div>
              <div className="border rounded-md overflow-auto max-h-96">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Linhas</TableHead>
                      <TableHead>Código de barras</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Qtd</TableHead>
                      <TableHead>Situação</TableHead>
                      <TableHead>Físico atual</TableHead>
                      <TableHead>Posse atual</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.map((p) => (
                      <TableRow key={p.key + '-' + p.lines.join('-')}>
                        <TableCell>{p.lines.join(', ')}</TableCell>
                        <TableCell className="font-mono">{p.barcode || p.key}</TableCell>
                        <TableCell>{p.description || '—'}</TableCell>
                        <TableCell>{p.quantity}</TableCell>
                        <TableCell>
                          <span
                            className={cn(
                              'text-xs font-medium',
                              p.status === 'existing' && 'text-blue-600',
                              p.status === 'new' && 'text-green-600',
                              (p.status === 'invalid' || p.status === 'conflict') && 'text-red-600',
                            )}
                          >
                            {p.status === 'existing' && 'Existente — aumenta posse'}
                            {p.status === 'new' && 'Novo — cria com Físico 0'}
                            {p.status === 'invalid' && 'Inválido — pendência'}
                            {p.status === 'conflict' && 'Conflito — pendência'}
                          </span>
                          {p.reason && (
                            <div className="text-xs text-muted-foreground">{p.reason}</div>
                          )}
                        </TableCell>
                        <TableCell>{p.existing ? p.existing.fisico : '—'}</TableCell>
                        <TableCell>{p.existing ? p.existing.posseAtual : '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <Button onClick={handleConfirm} disabled={committing}>
                {committing ? 'Importando…' : 'Confirmar importação'}
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardHeader>
            <CardTitle>4. Relatório final</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div>Produtos atualizados (posse): {result.products_updated}</div>
            <div>Produtos criados: {result.products_created}</div>
            <div>Registros de posse criados: {result.stock_items_created}</div>
            <div>Registros de posse atualizados: {result.stock_items_updated}</div>
            {result.maleta_code && (
              <div>
                Maleta de migração criada: código {result.maleta_code}
                {result.maleta_id ? ` (${result.maleta_id})` : ''}
              </div>
            )}
            {result.skipped.length > 0 && (
              <div>
                <div className="font-medium mt-2">Pendências (não importadas):</div>
                <ul className="list-disc pl-5">
                  {result.skipped.map((s, i) => (
                    <li key={i}>
                      Linha {s.line} — {s.barcode || 'sem código'}: {s.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
