import { useCallback, useState } from 'react'
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
 * Limpeza dos produtos-lixo criados por PRÉVIAS com o bug v0.0.278:
 * em 2026-11-26 ~20:47 UTC, gerar prévia gravava de verdade produtos
 * (qtde_inicial/selling_price com códigos deslocados, sem imagem,
 * ativo_interno=false, criado_em_origem='Migração Tecson — posse de
 * revendedora') e posses em reseller_stock_items.
 *
 * A rota no hook apaga SOMENTE produtos com esse marcador de origem criados
 * na janela informada (default: dia 2026-11-26) — importações legítimas
 * (ex. 2026-11-24) não são tocadas.
 */

export interface CleanupSummary {
  products_deleted: number
  stock_items_deleted: number
  variations_deleted: number
  category_links_deleted: number
  resellers_affected: string[]
}

interface CleanupPreviewCardProps {
  /** role do usuário logado (AppUser.role) */
  role?: string
}

const DEFAULT_DAY = '26/11/2026'

export function CleanupPreviewCard({ role }: CleanupPreviewCardProps) {
  const canRun = role === 'admin' || role === 'superadmin'
  const [open, setOpen] = useState(false)
  const [running, setRunning] = useState(false)
  const [summary, setSummary] = useState<CleanupSummary | null>(null)

  const runCleanup = useCallback(async () => {
    setRunning(true)
    try {
      const res = await pb.send<CleanupSummary>(
        '/backend/v1/tecson/reseller-import/cleanup-preview',
        {
          method: 'POST',
          body: JSON.stringify({
            day_start: '2026-11-26 00:00:00.000Z',
            day_end: '2026-11-27 00:00:00.000Z',
          }),
        },
      )
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
    <Card2>
      <p className="text-sm text-muted-foreground">
        Remove APENAS os produtos criados pela prévia com bug em {DEFAULT_DAY} (origem “Migração
        Tecson — posse de revendedora”) e as posses de revendedora desses produtos na mesma data.
        Importações legítimas anteriores (ex. 24/11) não são afetadas.
      </p>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (!next) setSummary(null)
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
              Esta operação apaga definitivamente os produtos-lixo criados pela prévia com bug
              (marca de origem “Migração Tecson — posse de revendedora”, criados em {DEFAULT_DAY}) e
              todas as posses de revendedora desses produtos na mesma data. Produtos de importações
              legítimas anteriores não são tocados.
            </DialogDescription>
          </DialogHeader>
          {summary ? (
            <div className="space-y-1 text-sm">
              <p className="font-medium">Resumo da limpeza:</p>
              <ul className="list-disc pl-5">
                <li>Produtos apagados: {summary.products_deleted}</li>
                <li>Posses (reseller_stock_items) apagadas: {summary.stock_items_deleted}</li>
                <li>Variações apagadas: {summary.variations_deleted}</li>
                <li>Vínculos de categoria apagados: {summary.category_links_deleted}</li>
                <li>Revendedoras com saldo recalculado: {summary.resellers_affected.length}</li>
              </ul>
            </div>
          ) : (
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)} disabled={running}>
                Cancelar
              </Button>
              <Button variant="destructive" onClick={runCleanup} disabled={running}>
                {running ? 'Limpando…' : 'Sim, limpar agora'}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </Card2>
  )
}

function Card2({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 space-y-3">
      <h3 className="font-semibold text-destructive">Limpeza de prévia (26/11/2026)</h3>
      {children}
    </div>
  )
}
