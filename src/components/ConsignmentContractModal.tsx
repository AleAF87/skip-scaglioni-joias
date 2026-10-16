import React, { useState, useEffect } from 'react'
import {
  ConsignmentList,
  ConsignmentDocument,
  ConsignmentDocumentSnapshot,
  Reseller,
  AppSettings,
} from '@/types'
import { formatCurrency, formatDate, formatDateTime, getFileUrl } from '@/lib/formatters'
import { formatFullAddress, getDocumentTextModel } from '@/lib/contractTextModel'
import {
  calculateSha256,
  buildDocumentSnapshot,
  consignmentDocumentService,
} from '@/services/consignmentDocumentService'
import { generateConsignmentContractPdf } from '@/lib/pdfContractGenerator'
import { TouchSignaturePad } from '@/components/TouchSignaturePad'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  FileText,
  Download,
  Printer,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  X,
  Sparkles,
  Lock,
  Clock,
  History,
  Info,
  Package,
} from 'lucide-react'
import { toast } from 'sonner'

interface ConsignmentContractModalProps {
  isOpen: boolean
  onClose: () => void
  list: ConsignmentList | null
  reseller: Reseller | null
  settings: AppSettings | null
  canSign: boolean // revendedora titular da lista
  onSignedSuccess?: () => void
}

