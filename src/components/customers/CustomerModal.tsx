import React, { useState, useEffect } from 'react'
import { Customer, Sale } from '@/types'
import { customerService } from '@/services/customerService'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Loader2, UserCog, UserPlus, ShoppingBag, Info } from 'lucide-react'
import { toast } from 'sonner'
import { CustomerFormFields, CustomerFormState } from './CustomerFormFields'
import { CustomerPurchasesHistory } from './CustomerPurchasesHistory'
import { CustomerNoEditNotice } from '@/lib/customerPermissions'

interface CustomerModalProps {
  customer: Customer | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
  initialTab?: 'dados' | 'historico'
  canEdit?: boolean
}

const emptyForm: CustomerFormState = {
  name: '',
  cpf: '',
  birth_date: '',
  phone: '',
  email: '',
  address_zip: '',
  address_street: '',
  address_number: '',
  address_complement: '',
  address_neighborhood: '',
  city: '',
  state: '',
  notes: '',
  rg: '',
  cnpj: '',
  remember_birthday: false,
  seller_name: '',
  country: '',
  site: '',
  payment_type: '',
  billing_street: '',
  billing_number: '',
  billing_complement: '',
  billing_neighborhood: '',
  billing_city: '',
  billing_state: '',
  billing_zip: '',
  billing_country: '',
  contact_purchases_name: '',
  contact_purchases_phone: '',
  contact_purchases_email: '',
  contact_finance_name: '',
  contact_finance_phone: '',
  contact_finance_email: '',
  customer_since: '',
  status: '',
}

