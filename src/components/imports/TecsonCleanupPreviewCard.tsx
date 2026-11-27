import { useCallback, useEffect, useState } from 'react'
import pb from '@/lib/pocketbase/client'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

/**
 * Limpeza dos dados-lixo criados pelas PRÉVIAS com o bug v0.0.278:
 * em 2026-11-26 (~20:47 → 00:24 UTC de 27/11), gerar prévia gravava de
 * verdade produtos e posses em reseller_stock_items.
 *
 * A rota no hook apaga por DOIS critérios (em OU):
 *   1. MARCADOR — produtos com criado_em_origem = 'Migração Tecson — posse de
 *      revendedora' criados na janela (+ variações/links/posses ligados).
 *   2. JANELA DE CRIAÇÃO — QUALQUER produto ou posse criado na janela, mesmo
 *      sem marcador. reseller_stock_items NEM TEM o campo criado_em_origem, e
 *      as 79 posses de 26/11 ~21:24 BRT (00:24 UTC de 27/11) sobreviveram à
 *      limpeza anterior por isso — e porque a janela antiga ia só até
 *      27/11 00:00 UTC.
 *
 * Importações legítimas de outras datas (ex. 24/11) não são tocadas: a janela
 * é fechada (2026-11-26 12:00 → 2026-11-27 03:00 UTC).
 */

const CLEANUP_ROUTE = '/backend/v1/tecson/reseller-import/cleanup-preview'

/** Janela UTC que cobre 26/11 ~09:00 → ~24:00 BRT. */
const DAY_START = '2026-11-26 12:00:00.000Z'
const DAY_END = '2026-11-27 03:00:00.000Z'

const DEFAULT_DAY = '26/11/2026'
const TAG = 'Migração Tecson — posse de revendedora'

export interface CleanupSummary {
  success: boolean
  dry_run: boolean
  day_start: string
  day_end: string
  products_deleted: number
  products_deleted_by_tag: number
  products_deleted_by_window: number
  stock_items_deleted: number
  stock_items_deleted_by_tag: number
  stock_items_deleted_by_window: number
  variations_deleted: number
  category_links_deleted: number
  resellers_affected: string[]
}

interface CleanupPreviewCardProps {
  /** role do usuário logado (AppUser.role) */
  role?: string
}

interface CriterionCounts {
  stockItems: number
  products: number
}

