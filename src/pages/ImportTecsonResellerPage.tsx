import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  readTecsonFileAsText,
  stripLeadingZerosBarcode,
  normHeader,
  FIELD_LABELS,
  type ParsedTecsonRow,
} from '@/pages/imports/tecsonCsvParser'
import type { Reseller } from '@/types'

/**
 * Regras (decisão do usuário):
 *  - CSV lido POR CABEÇALHO (formato padrão igual à /importar-tecson):
 *      IMAGEM;NOME;COD_PRODUTO;FORNECEDOR;CODIGO_BARRAS;QUANTIDADE;PRECO
 *  - CHAVE PRINCIPAL = CODIGO_BARRAS (comparação remove só zeros à esquerda:
 *    0000000442497 = 442497). COD_PRODUTO Tecson é complementar e NUNCA
 *    localiza produto nem vira quantidade.
 *  - Valor original do código de barras preservado para auditoria.
 *  - Produto novo: Físico 0, quantidade somente na posse da revendedora.
 *  - Produto existente: só aumenta a posse; Físico intocado.
 *  - qty 0 = cadastro/mapeamento somente, sem posse.
 */

interface PreviewRow {
  key: string
  lines: number[]
  codigoBarras: string // ORIGINAL do CSV (com zeros à esquerda) — auditoria
  codigoBarrasNorm: string
  codProduto: string
  codProdutoBase: string
  variacao: string
  fornecedor: string
  imagem: string
  nome: string
  quantity: number
  preco: number
  status: 'existing' | 'new' | 'invalid' | 'conflict'
  existing?: {
    id: string
    description: string
    photo: string
    fisico: number
    posseAtual: number
    variationFound: boolean
  }
  reason?: string
}

interface ImportResult {
  products_updated: number
  products_created: number
  variations_created: number
  stock_items_created: number
  stock_items_updated: number
  skipped: Array<{ line: number; code?: string; barcode?: string; reason: string }>
}