export function CustomerModal({
  customer,
  open,
  onOpenChange,
  onSaved,
  initialTab = 'dados',
  canEdit = true,
}: CustomerModalProps) {
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<'dados' | 'historico'>(initialTab)
  const [form, setForm] = useState<CustomerFormState>(emptyForm)
  const [errors, setErrors] = useState<Partial<Record<keyof CustomerFormState, string>>>({})

  // Histórico de compras
  const [purchases, setPurchases] = useState<Sale[]>([])
  const [loadingPurchases, setLoadingPurchases] = useState(false)

  const isEditing = Boolean(customer?.id)
  // Sem permissão de edição: o modal abre apenas em modo leitura + histórico
  const readOnly = isEditing && !canEdit

  useEffect(() => {
    if (open) {
      setActiveTab(initialTab)
      if (customer) {
        setForm({
          name: customer.name || '',
          cpf: customer.cpf || '',
          birth_date: customer.birth_date || '',
          phone: customer.phone || '',
          email: customer.email || '',
          address_zip: customer.address_zip || '',
          address_street: customer.address_street || '',
          address_number: customer.address_number || '',
          address_complement: customer.address_complement || '',
          address_neighborhood: customer.address_neighborhood || '',
          city: customer.city || '',
          state: customer.state || '',
          notes: customer.notes || '',
          rg: customer.rg || '',
          cnpj: customer.cnpj || '',
          remember_birthday: customer.remember_birthday || false,
          seller_name: customer.seller_name || '',
          country: customer.country || '',
          site: customer.site || '',
          payment_type: customer.payment_type || '',
          billing_street: customer.billing_street || '',
          billing_number: customer.billing_number || '',
          billing_complement: customer.billing_complement || '',
          billing_neighborhood: customer.billing_neighborhood || '',
          billing_city: customer.billing_city || '',
          billing_state: customer.billing_state || '',
          billing_zip: customer.billing_zip || '',
          billing_country: customer.billing_country || '',
          contact_purchases_name: customer.contact_purchases_name || '',
          contact_purchases_phone: customer.contact_purchases_phone || '',
          contact_purchases_email: customer.contact_purchases_email || '',
          contact_finance_name: customer.contact_finance_name || '',
          contact_finance_phone: customer.contact_finance_phone || '',
          contact_finance_email: customer.contact_finance_email || '',
          customer_since: (customer.customer_since || '').slice(0, 10),
          status: customer.status || '',
        })
        loadPurchases(customer.id)
      } else {
        setForm(emptyForm)
        setPurchases([])
      }
      setErrors({})
    }
  }, [customer, open, initialTab])

  const loadPurchases = async (customerId: string) => {
    setLoadingPurchases(true)
    try {
      const history = await customerService.getCustomerPurchases(customerId)
      setPurchases(history)
    } catch (err) {
      console.error('Erro ao carregar histórico de compras do cliente:', err)
      toast.error('Não foi possível carregar o histórico de compras.')
    } finally {
      setLoadingPurchases(false)
    }
  }

  const handleFieldChange = <K extends keyof CustomerFormState>(
    field: K,
    value: CustomerFormState[K],
  ) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const clearError = (field: keyof CustomerFormState) => {
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev }
        delete next[field]
        return next
      })
    }
  }

  const validate = () => {
    const errs: Partial<Record<keyof CustomerFormState, string>> = {}
    if (!form.name.trim()) {
      errs.name = 'Nome completo é obrigatório.'
    }
    if (form.email.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(form.email.trim())) {
        errs.email = 'Informe um e-mail válido.'
      }
    }
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) {
      toast.error('Preencha os campos obrigatórios corretamente.')
      return
    }

    setLoading(true)
    try {
      const payload = {
        name: form.name.trim(),
        cpf: form.cpf.trim() || undefined,
        birth_date: form.birth_date.trim() || undefined,
        phone: form.phone.trim() || undefined,
        email: form.email.trim() || undefined,
        address_zip: form.address_zip.trim() || undefined,
        address_street: form.address_street.trim() || undefined,
        address_number: form.address_number.trim() || undefined,
        address_complement: form.address_complement.trim() || undefined,
        address_neighborhood: form.address_neighborhood.trim() || undefined,
        city: form.city.trim() || undefined,
        state: form.state.trim().toUpperCase() || undefined,
        notes: form.notes.trim() || undefined,
        rg: form.rg.trim() || undefined,
        cnpj: form.cnpj.trim() || undefined,
        remember_birthday: form.remember_birthday,
        seller_name: form.seller_name.trim() || undefined,
        country: form.country.trim() || undefined,
        site: form.site.trim() || undefined,
        payment_type: form.payment_type.trim() || undefined,
        billing_street: form.billing_street.trim() || undefined,
        billing_number: form.billing_number.trim() || undefined,
        billing_complement: form.billing_complement.trim() || undefined,
        billing_neighborhood: form.billing_neighborhood.trim() || undefined,
        billing_city: form.billing_city.trim() || undefined,
        billing_state: form.billing_state.trim().toUpperCase() || undefined,
        billing_zip: form.billing_zip.trim() || undefined,
        billing_country: form.billing_country.trim() || undefined,
        contact_purchases_name: form.contact_purchases_name.trim() || undefined,
        contact_purchases_phone: form.contact_purchases_phone.trim() || undefined,
        contact_purchases_email: form.contact_purchases_email.trim() || undefined,
        contact_finance_name: form.contact_finance_name.trim() || undefined,
        contact_finance_phone: form.contact_finance_phone.trim() || undefined,
        contact_finance_email: form.contact_finance_email.trim() || undefined,
        customer_since: form.customer_since.trim() || undefined,
        status: form.status.trim(),
      }

      if (isEditing && customer) {
        await customerService.updateCustomer(customer.id, payload)
        toast.success(`Cliente "${form.name.trim()}" atualizado com sucesso!`)
      } else {
        await customerService.createCustomer(payload)
        toast.success(`Cliente "${form.name.trim()}" cadastrado com sucesso!`)
      }

      onOpenChange(false)
      onSaved()
    } catch (err: any) {
      console.error('Erro ao salvar cliente:', err)
      toast.error(err?.message || 'Falha ao salvar dados do cliente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto bg-white p-6">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-lg bg-[#C6A664]/20 text-[#7A5C2E]">
              {isEditing ? <UserCog className="h-5 w-5" /> : <UserPlus className="h-5 w-5" />}
            </span>
            <div>
              <DialogTitle className="font-serif text-xl text-[#2D2A26]">
                {isEditing ? (readOnly ? 'Dados do Cliente' : 'Editar Cliente') : 'Novo Cliente'}
              </DialogTitle>
              <DialogDescription className="text-xs text-[#6B655E] mt-0.5">
                {isEditing
                  ? readOnly
                    ? `Consulta dos dados e histórico de compras de ${customer?.name || 'cliente'} — somente quem cadastrou o cliente ou a equipe pode editá-lo.`
                    : `Atualize os dados e consulte o histórico de compras de ${customer?.name || 'cliente'}.`
                  : 'Cadastre um novo cliente com os dados de contato, endereço e identificação.'}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {isEditing ? (
          <Tabs
            value={activeTab}
            onValueChange={(v) => setActiveTab(v as 'dados' | 'historico')}
            className="w-full pt-1"
          >
            <TabsList className="grid grid-cols-2 bg-[#F8F5F0] border border-[#E5DFD5]">
              <TabsTrigger
                value="dados"
                className="text-xs data-[state=active]:bg-[#C6A664] data-[state=active]:text-white font-medium"
              >
                Dados Cadastrais
              </TabsTrigger>
              <TabsTrigger
                value="historico"
                className="text-xs data-[state=active]:bg-[#C6A664] data-[state=active]:text-white font-medium flex items-center gap-1.5"
              >
                <ShoppingBag className="h-3.5 w-3.5" />
                Histórico de Compras ({purchases.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="dados" className="pt-2">
              <form onSubmit={handleSubmit} className="space-y-4">
                <fieldset disabled={readOnly} className={readOnly ? 'opacity-60' : undefined}>
                  <CustomerFormFields
                    form={form}
                    onChange={handleFieldChange}
                    errors={errors}
                    clearError={clearError}
                  />
                </fieldset>

                <DialogFooter className="pt-3 gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={loading}
                    onClick={() => onOpenChange(false)}
                    className="border-[#E5DFD5]"
                  >
                    Cancelar
                  </Button>
                  {readOnly ? (
                    <CustomerNoEditNotice className="flex-1" />
                  ) : (
                    <Button
                      type="submit"
                      disabled={loading}
                      className="bg-gradient-to-r from-[#7A5C2E] to-[#C6A664] hover:opacity-90 text-white font-semibold"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Salvando...
                        </>
                      ) : (
                        'Salvar Alterações'
                      )}
                    </Button>
                  )}
                </DialogFooter>
              </form>
            </TabsContent>

            <TabsContent value="historico" className="pt-3 space-y-3">
              <div className="bg-[#FDFBF7] p-3 rounded-lg border border-[#E5DFD5] flex items-start gap-2 text-xs text-[#6B655E]">
                <Info className="h-4 w-4 text-[#C6A664] shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-[#2D2A26]">
                    Vínculo permanente pelo ID do Cliente ({customer?.id})
                  </p>
                  <p className="text-[11px] mt-0.5">
                    Todas as vendas e reservas realizadas no PDV são vinculadas diretamente a este
                    ID imutável. Mesmo que o CPF ou outros dados sejam alterados, o histórico de
                    compras é preservado integralmente.
                  </p>
                </div>
              </div>

              <CustomerPurchasesHistory sales={purchases} loading={loadingPurchases} />

              <DialogFooter className="pt-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  className="border-[#E5DFD5]"
                >
                  Fechar
                </Button>
              </DialogFooter>
            </TabsContent>
          </Tabs>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 pt-1">
            <CustomerFormFields
              form={form}
              onChange={handleFieldChange}
              errors={errors}
              clearError={clearError}
            />

            <DialogFooter className="pt-3 gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={loading}
                onClick={() => onOpenChange(false)}
                className="border-[#E5DFD5]"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={loading}
                className="bg-gradient-to-r from-[#7A5C2E] to-[#C6A664] hover:opacity-90 text-white font-semibold"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Salvando...
                  </>
                ) : (
                  'Cadastrar Cliente'
                )}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