export function CleanupPreviewCard({ role }: CleanupPreviewCardProps) {
  const canRun = role === 'admin' || role === 'superadmin'
  const [open, setOpen] = useState(false)
  const [running, setRunning] = useState(false)
  const [counting, setCounting] = useState(false)
  const [counts, setCounts] = useState<CriterionCounts | null>(null)
  const [summary, setSummary] = useState<CleanupSummary | null>(null)

  /** Conta o que seria apagado (dry_run) quando o diálogo abre. */
  const fetchCounts = useCallback(async () => {
    setCounting(true)
    try {
      const res = await pb.send<CleanupSummary>(CLEANUP_ROUTE, {
        method: 'POST',
        body: JSON.stringify({ day_start: DAY_START, day_end: DAY_END, dry_run: true }),
      })
      setCounts({ stockItems: res.stock_items_deleted, products: res.products_deleted })
    } catch (err: any) {
      // Sem contagem o diálogo ainda funciona — o resumo pós-limpeza mostra os números reais.
      toast.error(err?.message || 'Falha ao contar os dados da prévia.')
      setCounts(null)
    } finally {
      setCounting(false)
    }
  }, [])

  useEffect(() => {
    if (open && !summary) void fetchCounts()
  }, [open, summary, fetchCounts])

  const runCleanup = useCallback(async () => {
    setRunning(true)
    try {
      const res = await pb.send<CleanupSummary>(CLEANUP_ROUTE, {
        method: 'POST',
        body: JSON.stringify({ day_start: DAY_START, day_end: DAY_END }),
      })
      setSummary(res)
      toast.success(
        `Limpeza concluída: ${res.products_deleted} produto(s) e ${res.stock_items_deleted} posse(s) apagados.`,
      )
    } catch (err: any) {
      toast.error(err?.message || 'Falha na rotina de limpeza.')
    } finally {
      setRunning(false)
    }
  }, [])

  // Apenas admin/superadmin: a rota no hook também valida o role server-side.
  if (!canRun) return null

  return (
    <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 space-y-3">
      <h3 className="font-semibold text-destructive">Limpeza de prévia (26/11/2026)</h3>
      <p className="text-sm text-muted-foreground">
        Remove os dados-lixo criados pela prévia com bug em {DEFAULT_DAY} por DOIS critérios
        (aplicados em OU): (1) produtos com a marca de origem “{TAG}” criados na janela, e as
        posses/variações ligadas a eles; (2) QUALQUER produto ou posse de revendedora criado na
        janela (26/11 09:00 → 24:00 BRT), mesmo SEM a marca — reseller_stock_items nem tem campo de
        origem, e foram essas posses (79) que sobreviveram à limpeza anterior. Dados legítimos de
        outras datas (ex. importação de 24/11) não são tocados.
      </p>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (!next) {
            setSummary(null)
            setCounts(null)
          }
        }}
      >
        <DialogTrigger asChild>
          <Button variant="destructive" disabled={running}>
            {running ? 'Limpando…' : `Limpar dados da prévia de ${DEFAULT_DAY}`}
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Limpar dados da prévia de {DEFAULT_DAY}?</DialogTitle>
            <DialogDescription>
              Esta operação apaga definitivamente os dados-lixo criados pela prévia com bug em{' '}
              {DEFAULT_DAY}, pelos DOIS critérios abaixo. Nada de outras datas é afetado.
            </DialogDescription>
          </DialogHeader>
          {summary ? (
            <div className="space-y-1 text-sm">
              <p className="font-medium">Resumo da limpeza:</p>
              <ul className="list-disc pl-5">
                <li>
                  Posses apagadas: {summary.stock_items_deleted} (janela de criação:{' '}
                  {summary.stock_items_deleted_by_window} · marca de origem:{' '}
                  {summary.stock_items_deleted_by_tag})
                </li>
                <li>
                  Produtos apagados: {summary.products_deleted} (janela de criação:{' '}
                  {summary.products_deleted_by_window} · marca de origem:{' '}
                  {summary.products_deleted_by_tag})
                </li>
                <li>Variações apagadas: {summary.variations_deleted}</li>
                <li>Vínculos de categoria apagados: {summary.category_links_deleted}</li>
                <li>Revendedoras com saldo recalculado: {summary.resellers_affected.length}</li>
              </ul>
            </div>
          ) : (
            <>
              <div className="space-y-1 text-sm">
                <p className="font-medium">O que será apagado (por critério):</p>
                {counting ? (
                  <p className="text-muted-foreground">Contando…</p>
                ) : counts ? (
                  <ul className="list-disc pl-5">
                    <li>
                      <span className="font-medium">Janela de criação</span> (26/11 09:00 → 24:00
                      BRT, com ou sem a marca): {counts.stockItems} posse(s) e {counts.products}{' '}
                      produto(s)
                    </li>
                    <li>
                      <span className="font-medium">Marca de origem</span> — posses de produtos com
                      a marca criados fora da janela: já incluídas na contagem combinada acima
                      (hoje: 0)
                    </li>
                  </ul>
                ) : (
                  <p className="text-muted-foreground">
                    Não foi possível contar — a limpeza apagará tudo criado na janela.
                  </p>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)} disabled={running}>
                  Cancelar
                </Button>
                <Button variant="destructive" onClick={runCleanup} disabled={running}>
                  {running ? 'Limpando…' : 'Sim, limpar agora'}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