const normForCompare = (v: string) =>
  String(v || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim()

export default function ImportTecsonResellerPage() {
  const [fileName, setFileName] = useState('')
  const [parsedRows, setParsedRows] = useState<ParsedTecsonRow[]>([])
  const [parseErrors, setParseErrors] = useState<string[]>([])
  const [parseHeaders, setParseHeaders] = useState<string[]>([])
  const [headerMap, setHeaderMap] = useState<Record<string, number | null> | null>(null)
  const [resellers, setResellers] = useState<Reseller[]>([])
  const [resellerId, setResellerId] = useState('')
  const [newResellerName, setNewResellerName] = useState('')
  const [newResellerEmail, setNewResellerEmail] = useState('')
  const [createMode, setCreateMode] = useState(false)
  const [preview, setPreview] = useState<PreviewRow[] | null>(null)
  const [committing, setCommitting] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
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
    setFileName(file.name)
    setResult(null)
    setPreview(null)
    try {
      const text = await readTecsonFileAsText(file)
      const parsed = parseTecsonCsv(text)
      setParseHeaders(parsed.headers)
      setHeaderMap(parsed.headerMap)
      setParseErrors(parsed.errors)
      setParsedRows(parsed.rows)
      if (parsed.headerMap.codigoBarras === null) {
        toast.error(
          'Cabeçalho CODIGO_BARRAS não encontrado — a importação ficará bloqueada até corrigir o CSV.',
        )
      } else if (parsed.rows.length === 0) {
        toast.error('CSV sem linhas de dados válidas.')
      } else {
        toast.success(`${parsed.rows.length} linha(s) lida(s) por cabeçalho.`)
      }
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao ler o arquivo.')
      setParsedRows([])
      setParseErrors([])
      setParseHeaders([])
      setHeaderMap(null)
    }
  }, [])

  /** Coluna CODIGO_BARRAS mapeada? Sem ela a confirmação é BLOQUEADA. */
  const barcodeHeaderOk = !!headerMap && headerMap.codigoBarras !== null

  // Agrupamento por CÓDIGO DE BARRAS normalizado (+ variação do COD_PRODUTO).
  const grouped = useMemo<PreviewRow[]>(() => {
    const map = new Map<string, PreviewRow>()
    parsedRows.forEach((r) => {
      const key = r.codigoBarrasNorm + (r.variacao ? ' | ' + r.variacao : '')
      const existing = map.get(key)
      if (!existing) {
        map.set(key, {
          key,
          lines: [r.line],
          codigoBarras: r.codigoBarras,
          codigoBarrasNorm: r.codigoBarrasNorm,
          codProduto: r.codProduto,
          codProdutoBase: r.codProdutoBase,
          variacao: r.variacao,
          fornecedor: r.fornecedor,
          imagem: r.imagem,
          nome: r.nome,
          quantity: r.quantidade,
          preco: r.preco,
          status: 'new',
        })
      } else {
        existing.quantity += r.quantidade
        existing.lines.push(r.line)
        if (!existing.nome && r.nome) existing.nome = r.nome
        if (!existing.imagem && r.imagem) existing.imagem = r.imagem
        if (!existing.fornecedor && r.fornecedor) existing.fornecedor = r.fornecedor
        if (!existing.preco && r.preco) existing.preco = r.preco
      }
    })
    return Array.from(map.values())
  }, [parsedRows])

  const buildPreview = useCallback(
    async (targetResellerId: string) => {
      const previewRows: PreviewRow[] = grouped.map((g) => ({ ...g }))

      // Correspondência APENAS por código de barras (codigo_barras e
      // codigo_barras_tecson), normalizando só zeros à esquerda.
      // COD_PRODUTO/ID Tecson NÃO são usados como chave.
      const products = await pb.collection('products').getFullList<any>({
        fields:
          'id,description,nome_produto,quantity,code,sku_novo,sku_interno,codigo_barras,codigo_barras_tecson,codigo_produto_tecson,id_tecson,image_url,photos,selling_price',
      })
      const byBarcode = new Map<string, any>()
      products.forEach((p) => {
        const candidates = [p.codigo_barras, p.codigo_barras_tecson]
          .map((c: string) => stripLeadingZerosBarcode(c))
          .filter((c: string) => c && c !== '0')
        candidates.forEach((c: string) => {
          if (byBarcode.has(c)) {
            const cur = byBarcode.get(c)
            if (cur !== p && !cur.__conflict) cur.__conflict = true
          } else {
            p.__conflict = false
            byBarcode.set(c, p)
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

      for (const g of previewRows) {
        if (!g.codigoBarrasNorm || g.codigoBarrasNorm === '0') {
          g.status = 'invalid'
          g.reason = 'CODIGO_BARRAS ilegível — chave principal ausente.'
          continue
        }
        const found = byBarcode.get(g.codigoBarrasNorm)
        if (found && found.__conflict) {
          g.status = 'conflict'
          g.reason = 'Mais de um produto cadastrado com este código de barras.'
          continue
        }
        if (found) {
          let variationFound = true
          if (g.variacao) {
            try {
              const vars = await pb.collection('product_variations').getFullList<any>({
                filter: `product = '${found.id}'`,
                fields: 'id,sku,attributes',
              })
              const vNorm = normForCompare(g.variacao)
              variationFound = vars.some((v) => {
                const sku = String(v.sku || '')
                let label = ''
                try {
                  const attrs = JSON.parse(String(v.attributes || '{}'))
                  label = Object.values(attrs)
                    .map((a) => String(a).trim())
                    .filter(Boolean)
                    .join(' / ')
                } catch {
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
            } catch {
              variationFound = false
            }
          }
          g.status = 'existing'
          g.existing = {
            id: found.id,
            description: found.nome_produto || found.description || '',
            photo: getProductDisplayPhoto(found),
            fisico: found.quantity || 0,
            posseAtual: posseByProduct.get(found.id) || 0,
            variationFound,
          }
          g.reason =
            g.variacao && !variationFound
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
    if (parsedRows.length === 0) {
      toast.error('Selecione um CSV primeiro.')
      return
    }
    if (!barcodeHeaderOk) {
      toast.error(
        'Coluna CODIGO_BARRAS não encontrada no cabeçalho do CSV — corrija o arquivo antes de importar.',
      )
      return
    }
    if (!resellerId && !createMode) {
      toast.error('Selecione ou cadastre a revendedora.')
      return
    }
    if (!resellerId) {
      toast.error('Cadastre a revendedora antes de gerar a prévia.')
      return
    }
    try {
      const p = await buildPreview(resellerId)
      setPreview(p)
      // Validação server-side extra (dry_run) — opcional, silenciosa.
      try {
        await pb.send('/backend/v1/tecson/reseller-import', {
          method: 'POST',
          body: JSON.stringify({
            reseller_id: resellerId,
            rows: buildHookRows(parsedRows),
            dry_run: true,
          }),
        })
      } catch {
        /* falha silenciosa — a prévia client-side é suficiente */
      }
      toast.success('Prévia gerada. Revise e confirme.')
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao gerar prévia.')
    }
  }, [parsedRows, resellerId, createMode, buildPreview, barcodeHeaderOk])

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
    // BLOQUEIO DURO: sem CODIGO_BARRAS mapeado no cabeçalho, nada é gravado.
    if (!barcodeHeaderOk) {
      toast.error(
        'Importação BLOQUEADA: a coluna CODIGO_BARRAS não foi encontrada no cabeçalho do CSV. ' +
          'Ela é a chave principal — corrija o arquivo antes de confirmar.',
      )
      return
    }
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
      const res = await pb.send<ImportResult>('/backend/v1/tecson/reseller-import', {
        method: 'POST',
        body: JSON.stringify({
          reseller_id: resellerId,
          rows: buildHookRows(parsedRows),
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
  }, [preview, resellerId, parsedRows, barcodeHeaderOk])

  const stats = useMemo(() => {
    if (!preview) return null
    const existingRows = preview.filter((p) => p.status === 'existing')
    const newRows = preview.filter((p) => p.status === 'new')
    const invalid = preview.filter((p) => p.status === 'invalid')
    const conflict = preview.filter((p) => p.status === 'conflict')
    return {
      total: preview.length,
      existing: existingRows.length,
      created: newRows.length,
      zeroRows: preview.filter((p) => p.quantity === 0 && p.status !== 'invalid').length,
      invalid: invalid.length,
      conflict: conflict.length,
      totalQtyOwned: preview
        .filter((p) => p.status === 'existing' || p.status === 'new')
        .reduce((a, p) => a + p.quantity, 0),
    }
  }, [preview])

  /** Célula de imagem da prévia: cadastrada > importada > vazio. */
  const renderImage = (p: PreviewRow) => {
    if (p.status === 'existing' && p.existing?.photo) {
      return (
        <img
          src={p.existing.photo}
          alt={`Imagem cadastrada do produto ${p.codigoBarras || 'sem código'}`}
          className="h-12 w-12 rounded object-cover border"
          width={48}
          height={48}
          loading="lazy"
        />
      )
    }
    if (p.imagem) {
      return (
        <div className="flex flex-col items-start gap-0.5">
          <img
            src={p.imagem}
            alt={`Imagem importada do produto ${p.codigoBarras || 'sem código'}`}
            className="h-12 w-12 rounded object-cover border"
            width={48}
            height={48}
            loading="lazy"
          />
          <span className="text-[10px] text-muted-foreground">
            {p.status === 'new' ? 'será a imagem principal' : 'produto sem imagem — será usada'}
          </span>
        </div>
      )
    }
    if (p.status === 'new') {
      return <span className="text-xs text-muted-foreground">Produto novo — sem imagem</span>
    }
    return <span className="text-xs text-muted-foreground">Sem imagem</span>
  }

  return (
    <div className="container mx-auto space-y-4 p-4">
      <div>
        <h1 className="text-2xl font-bold">Importar Tecson — Revendedora</h1>
        <p className="text-sm text-muted-foreground">
          Uma revendedora por vez. CSV do depósito dela no Tecson, lido POR CABEÇALHO (mesmo formato
          da importação Tecson). CODIGO_BARRAS é a chave principal para localizar/criar o produto
          (zeros à esquerda são ignorados na comparação, preservados para auditoria); COD_PRODUTO
          Tecson é dado complementar; FORNECEDOR é informativo. Prévia antes de gravar; confirmação
          explícita; transação tudo-ou-nada.
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
              aria-label="Arquivo CSV do depósito Tecson"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) handleFile(f)
              }}
            />
            {fileName && <span className="text-sm text-muted-foreground">{fileName}</span>}
          </div>
          <div className="text-xs text-muted-foreground space-y-1">
            <p>
              Formato padronizado (leitura por cabeçalho, nesta ordem ou qualquer ordem):{' '}
              <code className="font-mono text-foreground">
                IMAGEM;NOME;COD_PRODUTO;FORNECEDOR;CODIGO_BARRAS;QUANTIDADE;PRECO
              </code>
            </p>
            <p>
              Aceita também os nomes usados em /importar-tecson (ex.: R$_VENDA para preço,
              QUANT_EM_ESTOQUES para quantidade, URL_IMAGEM/NOME_PRODUTO/CODIGO_BARRAS_TECSON).
              Preço brasileiro (140,00). Separador ; ou ,
            </p>
            {parseHeaders.length > 0 && (
              <div className="space-y-1">
                <p>Cabeçalhos detectados:</p>
                <div className="flex flex-wrap gap-1">
                  {parseHeaders.map((h, i) => {
                    const mappedField = headerMap
                      ? Object.keys(headerMap).find((f) => headerMap[f] === i)
                      : null
                    return (
                      <Badge
                        key={i}
                        variant={mappedField ? 'secondary' : 'outline'}
                        title={mappedField ? `mapeado: ${h} → ${FIELD_LABELS[mappedField]}` : h}
                        className="font-mono text-[11px]"
                      >
                        {h}
                        {mappedField && (
                          <span className="ml-1 text-green-700">→ {FIELD_LABELS[mappedField]}</span>
                        )}
                      </Badge>
                    )
                  })}
                </div>
              </div>
            )}
            {!barcodeHeaderOk && (
              <p className="text-destructive font-medium">
                Importação BLOQUEADA: nenhuma coluna de código de barras (CODIGO_BARRAS ou aliases
                CODIGO_DE_BARRAS, COD_BARRAS, EAN, EAN13, GTIN, CODIGO_BARRAS_TECSON) foi encontrada
                no cabeçalho. Ela é a chave principal — a confirmação fica desabilitada até o CSV
                ser corrigido.
              </p>
            )}
            {parseErrors.map((e, i) => (
              <p key={i} className="text-destructive">
                {e}
              </p>
            ))}
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
          <Button onClick={handlePreview} disabled={parsedRows.length === 0}>
            Gerar prévia
          </Button>
          {preview && stats && (
            <>
              <div className="flex flex-wrap gap-2 text-sm">
                <Badge>Códigos: {stats.total}</Badge>
                <Badge variant="secondary">Existentes: {stats.existing}</Badge>
                <Badge variant="secondary">Novos: {stats.created}</Badge>
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
              {headerMap && (
                <p className="text-xs text-muted-foreground">
                  Mapeamento:{' '}
                  {Object.entries(headerMap).map(([field, idx], i) => (
                    <span key={field}>
                      {i > 0 && '; '}
                      <span
                        className={cn(
                          'font-mono',
                          idx === null ? 'text-red-600' : 'text-green-700',
                        )}
                      >
                        {field} → {idx === null ? 'NÃO ENCONTRADO' : parseHeaders[idx]}
                      </span>
                    </span>
                  ))}
                </p>
              )}
              <div className="border rounded-md overflow-auto max-h-96">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Linhas</TableHead>
                      <TableHead>Imagem</TableHead>
                      <TableHead>CODIGO_BARRAS</TableHead>
                      <TableHead>COD_PRODUTO (Tecson)</TableHead>
                      <TableHead>Nome</TableHead>
                      <TableHead>Qtd</TableHead>
                      <TableHead>Preço</TableHead>
                      <TableHead>Situação</TableHead>
                      <TableHead>Físico atual</TableHead>
                      <TableHead>Posse atual</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.map((p) => (
                      <TableRow key={p.key + '-' + p.lines.join('-')}>
                        <TableCell>{p.lines.join(', ')}</TableCell>
                        <TableCell>{renderImage(p)}</TableCell>
                        <TableCell className="font-mono">{p.codigoBarras || '—'}</TableCell>
                        <TableCell className="font-mono">
                          {p.codProduto || p.codProdutoBase || '—'}
                          {p.variacao && (
                            <span className="text-muted-foreground"> ({p.variacao})</span>
                          )}
                        </TableCell>
                        <TableCell className="max-w-48 truncate">
                          {p.status === 'existing' && p.existing?.description
                            ? p.existing.description
                            : p.nome || '—'}
                        </TableCell>
                        <TableCell>{p.quantity}</TableCell>
                        <TableCell>
                          {p.preco > 0
                            ? p.preco.toLocaleString('pt-BR', {
                                style: 'currency',
                                currency: 'BRL',
                              })
                            : '—'}
                        </TableCell>
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
                                ? 'Existente — cadastro/mapeamento somente (qty 0)'
                                : 'Existente — aumenta posse')}
                            {p.status === 'new' &&
                              (p.quantity === 0
                                ? 'Novo — cadastro/mapeamento somente (qty 0)'
                                : 'Novo — estoque físico 0, quantidade na posse')}
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
              <Button onClick={handleConfirm} disabled={committing || !barcodeHeaderOk}>
                {committing
                  ? 'Importando…'
                  : !barcodeHeaderOk
                    ? 'Confirmar — bloqueado (sem CODIGO_BARRAS)'
                    : 'Confirmar importação'}
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

/** Monta o payload enviado ao hook (uma linha do CSV por item, valores JÁ parseados). */
function buildHookRows(rows: ParsedTecsonRow[]) {
  return rows.map((r) => ({
    line: r.line,
    cod_produto: r.codProduto,
    codigo_barras: r.codigoBarras, // ORIGINAL, com zeros à esquerda (auditoria)
    codigo_barras_norm: r.codigoBarrasNorm,
    imagem: r.imagem,
    fornecedor: r.fornecedor,
    quantity: r.quantidade, // inteiro — nunca lê COD_PRODUTO
    description: r.nome,
    selling_price: r.preco,
  }))
}
