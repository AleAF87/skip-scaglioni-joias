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
import { cn } from '@/lib/utils'
import { getProductDisplayPhoto } from '@/lib/formatters'
import {
  parseTecsonCsv,
  splitCodProduto,
  type ParsedTecsonRow,
} from '@/pages/imports/tecsonCsvParser'
import type { Reseller } from '@/types'

/** Prévia: agrupamento por base+variação do COD_PRODUTO Tecson. */
interface PreviewRow {
  key: string // base + ' | ' + variação normalizada
  codOriginal: string
  baseCode: string
  variation: string
  codigoBarrasTecson: string
  description: string
  quantity: number
  sellingPrice: string
  lines: number[]
  status: 'existing' | 'new' | 'invalid' | 'conflict'
  /** Situação de posse quando qty === 0 (cadastro/mapeamento somente). */
  zeroQty: boolean
  existing?: {
    id: string
    description: string
    photo: string
    fisico: number
    posseAtual: number
    variationFound: boolean
    variationLabel: string
  }
  reason?: string
}

interface ImportResult {
  products_updated: number
  products_created: number
  variations_created: number
  stock_items_created: number
  stock_items_updated: number
  maleta_id?: string
  maleta_code?: string
  skipped: Array<{ line: number; code?: string; barcode?: string; reason: string }>
}

function parseNumberBr(v: string): number {
  if (!v) return 0
  const cleaned = String(v).trim().replace(/\s/g, '').replace(/\./g, '').replace(',', '.')
  const n = parseFloat(cleaned)
  return isNaN(n) ? 0 : n
}

