import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Printer, X, Save, Package } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ResellerDelivery, AppSettings } from '@/types'
import {
  formatCurrency,
  formatDateTime,
  formatPhone,
  getProductDisplayPhoto,
} from '@/lib/formatters'
import { valorPorExtenso } from '@/lib/numberToWords'
import { companySettingsService } from '@/services/companySettingsService'
import { compressSignatureDataUrl } from '@/lib/signatureCompression'
import { LOGO_ICON_URL } from '@/constants/branding'
import pb from '@/lib/pocketbase/client'

interface DeliveryConsignmentTermModalProps {
  delivery: ResellerDelivery | null
  isOpen: boolean
  onClose: () => void
  /** Chamado após salvar o texto do termo na entrega (recebe o texto gravado) */
  onSaved?: (termText: string) => void
}

const DEFAULT_TERM_TEXT = `Eu, portador(a) dos dados pessoais identificados nesta via, declaro ter recebido da empresa acima identificada, em consignação, a maleta com os produtos relacionados na tabela acima, em perfeito estado de conservação e funcionamento, conferindo e concordando com as quantidades e valores discriminados.

Declaro estar ciente de que os produtos permanecem em meu poder sob minha guarda e exclusiva responsabilidade enquanto estiverem consignados, comprometendo-me a: (i) revendê-los e prestar contas das vendas realizadas; (ii) devolvê-los à empresa, no mesmo estado em que os recebi, imediatamente quando solicitado; e (iii) acertar financeiramente com a empresa os produtos vendidos e/ou não devolvidos, nos prazos combinados.`

function useEscapeToClose(isOpen: boolean, onClose: () => void, skip: boolean) {
  useEffect(() => {
    if (!isOpen || skip) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen, onClose, skip])
}

