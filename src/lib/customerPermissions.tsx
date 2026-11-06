import React from 'react'
import { Customer } from '@/types'
import { useAuth } from '@/contexts/AuthContext'
import { Info } from 'lucide-react'

/**
 * Regra central de EDIÇÃO de clientes (mesma regra aplicada no updateRule da
 * collection customers):
 *  - equipe (superadmin/admin/operator): edita qualquer cliente, inclusive os
 *    antigos sem created_by;
 *  - revendedora: edita somente clientes que ELA mesma cadastrou
 *    (created_by = usuário logado).
 * A revendedora que não é a criadora continua vendo o cliente e vinculando-o a
 * vendas/reservas normalmente — apenas não pode editar.
 */
export const CUSTOMER_NO_EDIT_MSG = 'Somente quem cadastrou o cliente ou a equipe pode editá-lo.'

/** Hook: devolve a função de verificação de edição já com o usuário logado. */
export function useCanEditCustomer() {
  const { canManageInternal, isReseller, user } = useAuth()

  return (c: Pick<Customer, 'created_by'> | null | undefined): boolean => {
    if (canManageInternal) return true
    if (isReseller) return !!user?.id && !!c?.created_by && c.created_by === user.id
    return false
  }
}

/**
 * Faixa opcional de UI: aviso "sem permissão de edição" reutilizável no
 * CustomersManagement, CustomerModal e PDV da revendedora.
 */
export function CustomerNoEditNotice({ className }: { className?: string }) {
  return (
    <div
      className={`flex items-start gap-2 text-[11px] text-[#6B655E] bg-[#F8F5F0] border border-[#E5DFD5] rounded-md px-3 py-2 ${
        className || ''
      }`}
    >
      <Info className="h-3.5 w-3.5 text-[#C6A664] shrink-0 mt-0.5" />
      <span>{CUSTOMER_NO_EDIT_MSG}</span>
    </div>
  )
}