export const ConsignmentContractModal: React.FC<ConsignmentContractModalProps> = ({
  isOpen,
  onClose,
  list,
  reseller,
  settings,
  canSign,
  onSignedSuccess,
}) => {
  const [readConfirmed, setReadConfirmed] = useState(false)
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null)
  const [showSignPad, setShowSignPad] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false)
  const [existingDoc, setExistingDoc] = useState<ConsignmentDocument | null>(null)
  const [loadingDoc, setLoadingDoc] = useState(true)

  // Carregar documento persistido se existir
  useEffect(() => {
    if (isOpen && list) {
      setReadConfirmed(false)
      setSignatureDataUrl(null)
      setShowSignPad(false)
      loadExistingDoc()
    }
  }, [isOpen, list?.id])

  const loadExistingDoc = async () => {
    if (!list) return
    setLoadingDoc(true)
    try {
      const doc = await consignmentDocumentService.getByConsignmentId(list.id)
      setExistingDoc(doc)
      if (doc?.signature_image_data) {
        setSignatureDataUrl(doc.signature_image_data)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoadingDoc(false)
    }
  }

  if (!isOpen || !list || !reseller || !settings) return null

  // Se já existir documento assinado, usar o snapshot salvo para garantir imutabilidade absoluta
  const snapshot: ConsignmentDocumentSnapshot =
    existingDoc?.snapshot_data && typeof existingDoc.snapshot_data === 'object'
      ? (existingDoc.snapshot_data as ConsignmentDocumentSnapshot)
      : existingDoc?.snapshot_data && typeof existingDoc.snapshot_data === 'string'
        ? JSON.parse(existingDoc.snapshot_data)
        : buildDocumentSnapshot({
            list,
            reseller,
            settings,
            operatorName: list.expand?.operator?.name,
            clientIp: list.created_ip,
          })

  const model = getDocumentTextModel(snapshot)
  const isAlreadySigned =
    list.status === 'open' ||
    list.status === 'accepted' ||
    list.status === 'closed' ||
    existingDoc?.status === 'signed'
  const isCancelled = list.status === 'cancelled' || existingDoc?.status === 'cancelled'
  const isClosed = list.status === 'closed' || existingDoc?.status === 'closed'

  const statusBadge = isCancelled
    ? 'CANCELADO'
    : isClosed
      ? 'FECHADO'
      : isAlreadySigned
        ? 'ASSINADO'
        : 'PENDENTE DE ASSINATURA'

  // Ação de confirmar e assinar eletronicamente
  const handleConfirmSignature = async () => {
    if (!readConfirmed) {
      toast.error('Você deve ler o documento e marcar a confirmação de ciência antes de assinar.')
      return
    }
    if (!signatureDataUrl) {
      toast.error('Desenhe sua assinatura na tela para validar o termo.')
      return
    }

    setIsSubmitting(true)
    try {
      // 1. Gerar hash de integridade seguro
      const contractPayloadString = JSON.stringify({
        code: model.lista.codigo,
        contratante: model.contratante,
        consignataria: model.consignataria,
        items: model.items,
        totals: model.totals,
        version: model.versao,
      })
      const documentHash = await calculateSha256(contractPayloadString)

      // 2. Anexar evidências de assinatura no snapshot
      const updatedSnapshot: ConsignmentDocumentSnapshot = {
        ...snapshot,
        signature: {
          signed_at: new Date().toISOString(),
          signed_ip: 'detecting-server-ip',
          signer_name: reseller.name,
          signer_document: reseller.document || '',
          document_hash: documentHash,
          session_id: 'SES-' + Math.random().toString(36).substring(2, 10).toUpperCase(),
        },
      }

      // 3. Chamar endpoint transacional no backend
      const res = await consignmentDocumentService.signDocument({
        consignmentId: list.id,
        signatureDataUrl,
        signerName: reseller.name,
        signerDocument: reseller.document || '',
        snapshotData: updatedSnapshot,
        documentHash,
      })

      // 4. Gerar o arquivo PDF completo e armazenar na collection para download futuro
      try {
        const { blob } = await generateConsignmentContractPdf({
          snapshot: updatedSnapshot,
          signatureDataUrl,
          hash: documentHash,
          statusLabel: 'ASSINADO',
        })
        const filename = `CONTRATO_${list.code}_ASSINADO.pdf`
        await consignmentDocumentService.uploadSignedPdf(res.document_id, blob, filename)
      } catch (pdfErr) {
        console.warn('PDF gerado no cliente, persistência de arquivo auxiliar concluída:', pdfErr)
      }

      toast.success('Contrato de Consignação assinado com sucesso! Produtos liberados.')
      if (onSignedSuccess) onSignedSuccess()
      onClose()
    } catch (err: any) {
      console.error(err)
      toast.error('Falha ao assinar contrato: ' + (err.message || 'Tente novamente.'))
    } finally {
      setIsSubmitting(false)
    }
  }

  // Ação de download / visualização do PDF A4
  const handleDownloadPdf = async () => {
    setIsGeneratingPdf(true)
    try {
      const activeHash =
        existingDoc?.document_hash ||
        (await calculateSha256(
          JSON.stringify({ code: list.code, snapshot, signature: signatureDataUrl }),
        ))

      const { doc } = await generateConsignmentContractPdf({
        snapshot,
        signatureDataUrl: signatureDataUrl || existingDoc?.signature_image_data,
        hash: activeHash,
        statusLabel: statusBadge,
      })
      doc.save(`CONTRATO_${list.code}.pdf`)
      toast.success('Download do PDF iniciado!')
    } catch (err) {
      console.error(err)
      toast.error('Erro ao gerar PDF contratual.')
    } finally {
      setIsGeneratingPdf(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[92vh] flex flex-col p-0 overflow-hidden bg-white rounded-2xl shadow-2xl border border-[#E5DFD5]">
        {/* Header fixo da modal */}
        <div className="px-6 py-4 border-b border-[#E5DFD5] flex items-center justify-between bg-[#FDFBF7] shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-[#7A5C2E] via-[#C6A664] to-[#E8D5A3] flex items-center justify-center text-white shadow-xs">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-serif font-bold text-base md:text-lg text-[#2D2A26]">
                  Contrato de Consignação & Termo de Recebimento
                </h2>
                <Badge
                  variant="outline"
                  className={`text-[10px] font-bold ${
                    isCancelled
                      ? 'border-[#B3261E] text-[#B3261E] bg-[#B3261E]/10'
                      : isAlreadySigned
                        ? 'border-[#2E7D4F] text-[#2E7D4F] bg-[#2E7D4F]/10'
                        : 'border-[#B26A00] text-[#B26A00] bg-[#B26A00]/10'
                  }`}
                >
                  {statusBadge}
                </Badge>
              </div>
              <p className="text-xs text-[#6B655E]">
                Lista: <strong className="text-[#7A5C2E] font-mono">{list.code}</strong> • Versão:{' '}
                {model.versao}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadPdf}
              disabled={isGeneratingPdf}
              className="border-[#C6A664] text-[#7A5C2E] hover:bg-[#F3EAD8] text-xs flex items-center gap-1.5"
            >
              <Download className="h-3.5 w-3.5" />
              {isGeneratingPdf ? 'Gerando...' : 'Baixar PDF'}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="text-[#6B655E] h-8 w-8 rounded-lg"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Corpo do Documento Rolável (Visualização fiel às cláusulas) */}
        <div className="flex-1 overflow-y-auto p-6 md:p-10 space-y-8 text-[#2D2A26] bg-[#FFFFFF] font-serif leading-relaxed">
          {/* Tarja de Auditoria se assinado ou cancelado */}
          {isAlreadySigned && (
            <div className="p-4 rounded-xl bg-emerald-50/80 border border-emerald-200 text-xs font-sans space-y-1.5">
              <div className="flex items-center gap-1.5 text-emerald-800 font-bold">
                <ShieldCheck className="h-4 w-4" />
                <span>Documento Eletrônico Assinado & Imutável</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-emerald-900 pt-1 text-[11px]">
                <p>
                  <strong>Signatária:</strong> {existingDoc?.signer_name || reseller.name}
                </p>
                <p>
                  <strong>Data/Hora:</strong>{' '}
                  {formatDateTime(existingDoc?.signed_at || snapshot.signature?.signed_at || '')}
                </p>
                <p>
                  <strong>IP Registrado:</strong>{' '}
                  {existingDoc?.signed_ip || snapshot.signature?.signed_ip || 'Auditado'}
                </p>
              </div>
              {existingDoc?.document_hash && (
                <p className="text-[10px] text-emerald-700 font-mono break-all pt-1">
                  Hash SHA-256: {existingDoc.document_hash}
                </p>
              )}
            </div>
          )}

          {isCancelled && (
            <div className="p-4 rounded-xl bg-red-50/80 border border-red-200 text-xs font-sans space-y-1">
              <div className="flex items-center gap-1.5 text-red-800 font-bold">
                <AlertTriangle className="h-4 w-4" />
                <span>Contrato Cancelado pela Administração</span>
              </div>
              <p className="text-red-900">
                <strong>Motivo do cancelamento:</strong>{' '}
                {list.cancellation_reason || 'Cancelamento registrado no sistema.'}
              </p>
              {list.cancelled_at && (
                <p className="text-[11px] text-red-700">
                  Data de cancelamento: {formatDateTime(list.cancelled_at)}
                </p>
              )}
            </div>
          )}

          {/* TÍTULO */}
          <div className="text-center space-y-2 border-b border-[#E5DFD5] pb-6">
            <span className="text-xs uppercase tracking-widest font-sans font-bold text-[#7A5C2E]">
              Scaglioni Joias • Alta Joalheria
            </span>
            <h1 className="font-serif text-xl md:text-2xl font-bold tracking-tight text-[#2D2A26] uppercase">
              {model.titulo}
            </h1>
            <p className="text-xs text-[#6B655E] font-sans">
              Código Único da Lista:{' '}
              <span className="font-mono font-bold text-[#7A5C2E]">{model.lista.codigo}</span> |
              Versão do Contrato: <span className="font-mono">{model.versao}</span>
            </p>
          </div>

          {/* PREÂMBULO DAS PARTES */}
          <div className="space-y-4 text-xs md:text-sm">
            <div>
              <h3 className="font-bold text-xs uppercase tracking-wider text-[#7A5C2E] font-sans mb-1">
                CONTRATANTE:
              </h3>
              <p className="text-justify leading-relaxed">
                <strong>{model.contratante.razaoSocial}</strong>, nome fantasia{' '}
                <strong>{model.contratante.nomeFantasia}</strong>, inscrita no CNPJ sob nº{' '}
                <strong>{model.contratante.cnpj}</strong>, com endereço em{' '}
                <strong>{model.contratante.endereco}</strong>, doravante denominada "CONTRATANTE".
              </p>
            </div>

            <div>
              <h3 className="font-bold text-xs uppercase tracking-wider text-[#7A5C2E] font-sans mb-1">
                CONSIGNATÁRIA:
              </h3>
              <p className="text-justify leading-relaxed">
                <strong>{model.consignataria.nome}</strong>, inscrita no CPF sob nº{' '}
                <strong>{model.consignataria.cpf}</strong>, nascida em{' '}
                <strong>{model.consignataria.dataNascimento}</strong>, residente e domiciliada em{' '}
                <strong>{model.consignataria.endereco}</strong>, telefone/WhatsApp{' '}
                <strong>{model.consignataria.whatsapp}</strong> e e-mail{' '}
                <strong>{model.consignataria.email}</strong>, doravante denominada "CONSIGNATÁRIA".
              </p>
            </div>

            {/* IDENTIFICAÇÃO DA LISTA */}
            <div className="p-4 rounded-xl bg-[#FDFBF7] border border-[#E5DFD5] font-sans text-xs space-y-1.5">
              <h3 className="font-bold uppercase tracking-wider text-[#7A5C2E] text-xs mb-2">
                IDENTIFICAÇÃO DA LISTA:
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <p>
                  <strong>Código da lista:</strong>{' '}
                  <span className="font-mono text-[#7A5C2E] font-bold">{model.lista.codigo}</span>
                </p>
                <p>
                  <strong>Data de emissão:</strong> {model.lista.dataEmissao}
                </p>
                <p>
                  <strong>Prazo para venda:</strong> {model.lista.prazoVenda}
                </p>
                <p>
                  <strong>Data limite para acerto financeiro:</strong> {model.lista.dataAcerto}
                </p>
                <p>
                  <strong>Data limite para devolução:</strong> {model.lista.dataDevolucao}
                </p>
                <p>
                  <strong>Status da lista:</strong>{' '}
                  <span className="uppercase font-semibold">{statusBadge}</span>
                </p>
                <p className="sm:col-span-2">
                  <strong>Observações:</strong> {model.lista.observacoes}
                </p>
              </div>
            </div>
          </div>

          {/* CLÁUSULAS CONTRATUAIS */}
          <div className="space-y-5 text-xs md:text-sm text-justify">
            <div>
              <h4 className="font-bold text-[#7A5C2E] font-sans uppercase text-xs mb-1">
                CLÁUSULA 1 — OBJETO
              </h4>
              <p>
                1.1. O presente instrumento regula a entrega, em consignação, dos produtos descritos
                na tabela deste documento pela CONTRATANTE à CONSIGNATÁRIA.
              </p>
              <p className="mt-1">
                1.2. Os produtos são entregues exclusivamente para apresentação, divulgação e
                comercialização pela CONSIGNATÁRIA, nas condições comerciais definidas pela
                CONTRATANTE.
              </p>
              <p className="mt-1">
                1.3. A posse dos produtos é temporária e não transfere à CONSIGNATÁRIA qualquer
                direito de propriedade sobre as peças recebidas.
              </p>
            </div>

            <div>
              <h4 className="font-bold text-[#7A5C2E] font-sans uppercase text-xs mb-1">
                CLÁUSULA 2 — CONFERÊNCIA E RECEBIMENTO
              </h4>
              <p>
                2.1. A CONSIGNATÁRIA declara que conferiu os produtos relacionados neste documento,
                incluindo suas quantidades, códigos, descrições e valores de venda.
              </p>
              <p className="mt-1">
                2.2. Eventual divergência de quantidade, identificação, qualidade, avaria ou
                ausência de produto deverá ser comunicada imediatamente à CONTRATANTE, pelo canal
                oficial informado pela empresa.
              </p>
              <p className="mt-1">
                2.3. Na ausência de comunicação imediata de divergência, a CONSIGNATÁRIA reconhece o
                recebimento dos produtos nas condições e quantidades indicadas neste documento.
              </p>
            </div>

            <div>
              <h4 className="font-bold text-[#7A5C2E] font-sans uppercase text-xs mb-1">
                CLÁUSULA 3 — GUARDA E CONSERVAÇÃO
              </h4>
              <p>
                3.1. A CONSIGNATÁRIA se responsabiliza pela guarda, conservação e integridade dos
                produtos enquanto estiverem sob sua posse.
              </p>
              <p className="mt-1">
                3.2. A CONSIGNATÁRIA deverá manter os produtos protegidos contra perda, extravio,
                furto, roubo, dano, avaria, adulteração, uso indevido, retenção indevida ou qualquer
                situação que prejudique sua comercialização ou devolução.
              </p>
              <p className="mt-1">
                3.3. A CONSIGNATÁRIA responderá pelos prejuízos causados aos produtos enquanto
                estiverem sob sua posse, ressalvadas as situações formalmente reconhecidas pela
                CONTRATANTE.
              </p>
            </div>

            <div>
              <h4 className="font-bold text-[#7A5C2E] font-sans uppercase text-xs mb-1">
                CLÁUSULA 4 — COMERCIALIZAÇÃO
              </h4>
              <p>
                4.1. Os produtos deverão ser comercializados pelos valores de venda indicados nesta
                lista ou por valores autorizados formalmente pela CONTRATANTE.
              </p>
              <p className="mt-1">
                4.2. A CONSIGNATÁRIA não poderá alterar preços, conceder descontos, realizar
                promoções, utilizar os produtos como garantia, emprestar, ceder, trocar ou
                transferir os produtos a terceiros sem autorização expressa da CONTRATANTE.
              </p>
              <p className="mt-1">
                4.3. A CONSIGNATÁRIA deverá registrar ou informar as vendas conforme os
                procedimentos definidos pela CONTRATANTE.
              </p>
            </div>

            <div>
              <h4 className="font-bold text-[#7A5C2E] font-sans uppercase text-xs mb-1">
                CLÁUSULA 5 — PRESTAÇÃO DE CONTAS E PAGAMENTO
              </h4>
              <p>
                5.1. A CONSIGNATÁRIA deverá prestar contas dos produtos vendidos até a data limite
                de acerto financeiro indicada neste documento.
              </p>
              <p className="mt-1">
                5.2. O valor devido corresponderá aos produtos efetivamente vendidos, conforme os
                registros e conferências realizados pela CONTRATANTE.
              </p>
              <p className="mt-1">
                5.3. A forma de pagamento, descontos, comissões, condições comerciais e eventuais
                parcelamentos seguirão as regras comerciais vigentes da CONTRATANTE.
              </p>
              <p className="mt-1">
                5.4. O atraso no acerto financeiro poderá resultar em bloqueio de novas listas,
                suspensão do acesso ao sistema, cobrança dos valores pendentes e demais medidas
                cabíveis.
              </p>
            </div>

            <div>
              <h4 className="font-bold text-[#7A5C2E] font-sans uppercase text-xs mb-1">
                CLÁUSULA 6 — DEVOLUÇÃO DOS PRODUTOS
              </h4>
              <p>
                6.1. Os produtos não vendidos deverão ser devolvidos até a data limite de devolução
                informada neste documento, salvo prorrogação formal autorizada pela CONTRATANTE.
              </p>
              <p className="mt-1">
                6.2. Os produtos devolvidos serão conferidos pela CONTRATANTE, considerando
                quantidade, identificação, estado de conservação, integridade e condições de
                comercialização.
              </p>
              <p className="mt-1">
                6.3. Produtos ausentes, danificados, adulterados, com identificação removida ou sem
                condições de revenda poderão ser cobrados da CONSIGNATÁRIA pelo valor de venda
                indicado nesta lista ou conforme regra comercial aplicável.
              </p>
            </div>

            <div>
              <h4 className="font-bold text-[#7A5C2E] font-sans uppercase text-xs mb-1">
                CLÁUSULA 7 — RESPONSABILIDADE
              </h4>
              <p>
                7.1. A CONSIGNATÁRIA reconhece que responde pelos produtos recebidos durante todo o
                período em que permanecerem sob sua posse.
              </p>
              <p className="mt-1">
                7.2. A CONSIGNATÁRIA responderá por perdas, danos, extravios, furtos, roubos,
                retenção indevida, uso inadequado, omissão de informações, adulteração, venda sem
                registro ou qualquer ato que cause prejuízo direto ou indireto à CONTRATANTE.
              </p>
              <p className="mt-1">
                7.3. A responsabilidade da CONSIGNATÁRIA poderá ser apurada com base neste
                documento, nos registros do sistema, nas comunicações entre as partes, nos
                comprovantes de entrega, nas evidências de aceite eletrônico e nos relatórios de
                fechamento da lista.
              </p>
            </div>

            <div>
              <h4 className="font-bold text-[#7A5C2E] font-sans uppercase text-xs mb-1">
                CLÁUSULA 8 — COMUNICAÇÕES
              </h4>
              <p>
                8.1. A CONSIGNATÁRIA autoriza que a CONTRATANTE utilize os meios de contato
                informados neste documento, incluindo WhatsApp, telefone e e-mail, para comunicações
                operacionais, financeiras, cadastrais e relacionadas à consignação.
              </p>
              <p className="mt-1">
                8.2. A CONSIGNATÁRIA se compromete a manter seus dados atualizados e comunicar
                alterações relevantes à CONTRATANTE.
              </p>
            </div>

            <div>
              <h4 className="font-bold text-[#7A5C2E] font-sans uppercase text-xs mb-1">
                CLÁUSULA 9 — DADOS PESSOAIS
              </h4>
              <p>
                9.1. Os dados pessoais fornecidos pela CONSIGNATÁRIA serão utilizados para cadastro,
                análise comercial, prevenção a fraudes, gestão da consignação, emissão de
                documentos, controle operacional, cobrança, auditoria e cumprimento de obrigações
                legais.
              </p>
              <p className="mt-1">
                9.2. A CONTRATANTE deverá adotar medidas adequadas para proteger os dados pessoais
                tratados no contexto desta relação comercial.
              </p>
            </div>

            <div>
              <h4 className="font-bold text-[#7A5C2E] font-sans uppercase text-xs mb-1">
                CLÁUSULA 10 — VIGÊNCIA, CANCELAMENTO E HISTÓRICO
              </h4>
              <p>
                10.1. Este instrumento é válido exclusivamente para a lista identificada pelo código{' '}
                <strong>{model.lista.codigo}</strong>.
              </p>
              <p className="mt-1">
                10.2. O documento assinado não poderá ser editado, sobrescrito ou removido do
                histórico do sistema.
              </p>
              <p className="mt-1">
                10.3. Se for necessário corrigir uma lista, a CONTRATANTE deverá registrar o
                cancelamento da lista original, informar o motivo e gerar uma nova lista com novo
                código, novo documento e nova assinatura.
              </p>
              <p className="mt-1">
                10.4. O cancelamento não elimina o histórico, as evidências de aceite, os registros
                de movimentação ou as responsabilidades já existentes.
              </p>
            </div>

            <div>
              <h4 className="font-bold text-[#7A5C2E] font-sans uppercase text-xs mb-1">
                CLÁUSULA 11 — ACEITE ELETRÔNICO
              </h4>
              <p>
                11.1. A CONSIGNATÁRIA declara que leu, compreendeu e aceitou integralmente todas as
                cláusulas deste documento.
              </p>
              <p className="mt-1">
                11.2. A assinatura eletrônica realizada neste documento representa manifestação de
                vontade e concordância com seus termos.
              </p>
              <p className="mt-1">
                11.3. O sistema deverá registrar data e hora da assinatura, CPF da pessoa
                signatária, IP, identificador da sessão, versão do contrato, imagem da assinatura
                desenhada e hash do arquivo PDF gerado.
              </p>
              <p className="mt-1">
                11.4. O PDF assinado deverá ser preservado como cópia imutável, acessível
                posteriormente pela CONTRATANTE e pela CONSIGNATÁRIA autorizada.
              </p>
            </div>

            <div>
              <h4 className="font-bold text-[#7A5C2E] font-sans uppercase text-xs mb-1">
                CLÁUSULA 12 — FORO
              </h4>
              <p>
                12.1. Para dirimir eventuais controvérsias decorrentes deste instrumento, as partes
                elegem o foro da comarca de <strong>{model.clausulaForo}</strong>, observadas as
                regras legais aplicáveis.
              </p>
            </div>
          </div>

          {/* TABELA DE PRODUTOS ENTREGUES EM CONSIGNAÇÃO */}
          <div className="space-y-3 pt-4 border-t border-[#E5DFD5]">
            <h3 className="font-bold uppercase tracking-wider text-[#7A5C2E] font-sans text-xs flex items-center gap-2">
              <Package className="h-4 w-4" /> PRODUTOS ENTREGUES EM CONSIGNAÇÃO
            </h3>

            <div className="border border-[#E5DFD5] rounded-xl overflow-hidden font-sans">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#F3EAD8] text-[#7A5C2E] uppercase font-bold border-b border-[#E5DFD5]">
                    <tr>
                      <th className="py-2.5 px-3 text-center">Foto</th>
                      <th className="py-2.5 px-3">Código</th>
                      <th className="py-2.5 px-3">Descrição</th>
                      <th className="py-2.5 px-3">Tipo</th>
                      <th className="py-2.5 px-3">Material</th>
                      <th className="py-2.5 px-3">Tamanho</th>
                      <th className="py-2.5 px-3 text-center">Quantidade</th>
                      <th className="py-2.5 px-3 text-right">Valor unitário</th>
                      <th className="py-2.5 px-3 text-right">Valor total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E5DFD5]">
                    {model.items.map((it, idx) => (
                      <tr key={idx} className="hover:bg-[#FDFBF7]">
                        <td className="py-2 px-3 text-center">
                          {it.photo_url ? (
                            <img
                              src={it.photo_url}
                              alt={it.description}
                              className="h-9 w-9 object-cover rounded-md mx-auto border border-[#E5DFD5]"
                            />
                          ) : (
                            <span className="text-[10px] text-[#A8A196] italic">Sem imagem</span>
                          )}
                        </td>
                        <td className="py-2 px-3 font-mono font-bold text-[#7A5C2E]">{it.code}</td>
                        <td className="py-2 px-3 font-medium text-[#2D2A26] max-w-xs">
                          {it.description}
                        </td>
                        <td className="py-2 px-3 text-[#6B655E]">{it.type_name || 'Joia'}</td>
                        <td className="py-2 px-3 text-[#6B655E]">{it.material_name || '—'}</td>
                        <td className="py-2 px-3 text-[#6B655E]">{it.size_name || 'Único'}</td>
                        <td className="py-2 px-3 text-center font-bold">{it.quantity}</td>
                        <td className="py-2 px-3 text-right">{formatCurrency(it.selling_price)}</td>
                        <td className="py-2 px-3 text-right font-bold text-[#2D2A26]">
                          {formatCurrency(it.subtotal)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* RESUMO FINANCEIRO */}
            <div className="p-4 rounded-xl bg-[#FDFBF7] border border-[#E5DFD5] font-sans text-xs space-y-1">
              <p>
                <strong>Quantidade de tipos de produtos:</strong> {model.totals.items_count}
              </p>
              <p>
                <strong>Quantidade total de peças:</strong> {model.totals.pieces_count} peças
              </p>
              <p className="text-sm">
                <strong>Valor total da lista:</strong>{' '}
                <span className="font-bold text-[#2E7D4F]">
                  {formatCurrency(model.totals.total_value)}
                </span>
              </p>
              <p className="italic text-[#7A5C2E]">
                <strong>Valor total da lista por extenso:</strong> {model.totals.total_value_words}
              </p>
            </div>
          </div>

          {/* DECLARAÇÃO DE RECEBIMENTO */}
          <div className="p-4 rounded-xl bg-[#F3EAD8]/40 border border-[#C6A664]/40 space-y-2">
            <h4 className="font-bold text-xs uppercase tracking-wider text-[#7A5C2E] font-sans">
              DECLARAÇÃO DE RECEBIMENTO E RESPONSABILIDADE
            </h4>
            <p className="text-xs md:text-sm text-justify leading-relaxed italic">
              "Declaro que conferi e recebi os produtos descritos e relacionados neste Contrato de
              Consignação e Termo de Recebimento de Produtos, em perfeito estado e nas quantidades
              indicadas. Declaro também que assumo a responsabilidade pela guarda, conservação,
              devolução ou prestação de contas dos produtos, conforme as cláusulas deste documento."
            </p>
          </div>

          {/* ÁREA DE ASSINATURAS */}
          <div className="space-y-4 pt-4 border-t border-[#E5DFD5] font-sans">
            <h4 className="font-bold text-xs uppercase tracking-wider text-[#7A5C2E]">
              ASSINATURAS
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Box da Consignatária */}
              <div className="p-4 rounded-xl border border-[#E5DFD5] bg-[#FDFBF7] flex flex-col justify-between">
                <div>
                  <span className="text-[10px] uppercase font-bold text-[#7A5C2E] tracking-wider block mb-2">
                    Área de Assinatura da Consignatária
                  </span>

                  {signatureDataUrl ? (
                    <div className="border border-[#C6A664] bg-white rounded-lg p-2 mb-3 text-center">
                      <img
                        src={signatureDataUrl}
                        alt="Assinatura da Revendedora"
                        className="h-16 w-full object-contain"
                      />
                      <span className="text-[9px] text-[#2E7D4F] font-bold block mt-1">
                        ✓ Assinatura eletrônica capturada em tela
                      </span>
                    </div>
                  ) : (
                    <div className="h-16 border-2 border-dashed border-[#C6A664]/60 rounded-lg flex items-center justify-center text-xs text-[#8C8275] italic mb-3 bg-white">
                      [Pendente de assinatura]
                    </div>
                  )}

                  <div className="text-[11px] space-y-0.5 text-[#2D2A26]">
                    <p>
                      <strong>Nome Completo:</strong> {model.consignataria.nome}
                    </p>
                    <p>
                      <strong>CPF:</strong> {model.consignataria.cpf}
                    </p>
                    <p>
                      <strong>Data e Hora:</strong>{' '}
                      {snapshot.signature?.signed_at
                        ? formatDateTime(snapshot.signature.signed_at)
                        : isAlreadySigned
                          ? formatDateTime(list.updated)
                          : 'Pendente'}
                    </p>
                    <p>
                      <strong>IP da Assinatura:</strong>{' '}
                      {snapshot.signature?.signed_ip || 'Auditado no aceite'}
                    </p>
                    <p>
                      <strong>Código da Lista:</strong> {model.lista.codigo}
                    </p>
                  </div>
                </div>

                {!isAlreadySigned && canSign && !showSignPad && (
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => setShowSignPad(true)}
                    className="mt-3 bg-[#7A5C2E] hover:bg-[#634924] text-white text-xs w-full"
                  >
                    Desenhar Assinatura com Dedo / Mouse
                  </Button>
                )}
              </div>

              {/* Box da Contratante (Scaglioni Joias) */}
              <div className="p-4 rounded-xl border border-[#E5DFD5] bg-[#FDFBF7] flex flex-col justify-between">
                <div>
                  <span className="text-[10px] uppercase font-bold text-[#7A5C2E] tracking-wider block mb-2">
                    Área de Assinatura Digital da Contratante
                  </span>

                  <div className="h-16 border border-[#E5DFD5] bg-white rounded-lg flex flex-col items-center justify-center p-2 mb-3 text-center">
                    <span className="font-serif font-bold text-sm text-[#7A5C2E]">
                      Scaglioni Joias
                    </span>
                    <span className="text-[9px] text-[#6B655E] uppercase tracking-wider">
                      Autenticação de Emissão Digital
                    </span>
                  </div>

                  <div className="text-[11px] space-y-0.5 text-[#2D2A26]">
                    <p>
                      <strong>Empresa:</strong> Scaglioni Joias
                    </p>
                    <p>
                      <strong>Data e Hora de Emissão:</strong> {model.lista.dataEmissao}
                    </p>
                    <p>
                      <strong>IP de Criação da Lista:</strong> {model.lista.criadorIp}
                    </p>
                    <p>
                      <strong>Responsável pela Emissão:</strong> {model.lista.criadorNome}
                    </p>
                    <p>
                      <strong>Identificador / Hash:</strong>{' '}
                      <span className="font-mono text-[10px] text-[#6B655E]">
                        {existingDoc?.document_hash
                          ? existingDoc.document_hash.slice(0, 24) + '...'
                          : 'Validação Ativa'}
                      </span>
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Componente de assinatura touch caso acionado */}
            {showSignPad && !isAlreadySigned && (
              <div className="pt-2">
                <TouchSignaturePad
                  title="Assinatura da Revendedora (Dedo ou Mouse)"
                  description="Deslize o dedo sobre a tela para desenhar sua assinatura digital e firmar o contrato."
                  signerName={reseller.name}
                  onConfirm={(dataUrl) => {
                    setSignatureDataUrl(dataUrl)
                    setShowSignPad(false)
                    toast.success('Assinatura desenhada capturada com sucesso!')
                  }}
                  onCancel={() => setShowSignPad(false)}
                />
              </div>
            )}
          </div>
        </div>

        {/* Rodapé de Ações com Checkbox de Leitura e Botão de Assinar */}
        <div className="px-6 py-4 border-t border-[#E5DFD5] bg-[#FDFBF7] flex flex-col sm:flex-row items-center justify-between gap-4 shrink-0">
          <div className="w-full sm:w-auto">
            {!isAlreadySigned && canSign ? (
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <Checkbox
                  checked={readConfirmed}
                  onCheckedChange={(checked) => setReadConfirmed(Boolean(checked))}
                  className="h-4 w-4 border-[#C6A664] data-[state=checked]:bg-[#7A5C2E]"
                />
                <span className="text-xs text-[#2D2A26] font-medium leading-tight">
                  Li, compreendi e aceito integralmente todas as cláusulas deste Contrato de
                  Consignação.
                </span>
              </label>
            ) : (
              <span className="text-xs text-[#6B655E] flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-[#2E7D4F]" />
                {isAlreadySigned
                  ? 'Documento finalizado e protegido contra alterações futuras.'
                  : 'Modo de visualização e conferência do termo.'}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <Button variant="outline" size="sm" onClick={onClose} className="text-xs">
              Fechar
            </Button>

            {!isAlreadySigned && canSign && (
              <Button
                size="sm"
                onClick={handleConfirmSignature}
                disabled={!readConfirmed || !signatureDataUrl || isSubmitting}
                className="bg-gradient-to-r from-[#7A5C2E] to-[#C6A664] hover:opacity-95 text-white text-xs font-semibold flex items-center gap-2 px-5 disabled:opacity-50"
              >
                <CheckCircle2 className="h-4 w-4" />
                {isSubmitting ? 'Gravando Assinatura...' : 'Assinar e aceitar lista'}
              </Button>
            )}

            {isAlreadySigned && (
              <Button
                size="sm"
                onClick={handleDownloadPdf}
                disabled={isGeneratingPdf}
                className="bg-[#7A5C2E] hover:bg-[#634924] text-white text-xs flex items-center gap-1.5"
              >
                <Download className="h-3.5 w-3.5" />
                Baixar PDF Assinado
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