export const DeliveryConsignmentTermModal: React.FC<DeliveryConsignmentTermModalProps> = ({
  delivery,
  isOpen,
  onClose,
  onSaved,
}) => {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [termText, setTermText] = useState('')
  const [saving, setSaving] = useState(false)
  const [savedOnce, setSavedOnce] = useState(false)
  const [printing, setPrinting] = useState(false)
  const skipCloseOnPrintRef = useRef(false)

  useEscapeToClose(isOpen, onClose, printing)

  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    setSavedOnce(false)
    setTermText(delivery?.term_text || DEFAULT_TERM_TEXT)
    companySettingsService
      .getSettings()
      .then((s) => {
        if (!cancelled) setSettings(s)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [isOpen, delivery?.id, delivery?.term_text])

  useEffect(() => {
    return () => {
      document.body.style.removeProperty('overflow')
    }
  }, [])

  const items = delivery?.items || []

  const totals = useMemo(() => {
    let pieces = 0
    let total = 0
    let types = 0
    for (const it of items) {
      if (!it) continue
      types += 1
      pieces += Number(it.quantity) || 0
      total += Number(it.subtotal) || 0
    }
    if (total === 0 && items.length > 0) {
      total = items.reduce(
        (acc, it) => acc + (Number(it.quantity) || 0) * (Number(it.selling_price) || 0),
        0,
      )
    }
    return { types, pieces, total }
  }, [items])

  const reseller = delivery?.expand?.reseller

  const handleSave = async () => {
    if (!delivery || saving) return
    setSaving(true)
    try {
      let text = termText
      try {
        const compact = await compressSignatureDataUrl(text)
        if (compact && compact.length < text.length) text = compact
      } catch {
        /* compactação é opcional */
      }
      await pb.collection('reseller_deliveries').update(delivery.id, { term_text: text })
      setSavedOnce(true)
      onSaved?.(text)
    } finally {
      setSaving(false)
    }
  }

  const handlePrint = async () => {
    if (printing) return
    setPrinting(true)
    skipCloseOnPrintRef.current = true
    try {
      if (delivery && termText !== (delivery.term_text || DEFAULT_TERM_TEXT)) {
        try {
          await pb.collection('reseller_deliveries').update(delivery.id, { term_text: termText })
          setSavedOnce(true)
          onSaved?.(termText)
        } catch {
          /* impressão segue */
        }
      }
      document.body.style.setProperty('overflow', 'hidden')
      await new Promise((r) => setTimeout(r, 80))
      window.print()
      await new Promise((r) => setTimeout(r, 150))
    } finally {
      document.body.style.removeProperty('overflow')
      setPrinting(false)
    }
  }

  if (!isOpen || !delivery) return null

  const resellerName = reseller?.name || delivery.signer_name || ''

  const signatureUrl = (() => {
    const sig = delivery.signature_data
    if (!sig) return ''
    if (sig.startsWith('data:image')) return sig
    if (sig.startsWith('http')) return sig
    return ''
  })()

  const productPhoto = (productId?: string, variationId?: string): string => {
    if (variationId) {
      const variations = (delivery as any).expand?.['product_variations(product)'] as
        | Array<{ id: string; image_url?: string }>
        | undefined
      const v = variations?.find((x) => x?.id === variationId)
      if (v?.image_url) return v.image_url
    }
    const prod = (delivery as any).expand?.['products']?.find?.(
      (p: { id?: string }) => p?.id === productId,
    )
    if (prod) {
      const url = getProductDisplayPhoto(prod)
      if (url) return url
    }
    return ''
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-[#2D2A26]/60 backdrop-blur-xs overflow-y-auto print:p-0 print:bg-white print:fixed print:inset-0"
      role="dialog"
      aria-modal="true"
      aria-label="Termo de Recebimento de Maleta"
    >
      <div className="relative w-full max-w-4xl bg-white rounded-2xl shadow-2xl border border-[#E5DFD5] overflow-hidden flex flex-col max-h-[92dvh] print:max-w-none print:max-h-none print:shadow-none print:border-none print:rounded-none print:m-0">
        {/* Header bar (somente tela) */}
        <div className="px-5 py-4 border-b border-[#E5DFD5] flex items-center justify-between bg-[#FDFBF7] print:hidden">
          <div className="flex items-center gap-2 text-[#7A5C2E]">
            <Package className="h-5 w-5" />
            <h2 className="font-serif font-bold text-lg text-[#2D2A26]">
              Termo de Recebimento de Maleta
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleSave}
              disabled={saving}
              className="border-[#C6A664] text-[#7A5C2E] hover:bg-[#F3EAD8] text-xs flex items-center gap-1.5"
            >
              <Save className="h-3.5 w-3.5" />
              {saving ? 'Salvando…' : savedOnce ? 'Texto salvo' : 'Salvar texto'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handlePrint}
              className="border-[#C6A664] text-[#7A5C2E] hover:bg-[#F3EAD8] text-xs flex items-center gap-1.5"
            >
              <Printer className="h-3.5 w-3.5" />
              Imprimir / Salvar como PDF
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              aria-label="Fechar"
              className="text-[#6B655E] h-8 w-8 rounded-lg"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Corpo imprimível A4 retrato */}
        <div className="overflow-y-auto p-4 sm:p-6 bg-[#F7F4EE] print:overflow-visible print:p-0 print:bg-white">
          <div
            id="delivery-consignment-term-print-area"
            className="mx-auto bg-white text-[#2D2A26] shadow print:shadow-none w-full max-w-[820px] print:max-w-none px-6 py-8 sm:px-10 sm:py-12 print:px-0 print:py-0"
          >
            {/* Cabeçalho da empresa */}
            <div className="flex items-start justify-between gap-4 border-b-2 border-[#7A5C2E] pb-4">
              <div className="flex items-start gap-3">
                <img
                  src={LOGO_ICON_URL}
                  alt="Logotipo da empresa"
                  width={48}
                  height={48}
                  className="h-12 w-12 object-contain rounded-lg border border-[#E5DFD5] bg-white p-1"
                />
                <div>
                  <p className="font-serif text-lg font-bold leading-tight text-[#2D2A26]">
                    {settings?.company_trade_name || 'Scaglioni Joias'}
                  </p>
                  {settings?.company_legal_name && (
                    <p className="text-[11px] text-[#6B655E]">{settings.company_legal_name}</p>
                  )}
                  {settings?.company_cnpj && (
                    <p className="text-[11px] text-[#6B655E]">CNPJ: {settings.company_cnpj}</p>
                  )}
                  <p className="text-[11px] text-[#6B655E]">
                    {[settings?.company_address_city, settings?.company_address_state]
                      .filter(Boolean)
                      .join(' / ')}
                  </p>
                  <p className="text-[11px] text-[#6B655E]">
                    {[settings?.company_phone, settings?.company_email].filter(Boolean).join(' • ')}
                  </p>
                </div>
              </div>
              <div className="text-right shrink-0">
                <p className="text-[10px] uppercase tracking-widest text-[#7A5C2E] font-semibold">
                  Romaneio
                </p>
                <p className="font-mono text-sm font-bold text-[#2D2A26]">{delivery.code}</p>
                <p className="text-[11px] text-[#6B655E]">
                  Data: {formatDateTime(delivery.created)}
                </p>
                {(delivery.expand?.operator?.name || delivery.expand?.operator?.email) && (
                  <p className="text-[11px] text-[#6B655E]">
                    Operador: {delivery.expand?.operator?.name || delivery.expand?.operator?.email}
                  </p>
                )}
              </div>
            </div>

            {/* Título */}
            <h1 className="text-center font-serif text-base font-bold uppercase tracking-wide text-[#2D2A26] mt-5">
              Romaneio e Termo de Responsabilidade de Entrega de Maleta
            </h1>

            {/* Dados da revendedora */}
            <div className="mt-4 text-[12px] leading-relaxed">
              <p>
                <span className="font-semibold text-[#7A5C2E]">Revendedora:</span>{' '}
                <span className="font-bold">{resellerName || '—'}</span>
                {reseller?.document && (
                  <>
                    {' '}
                    • <span className="text-[#6B655E]">CPF/CNPJ:</span> {reseller.document}
                  </>
                )}
                {reseller?.phone && (
                  <>
                    {' '}
                    • <span className="text-[#6B655E]">Tel:</span> {formatPhone(reseller.phone)}
                  </>
                )}
              </p>
              {(reseller?.city || reseller?.state) && (
                <p>
                  <span className="text-[#6B655E]">Cidade/UF:</span>{' '}
                  {[reseller.city, reseller.state].filter(Boolean).join('/')}
                </p>
              )}
            </div>

            {/* Tabela de produtos */}
            <table className="w-full mt-4 text-[11px] border-collapse border border-[#E5DFD5]">
              <thead className="print:table-header-group bg-[#F3EAD8] text-[#7A5C2E]">
                <tr className="border-b border-[#E5DFD5]">
                  <th className="p-2 text-center w-[52px]">Foto</th>
                  <th className="p-2 text-left">Produto</th>
                  <th className="p-2 text-left">Código</th>
                  <th className="p-2 text-left">Variação</th>
                  <th className="p-2 text-center">Qtde</th>
                  <th className="p-2 text-right">Vlr unit.</th>
                  <th className="p-2 text-right">Subtotal</th>
                  <th className="p-2 text-center w-12">Entregue</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-3 text-center text-[#6B655E]">
                      Nenhum produto registrado nesta entrega.
                    </td>
                  </tr>
                ) : (
                  items.map((item, index) => {
                    const photo = productPhoto(item?.product_id, item?.variation_id)
                    return (
                      <tr
                        key={`${item?.product_id || 'item'}-${index}`}
                        className="border-b border-[#E5DFD5] break-inside-avoid"
                      >
                        <td className="p-1.5 text-center align-middle">
                          {photo ? (
                            <img
                              src={photo}
                              alt={item?.description || 'Produto da entrega'}
                              width={36}
                              height={36}
                              loading="lazy"
                              className="w-9 h-9 object-cover rounded border border-[#E5DFD5] mx-auto bg-white"
                            />
                          ) : (
                            <span className="text-[9px] text-[#B0A99E] italic">Sem foto</span>
                          )}
                        </td>
                        <td className="p-2 font-medium align-middle">{item?.description || '—'}</td>
                        <td className="p-2 font-mono align-middle">{item?.code || '—'}</td>
                        <td className="p-2 align-middle">{item?.variation_sku || '—'}</td>
                        <td className="p-2 text-center align-middle font-semibold">
                          {item?.quantity ?? 0}
                        </td>
                        <td className="p-2 text-right align-middle">
                          {formatCurrency(item?.selling_price)}
                        </td>
                        <td className="p-2 text-right align-middle font-semibold">
                          {formatCurrency(
                            item?.subtotal ??
                              (Number(item?.quantity) || 0) * (Number(item?.selling_price) || 0),
                          )}
                        </td>
                        <td className="p-2 text-center align-middle text-base text-[#7A5C2E]">☐</td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>

            {/* Texto de responsabilidade EDITÁVEL */}
            <div className="mt-5 print:mt-4">
              <div className="flex items-center justify-between print:hidden">
                <p className="text-[11px] font-semibold text-[#7A5C2E] uppercase tracking-wide">
                  Texto de responsabilidade (editável)
                </p>
                <span className="text-[10px] text-[#6B655E]">
                  Salvo na entrega ao salvar/imprimir
                </span>
              </div>
              <Textarea
                id="term-text-area"
                value={termText}
                onChange={(e) => setTermText(e.target.value)}
                rows={6}
                aria-label="Texto de responsabilidade do termo"
                className="mt-1 min-h-[120px] text-[12px] leading-relaxed bg-white border-[#E5DFD5] resize-y print:hidden"
              />
              <div className="hidden print:block whitespace-pre-wrap text-[11.5px] leading-relaxed text-[#2D2A26] mt-3 border-t border-[#E5DFD5] pt-3 break-inside-avoid">
                {termText}
              </div>
            </div>

            {/* Rodapé: totais */}
            <div className="mt-5 print:mt-4 grid grid-cols-1 gap-1 text-[12px] break-inside-avoid bg-[#FDFBF7] p-3 rounded-lg border border-[#E5DFD5]">
              <p>
                <span className="font-semibold text-[#7A5C2E]">Total de tipos:</span>{' '}
                <span className="font-bold">{totals.types}</span>
              </p>
              <p>
                <span className="font-semibold text-[#7A5C2E]">Total de peças:</span>{' '}
                <span className="font-bold">{totals.pieces}</span>
              </p>
              <p>
                <span className="font-semibold text-[#7A5C2E]">Valor total consignado:</span>{' '}
                <span className="font-bold text-sm text-[#7A5C2E]">
                  {formatCurrency(totals.total)}
                </span>
              </p>
              <p className="text-[11.5px] text-[#2D2A26]">
                <span className="font-semibold text-[#7A5C2E]">Valor por extenso:</span>{' '}
                {valorPorExtenso(totals.total)}
              </p>
            </div>

            {/* Assinaturas */}
            <div className="mt-8 print:mt-6 grid grid-cols-1 sm:grid-cols-2 gap-8 break-inside-avoid">
              {/* Assinatura da revendedora */}
              <div className="flex flex-col items-center justify-end">
                {signatureUrl ? (
                  <img
                    src={signatureUrl}
                    alt="Assinatura digital da revendedora"
                    className="h-14 object-contain max-w-full"
                  />
                ) : (
                  <div className="h-14" />
                )}
                <div className="w-full border-t border-[#2D2A26] pt-1 mt-0.5 text-center">
                  <p className="text-[11px] font-bold text-[#2D2A26]">
                    {resellerName || 'Assinatura da revendedora'}
                  </p>
                  {delivery.signed_at && (
                    <p className="text-[10px] text-[#6B655E]">
                      Assinado em: {formatDateTime(delivery.signed_at)}
                    </p>
                  )}
                </div>
              </div>

              {/* Assinatura do responsável/operador */}
              <div className="flex flex-col items-center justify-end">
                <div className="h-14" />
                <div className="w-full border-t border-[#2D2A26] pt-1 mt-0.5 text-center">
                  <p className="text-[11px] font-bold text-[#2D2A26]">
                    {delivery.expand?.operator?.name ||
                      delivery.expand?.operator?.email ||
                      'Responsável pela entrega'}
                  </p>
                  <p className="text-[10px] text-[#6B655E]">Scaglioni Joias</p>
                </div>
              </div>
            </div>

            <p className="mt-6 text-center text-[10px] text-[#6B655E]">
              Documento gerado pelo sistema Scaglioni Joias — Entrega {delivery.code}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