const normForCompare = (v: string) =>
  String(v || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim()

export default function ImportTecsonResellerPage() {
  const [csvText, setCsvText] = useState('')
  const [fileName, setFileName] = useState('')
  const [parsedRows, setParsedRows] = useState<ParsedTecsonRow[]>([])
  const [invalidRows, setInvalidRows] = useState<ParsedTecsonRow[]>([])
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
    let text: string
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(buf)
    } catch (_) {
      text = new TextDecoder('iso-8859-1').decode(buf)
    }
    setCsvText(text)
    setFileName(file.name)
    setResult(null)
    setPreview(null)

    const { rows, invalidRows } = parseTecsonCsv(text)
    if (rows.length === 0 && invalidRows.length === 0) {
      toast.error('CSV sem linhas de dados.')
      setParsedRows([])
      setInvalidRows([])
      return
    }
    setParsedRows(rows)
    setInvalidRows(invalidRows)
  }, [])

  // Agrupamento por base+variação do COD_PRODUTO (mesmo par repetido soma; qty 0 preservada).
  const grouped = useMemo<PreviewRow[]>(() => {
    const map = new Map<string, PreviewRow>()
    parsedRows.forEach((r) => {
      const key = r.base_code + (r.variation ? ' | ' + r.variation : '')
      if (!map.has(key)) {
        map.set(key, {
          key,
          codOriginal: r.cod_produto,
          baseCode: r.base_code,
          variation: r.variation,
          codigoBarrasTecson: r.codigo_barras_tecson,
          description: r.description,
          quantity: r.quantity,
          sellingPrice: r.selling_price,
          lines: [r.line],
          status: 'new',
          zeroQty: r.quantity === 0,
        })
      } else {
        const g = map.get(key)!
        g.quantity += r.quantity
        g.zeroQty = g.quantity === 0
        g.lines.push(r.line)
        if (!g.description && r.description) g.description = r.description
        if (!g.sellingPrice && r.selling_price) g.sellingPrice = r.selling_price
        if (!g.codigoBarrasTecson && r.codigo_barras_tecson)
          g.codigoBarrasTecson = r.codigo_barras_tecson
      }
    })
    return Array.from(map.values())
  }, [parsedRows])

  const buildPreview = useCallback(
    async (targetResellerId: string) => {
      const previewRows: PreviewRow[] = grouped.map((g) => ({ ...g }))

      // Busca TODOS os produtos paginado (o volume é de poucos milhares) e faz a
      // correspondência em memória por code/sku_novo/sku_interno/codigo_produto_tecson/
      // id_tecson — NUNCA por código de barras (auditoria somente).
      const products = await pb.collection('products').getFullList<any>({
        fields:
          'id,description,nome_produto,quantity,code,sku_novo,sku_interno,codigo_produto_tecson,id_tecson,image_url,photos,selling_price',
      })
      const byBase = new Map<string, any>()
      products.forEach((p) => {
        const candidates = [p.code, p.sku_novo, p.sku_interno, p.codigo_produto_tecson, p.id_tecson]
          .map((c) => normForCompare(c))
          .filter(Boolean)
        candidates.forEach((c) => {
          if (byBase.has(c)) {
            // mesmo código em mais de um produto: marca conflito
            const cur = byBase.get(c)
            if (cur !== p && !cur.__conflict) {
              cur.__conflict = true
            }
          } else {
            p.__conflict = false
            byBase.set(c, p)
          }
        })
      })

      const stockItems = await pb
        .collection('reseller_stock_items')
        .getFullList<any>({ filter: `reseller = '${targetResellerId}'` })
      const posseByProduct = new Map<string, number>()
      stockItems.forEach((s) => {
        posseByProduct.set(s.product, (posseByProduct.get(s.product) || 0) + (s.quantity || 0))
      })

      // Variações existentes por produto (para detectar variação nova x existente).
      const varFilter = previewRows
        .filter((g) => g.variation && g.status !== 'invalid')
        .map((g) => g.baseCode)
        .filter(Boolean)
      const variationsByProduct = new Map<string, Array<Record<string, any>>>()
      if (varFilter.length > 0) {
        const baseCodes = Array.from(new Set(varFilter))
        const filters = baseCodes.map((b) => `product.code ~ '${b}'`).join(' || ')
        try {
          const vars = await pb.collection('product_variations').getFullList<any>({
            filter: filters,
            fields: 'id,product,sku,attributes',
          })
          vars.forEach((v) => {
            const arr = variationsByProduct.get(v.product) || []
            arr.push(v)
            variationsByProduct.set(v.product, arr)
          })
        } catch (_) {
          /* sem variação localizada: cai no fluxo de variação nova */
        }
      }

      for (const g of previewRows) {
        if (!g.baseCode) {
          g.status = 'invalid'
          g.reason = 'COD_PRODUTO ilegível.'
          continue
        }
        const found = byBase.get(normForCompare(g.baseCode))
        if (found && found.__conflict) {
          g.status = 'conflict'
          g.reason = 'Mais de um produto cadastrado com este código.'
          continue
        }
        if (found) {
          // Variação: existe no produto?
          let variationFound = false
          let variationLabel = ''
          if (g.variation) {
            const vars = variationsByProduct.get(found.id) || []
            const vNorm = normForCompare(g.variation)
            const hit = vars.find((v) => {
              const sku = String(v.sku || '')
              let label = ''
              try {
                const attrs = JSON.parse(String(v.attributes || '{}'))
                label = Object.values(attrs)
                  .map((a) => String(a).trim())
                  .filter(Boolean)
                  .join(' / ')
              } catch (_) {
                /* atributos inválidos: ignora */
              }
              const skuSuffix = sku.replace(
                new RegExp(
                  '^' + String(found.id).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[\\s\\-_]*',
                ),
                '',
              )
              return [label, sku, skuSuffix].some((c) => normForCompare(c) === vNorm)
            })
            variationFound = !!hit
            variationLabel = g.variation
          }
          g.status = 'existing'
          g.existing = {
            id: found.id,
            description: found.nome_produto || found.description || '',
            photo: getProductDisplayPhoto(found),
            fisico: found.quantity || 0,
            posseAtual: posseByProduct.get(found.id) || 0,
            variationFound,
            variationLabel,
          }
          // Variação nova num produto existente conta como "variação nova" nos totais.
          g.reason =
            g.variation && !variationFound
              ? 'Variação nova — será criada no produto existente.'
              : undefined
        } else {
          g.status = 'new'
        }
      }
      return previewRows
    },
    [grouped],
  )

  const handlePreview = useCallback(async () => {
    if (parsedRows.length === 0 && invalidRows.length === 0) {
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
        if (resellerId) {
          await pb.send('/backend/v1/tecson/reseller-import', {
            method: 'POST',
            body: JSON.stringify({
              reseller_id: resellerId,
              rows: parsedRows.map((r) => ({
                line: r.line,
                cod_produto: r.cod_produto,
                codigo_barras_tecson: r.codigo_barras_tecson,
                quantity: r.quantity,
                description: r.description,
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
  }, [parsedRows, invalidRows, resellerId, createMode, buildPreview])

  const handleCreateReseller = useCallback(async () => {
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
        status: 'pending',
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
    const withPosse = preview.filter((p) => p.status !== 'invalid' && p.quantity > 0)
    const onlyZero = preview.filter((p) => p.status !== 'invalid' && p.quantity === 0)
    const confirmed = window.confirm(
      `Confirmar importação de ${importable.length} código(s) para a revendedora selecionada?\n` +
        `${withPosse.length} com posse (qty > 0) e ${onlyZero.length} só cadastro/mapeamento (qty 0).\n` +
        `Esta operação é tudo-ou-nada.`,
    )
    if (!confirmed) return
    setCommitting(true)
    try {
      // Linhas com qty 0 vão também (o hook as trata como cadastro/mapeamento somente,
      // sem criar posse nem alterar estoque).
      const res = await pb.send<ImportResult>('/backend/v1/tecson/reseller-import', {
        method: 'POST',
        body: JSON.stringify({
          reseller_id: resellerId,
          rows: parsedRows.map((r) => ({
            line: r.line,
            cod_produto: r.cod_produto,
            codigo_barras_tecson: r.codigo_barras_tecson,
            quantity: r.quantity,
            description: r.description,
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
  }, [preview, resellerId, parsedRows])

  const stats = useMemo(() => {
    if (!preview) return null
    const existingRows = preview.filter((p) => p.status === 'existing')
    const createdRows = preview.filter((p) => p.status === 'new')
    const invalidRowsPrev = preview.filter((p) => p.status === 'invalid')
    const conflictRows = preview.filter((p) => p.status === 'conflict')
    const zeroRows = preview.filter(
      (p) => p.status !== 'invalid' && p.status !== 'conflict' && p.quantity === 0,
    )
    const newVariationsOnExisting = existingRows.filter(
      (p) => p.existing && p.variation && !p.existing.variationFound,
    ).length
    return {
      total: preview.length,
      existing: existingRows.length,
      existingVariationsFound: existingRows.filter((p) => p.existing?.variationFound).length,
      newVariationsOnExisting,
      created: createdRows.length,
      createdWithVariation: createdRows.filter((p) => p.variation).length,
      zeroRows: zeroRows.length,
      invalid: invalidRowsPrev.length,
      conflict: conflictRows.length,
      totalQtyOwned: preview
        .filter((p) => p.status === 'existing' || p.status === 'new')
        .reduce((a, p) => a + p.quantity, 0),
    }
  }, [preview])

  return (
    <div className="container mx-auto space-y-4 p-4">
      <div>
        <h1 className="text-2xl font-bold">Importar Tecson — Revendedora</h1>
        <p className="text-sm text-muted-foreground">
          Uma revendedora por vez. CSV do depósito dela no Tecson. Prévia antes de gravar;
          confirmação explícita; transação tudo-ou-nada. COD_PRODUTO é a chave (aceita código de 6
          dígitos e código+variação, ex. "631587 N15"); CODIGO_BARRAS_TECSON é só auditoria.
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
            Colunas esperadas: COD_PRODUTO;CODIGO_BARRAS_TECSON (opcional, auditoria);QUANTIDADE
            (aceita 0);DESCRICAO (opcional);PRECO (opcional). Separador ; ou ,
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
          <Button
            onClick={handlePreview}
            disabled={parsedRows.length === 0 && invalidRows.length === 0}
          >
            Gerar prévia
          </Button>
          {preview && stats && (
            <>
              <div className="flex flex-wrap gap-2 text-sm">
                <Badge>Códigos: {stats.total}</Badge>
                <Badge variant="secondary">Existentes encontrados: {stats.existing}</Badge>
                {stats.existingVariationsFound > 0 && (
                  <Badge variant="secondary">
                    Variações encontradas: {stats.existingVariationsFound}
                  </Badge>
                )}
                {stats.newVariationsOnExisting > 0 && (
                  <Badge variant="secondary">
                    Variações novas: {stats.newVariationsOnExisting}
                  </Badge>
                )}
                <Badge variant="secondary">Produtos novos: {stats.created}</Badge>
                {stats.createdWithVariation > 0 && (
                  <Badge variant="secondary">
                    Variações novas (produto novo): {stats.createdWithVariation}
                  </Badge>
                )}
                {stats.zeroRows > 0 && (
                  <Badge variant="secondary">Linhas com saldo zero: {stats.zeroRows}</Badge>
                )}
                {stats.invalid > 0 && (
                  <Badge variant="destructive">Inválidos: {stats.invalid}</Badge>
                )}
                {stats.conflict > 0 && (
                  <Badge variant="destructive">Conflitos: {stats.conflict}</Badge>
                )}
                <Badge>Qtd total em posse: {stats.totalQtyOwned}</Badge>
              </div>
              <div className="border rounded-md overflow-auto max-h-96">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Linhas</TableHead>
                      <TableHead>COD_PRODUTO</TableHead>
                      <TableHead>Imagem</TableHead>
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
                        <TableCell className="font-mono">
                          {p.codOriginal || p.baseCode}
                          {p.variation && (
                            <span className="text-muted-foreground"> ({p.variation})</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {p.status === 'existing' && p.existing?.photo ? (
                            <img
                              src={p.existing.photo}
                              alt={`Imagem do produto ${p.codOriginal}`}
                              className="h-12 w-12 rounded object-cover"
                              width={48}
                              height={48}
                              loading="lazy"
                            />
                          ) : p.status === 'existing' ? (
                            <span className="text-xs text-muted-foreground">Sem imagem</span>
                          ) : p.status === 'new' ? (
                            <span className="text-xs text-muted-foreground">
                              Produto novo — sem imagem cadastrada
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>{p.description || p.existing?.description || '—'}</TableCell>
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
                            {p.status === 'existing' &&
                              (p.quantity === 0
                                ? 'Sem posse atual — cadastro/mapeamento somente'
                                : 'Existente — aumenta posse')}
                            {p.status === 'new' &&
                              (p.quantity === 0
                                ? 'Produto novo, sem posse — cadastro/mapeamento somente'
                                : 'Novo — cria com Físico 0')}
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
                    {invalidRows.map((r) => (
                      <TableRow key={'inv-' + r.line}>
                        <TableCell>{r.line}</TableCell>
                        <TableCell className="font-mono">{r.cod_produto || '—'}</TableCell>
                        <TableCell>
                          <span className="text-xs text-muted-foreground">—</span>
                        </TableCell>
                        <TableCell>{r.description || '—'}</TableCell>
                        <TableCell>{r.quantity}</TableCell>
                        <TableCell>
                          <span className="text-xs font-medium text-red-600">
                            Inválida — pendência
                          </span>
                          <div className="text-xs text-muted-foreground">{r.invalid_reason}</div>
                        </TableCell>
                        <TableCell>—</TableCell>
                        <TableCell>—</TableCell>
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
            <div>Variações criadas: {result.variations_created ?? 0}</div>
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
                      Linha {s.line} — {s.code || s.barcode || 'sem código'}: {s.reason}
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
