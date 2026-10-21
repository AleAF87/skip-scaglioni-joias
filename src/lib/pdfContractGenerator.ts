import { ConsignmentDocumentSnapshot } from '@/types'
import { getDocumentTextModel } from './contractTextModel'
import { formatCurrency, formatDateTime } from './formatters'
import { LOGO_ICON_URL } from '@/constants/branding'

/**
 * Carrega a biblioteca jsPDF dinamicamente do CDN oficial (jsdelivr/unpkg)
 * sem precisar modificar dependências locais ou quebrar compilações.
 */
let jsPdfPromise: Promise<any> | null = null

function loadJsPdf(): Promise<any> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('jsPDF só pode ser executado no navegador.'))
  }

  const win = window as any
  if (win.jspdf && win.jspdf.jsPDF) {
    return Promise.resolve(win.jspdf.jsPDF)
  }

  if (jsPdfPromise) return jsPdfPromise

  jsPdfPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js'
    script.crossOrigin = 'anonymous'
    script.onload = () => {
      if (win.jspdf && win.jspdf.jsPDF) {
        resolve(win.jspdf.jsPDF)
      } else {
        reject(new Error('jsPDF não encontrado no escopo global após carregamento.'))
      }
    }
    script.onerror = () => {
      // Fallback para unpkg
      const fallbackScript = document.createElement('script')
      fallbackScript.src = 'https://unpkg.com/jspdf@2.5.2/dist/jspdf.umd.min.js'
      fallbackScript.onload = () => {
        if (win.jspdf && win.jspdf.jsPDF) {
          resolve(win.jspdf.jsPDF)
        } else {
          reject(new Error('Falha ao carregar script do jsPDF.'))
        }
      }
      fallbackScript.onerror = () => reject(new Error('Falha na rede ao carregar jsPDF.'))
      document.head.appendChild(fallbackScript)
    }
    document.head.appendChild(script)
  })

  return jsPdfPromise
}

/**
 * Converte uma URL de imagem para base64/dataURL para inclusão no PDF
 */
async function getBase64ImageFromUrl(imageUrl: string): Promise<string | null> {
  if (!imageUrl) return null
  if (imageUrl.startsWith('data:image')) return imageUrl

  try {
    const res = await fetch(imageUrl, { mode: 'cors' })
    if (!res.ok) return null
    const blob = await res.blob()
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result as string)
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    })
  } catch (_) {
    return null
  }
}

/**
 * Gera o documento contratual completo e paginado em PDF (padrão A4 profissional).
 * Inclui cabeçalho de página, numeração (Página X de Y), layout de alta elegância,
 * tabela com repetição de cabeçalho, quebra de página automática e assinaturas.
 */
export async function generateConsignmentContractPdf(params: {
  snapshot: ConsignmentDocumentSnapshot
  signatureDataUrl?: string
  hash: string
  statusLabel?: string
}): Promise<{ doc: any; blob: Blob; dataUri: string }> {
  const jsPDF = await loadJsPdf()
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  })

  const { snapshot, signatureDataUrl, hash, statusLabel } = params
  const model = getDocumentTextModel(snapshot)

  // Medidas da página A4
  const pageWidth = 210
  const pageHeight = 297
  const marginLeft = 18
  const marginRight = 18
  const contentWidth = pageWidth - marginLeft - marginRight
  const bottomMargin = 22
  let currentY = 22

  // Função auxiliar para quebra de página
  const checkPageBreak = (neededHeight: number) => {
    if (currentY + neededHeight > pageHeight - bottomMargin) {
      doc.addPage()
      currentY = 22
      return true
    }
    return false
  }

  // --- CABEÇALHO DO DOCUMENTO (PÁGINA 1) ---
  doc.setFillColor(0, 0, 0) // Fundo preto institucional da Scaglioni
  doc.rect(marginLeft, currentY, contentWidth, 24, 'F')
  doc.setDrawColor(198, 166, 100) // Dourado Scaglioni (#C6A664)
  doc.setLineWidth(0.4)
  doc.rect(marginLeft, currentY, contentWidth, 24, 'S')

  // Inserir miniatura do ícone/logo no PDF se disponível
  try {
    const logoBase64 = await getBase64ImageFromUrl(LOGO_ICON_URL)
    if (logoBase64) {
      doc.addImage(logoBase64, 'PNG', marginLeft + 4, currentY + 3.5, 17, 17)
    }
  } catch {
    /* ignore */
  }

  const textStartX = marginLeft + 24
  doc.setFont('times', 'bold')
  doc.setFontSize(13)
  doc.setTextColor(198, 166, 100) // Dourado (#C6A664)
  doc.text('SCAGLIONI JOIAS', textStartX, currentY + 9)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(243, 234, 216)
  doc.text('ALTA JOALHERIA • CONTRATO ELETRÔNICO DE CONSIGNAÇÃO', textStartX, currentY + 15)

  // Status Badge no topo direito
  const badgeText = (statusLabel || model.lista.status || 'PENDENTE DE ASSINATURA').toUpperCase()
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  if (
    badgeText.includes('ASSINADO') ||
    badgeText.includes('ABERTA') ||
    badgeText.includes('OPEN')
  ) {
    doc.setTextColor(46, 125, 79) // Verde
  } else if (badgeText.includes('CANCELAD')) {
    doc.setTextColor(179, 38, 30) // Vermelho
  } else {
    doc.setTextColor(178, 106, 0) // Âmbar
  }
  doc.text(badgeText, pageWidth - marginRight - 5, currentY + 9, { align: 'right' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(107, 101, 94)
  doc.text(
    `Código: ${model.lista.codigo} | Versão: ${model.versao}`,
    pageWidth - marginRight - 5,
    currentY + 15,
    { align: 'right' },
  )

  currentY += 30

  // Título do Documento
  doc.setFont('times', 'bold')
  doc.setFontSize(13)
  doc.setTextColor(45, 42, 38)
  const titleLines = doc.splitTextToSize(model.titulo, contentWidth)
  doc.text(titleLines, pageWidth / 2, currentY, { align: 'center' })
  currentY += titleLines.length * 5 + 4

  // Divisória decorativa dourada
  doc.setDrawColor(198, 166, 100)
  doc.setLineWidth(0.5)
  doc.line(marginLeft + 25, currentY, pageWidth - marginRight - 25, currentY)
  currentY += 7

  // Helper para seções com título dourado
  const renderSectionHeader = (title: string) => {
    checkPageBreak(12)
    doc.setFont('times', 'bold')
    doc.setFontSize(10.5)
    doc.setTextColor(122, 92, 46) // #7A5C2E
    doc.text(title, marginLeft, currentY)
    currentY += 4.5
  }

  const renderParagraph = (text: string, isBold = false) => {
    doc.setFont('times', isBold ? 'bold' : 'normal')
    doc.setFontSize(8.5)
    doc.setTextColor(45, 42, 38)
    const lines = doc.splitTextToSize(text, contentWidth)
    checkPageBreak(lines.length * 3.8 + 2)
    doc.text(lines, marginLeft, currentY)
    currentY += lines.length * 3.8 + 2.5
  }

  // --- CONTRATANTE ---
  renderSectionHeader('CONTRATANTE:')
  renderParagraph(
    `${model.contratante.razaoSocial}, nome fantasia ${model.contratante.nomeFantasia}, inscrita no CNPJ sob nº ${model.contratante.cnpj}, com endereço em ${model.contratante.endereco}, doravante denominada "CONTRATANTE".`,
  )

  // --- CONSIGNATÁRIA ---
  renderSectionHeader('CONSIGNATÁRIA:')
  renderParagraph(
    `${model.consignataria.nome}, inscrita no CPF sob nº ${model.consignataria.cpf}, nascida em ${model.consignataria.dataNascimento}, residente e domiciliada em ${model.consignataria.endereco}, telefone/WhatsApp ${model.consignataria.whatsapp} e e-mail ${model.consignataria.email}, doravante denominada "CONSIGNATÁRIA".`,
  )

  // --- IDENTIFICAÇÃO DA LISTA ---
  renderSectionHeader('IDENTIFICAÇÃO DA LISTA:')
  const idListText = [
    `Código da lista: ${model.lista.codigo}`,
    `Data de emissão: ${model.lista.dataEmissao}`,
    `Prazo para venda: ${model.lista.prazoVenda}`,
    `Data limite para acerto financeiro: ${model.lista.dataAcerto}`,
    `Data limite para devolução: ${model.lista.dataDevolucao}`,
    `Observações: ${model.lista.observacoes}`,
  ].join('\n')
  renderParagraph(idListText)

  // --- CLÁUSULAS CONTRATUAIS ---
  const clausulas = [
    {
      titulo: 'CLÁUSULA 1 — OBJETO',
      texto:
        '1.1. O presente instrumento regula a entrega, em consignação, dos produtos descritos na tabela deste documento pela CONTRATANTE à CONSIGNATÁRIA.\n1.2. Os produtos são entregues exclusivamente para apresentação, divulgação e comercialização pela CONSIGNATÁRIA, nas condições comerciais definidas pela CONTRATANTE.\n1.3. A posse dos produtos é temporária e não transfere à CONSIGNATÁRIA qualquer direito de propriedade sobre as peças recebidas.',
    },
    {
      titulo: 'CLÁUSULA 2 — CONFERÊNCIA E RECEBIMENTO',
      texto:
        '2.1. A CONSIGNATÁRIA declara que conferiu os produtos relacionados neste documento, incluindo suas quantidades, códigos, descrições e valores de venda.\n2.2. Eventual divergência de quantidade, identificação, qualidade, avaria ou ausência de produto deverá ser comunicada imediatamente à CONTRATANTE, pelo canal oficial informado pela empresa.\n2.3. Na ausência de comunicação imediata de divergência, a CONSIGNATÁRIA reconhece o recebimento dos produtos nas condições e quantidades indicadas neste documento.',
    },
    {
      titulo: 'CLÁUSULA 3 — GUARDA E CONSERVAÇÃO',
      texto:
        '3.1. A CONSIGNATÁRIA se responsabiliza pela guarda, conservação e integridade dos produtos enquanto estiverem sob sua posse.\n3.2. A CONSIGNATÁRIA deverá manter os produtos protegidos contra perda, extravio, furto, roubo, dano, avaria, adulteração, uso indevido, retenção indevida ou qualquer situação que prejudique sua comercialização ou devolução.\n3.3. A CONSIGNATÁRIA responderá pelos prejuízos causados aos produtos enquanto estiverem sob sua posse, ressalvadas as situações formalmente reconhecidas pela CONTRATANTE.',
    },
    {
      titulo: 'CLÁUSULA 4 — COMERCIALIZAÇÃO',
      texto:
        '4.1. Os produtos deverão ser comercializados pelos valores de venda indicados nesta lista ou por valores autorizados formalmente pela CONTRATANTE.\n4.2. A CONSIGNATÁRIA não poderá alterar preços, conceder descontos, realizar promoções, utilizar os produtos como garantia, emprestar, ceder, trocar ou transferir os produtos a terceiros sem autorização expressa da CONTRATANTE.\n4.3. A CONSIGNATÁRIA deverá registrar ou informar as vendas conforme os procedimentos definidos pela CONTRATANTE.',
    },
    {
      titulo: 'CLÁUSULA 5 — PRESTAÇÃO DE CONTAS E PAGAMENTO',
      texto:
        '5.1. A CONSIGNATÁRIA deverá prestar contas dos produtos vendidos até a data limite de acerto financeiro indicada neste documento.\n5.2. O valor devido corresponderá aos produtos efetivamente vendidos, conforme os registros e conferências realizados pela CONTRATANTE.\n5.3. A forma de pagamento, descontos, comissões, condições comerciais e eventuais parcelamentos seguirão as regras comerciais vigentes da CONTRATANTE.\n5.4. O atraso no acerto financeiro poderá resultar em bloqueio de novas listas, suspensão do acesso ao sistema, cobrança dos valores pendentes e demais medidas cabíveis.',
    },
    {
      titulo: 'CLÁUSULA 6 — DEVOLUÇÃO DOS PRODUTOS',
      texto:
        '6.1. Os produtos não vendidos deverão ser devolvidos até a data limite de devolução informada neste documento, salvo prorrogação formal autorizada pela CONTRATANTE.\n6.2. Os produtos devolvidos serão conferidos pela CONTRATANTE, considerando quantidade, identificação, estado de conservação, integridade e condições de comercialização.\n6.3. Produtos ausentes, danificados, adulterados, com identificação removida ou sem condições de revenda poderão ser cobrados da CONSIGNATÁRIA pelo valor de venda indicado nesta lista ou conforme regra comercial aplicável.',
    },
    {
      titulo: 'CLÁUSULA 7 — RESPONSABILIDADE',
      texto:
        '7.1. A CONSIGNATÁRIA reconhece que responde pelos produtos recebidos durante todo o período em que permanecerem sob sua posse.\n7.2. A CONSIGNATÁRIA responderá por perdas, danos, extravios, furtos, roubos, retenção indevida, uso inadequado, omissão de informações, adulteração, venda sem registro ou qualquer ato que cause prejuízo direto ou indireto à CONTRATANTE.\n7.3. A responsabilidade da CONSIGNATÁRIA poderá ser apurada com base neste documento, nos registros do sistema, nas comunicações entre as partes, nos comprovantes de entrega, nas evidências de aceite eletrônico e nos relatórios de fechamento da lista.',
    },
    {
      titulo: 'CLÁUSULA 8 — COMUNICAÇÕES',
      texto:
        '8.1. A CONSIGNATÁRIA autoriza que a CONTRATANTE utilize os meios de contato informados neste documento, incluindo WhatsApp, telefone e e-mail, para comunicações operacionais, financeiras, cadastrais e relacionadas à consignação.\n8.2. A CONSIGNATÁRIA se compromete a manter seus dados atualizados e comunicar alterações relevantes à CONTRATANTE.',
    },
    {
      titulo: 'CLÁUSULA 9 — DADOS PESSOAIS',
      texto:
        '9.1. Os dados pessoais fornecidos pela CONSIGNATÁRIA serão utilizados para cadastro, análise comercial, prevenção a fraudes, gestão da consignação, emissão de documentos, controle operacional, cobrança, auditoria e cumprimento de obrigações legais.\n9.2. A CONTRATANTE deverá adotar medidas adequadas para proteger os dados pessoais tratados no contexto desta relação comercial.',
    },
    {
      titulo: 'CLÁUSULA 10 — VIGÊNCIA, CANCELAMENTO E HISTÓRICO',
      texto: `10.1. Este instrumento é válido exclusivamente para a lista identificada pelo código ${model.lista.codigo}.\n10.2. O documento assinado não poderá ser editado, sobrescrito ou removido do histórico do sistema.\n10.3. Se for necessário corrigir uma lista, a CONTRATANTE deverá registrar o cancelamento da lista original, informar o motivo e gerar uma nova lista com novo código, novo documento e nova assinatura.\n10.4. O cancelamento não elimina o histórico, as evidências de aceite, os registros de movimentação ou as responsabilidades já existentes.`,
    },
    {
      titulo: 'CLÁUSULA 11 — ACEITE ELETRÔNICO',
      texto:
        '11.1. A CONSIGNATÁRIA declara que leu, compreendeu e aceitou integralmente todas as cláusulas deste documento.\n11.2. A assinatura eletrônica realizada neste documento representa manifestação de vontade e concordância com seus termos.\n11.3. O sistema deverá registrar data e hora da assinatura, CPF da pessoa signatária, IP, identificador da sessão, versão do contrato, imagem da assinatura desenhada e hash do arquivo PDF gerado.\n11.4. O PDF assinado deverá ser preservado como cópia imutável, acessível posteriormente pela CONTRATANTE e pela CONSIGNATÁRIA autorizada.',
    },
    {
      titulo: 'CLÁUSULA 12 — FORO',
      texto: `12.1. Para dirimir eventuais controvérsias decorrentes deste instrumento, as partes elegem o foro da comarca de ${model.clausulaForo}, observadas as regras legais aplicáveis.`,
    },
  ]

  for (const c of clausulas) {
    renderSectionHeader(c.titulo)
    renderParagraph(c.texto)
  }

  // --- SEÇÃO: PRODUTOS ENTREGUES EM CONSIGNAÇÃO ---
  currentY += 3
  checkPageBreak(25)
  renderSectionHeader('PRODUTOS ENTREGUES EM CONSIGNAÇÃO')

  // Colunas da tabela: Foto | Código | Descrição | Tipo | Material | Tamanho | Quantidade | Valor unitário | Valor total
  const colWidths = [14, 20, 48, 18, 18, 14, 12, 16, 14]
  const colHeaders = [
    'Foto',
    'Código',
    'Descrição',
    'Tipo',
    'Material',
    'Tam',
    'Qtd',
    'Valor un',
    'Total',
  ]

  const drawTableHeader = () => {
    doc.setFillColor(243, 234, 216)
    doc.rect(marginLeft, currentY, contentWidth, 7, 'F')
    doc.setDrawColor(198, 166, 100)
    doc.setLineWidth(0.2)
    doc.rect(marginLeft, currentY, contentWidth, 7, 'S')

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(6.8)
    doc.setTextColor(122, 92, 46)

    let currentX = marginLeft
    for (let i = 0; i < colHeaders.length; i++) {
      const isRight = i >= 6
      const textX = isRight ? currentX + colWidths[i] - 1.5 : currentX + 1.5
      doc.text(colHeaders[i], textX, currentY + 4.8, { align: isRight ? 'right' : 'left' })
      currentX += colWidths[i]
    }
    currentY += 7
  }

  drawTableHeader()

  // Renderizar linhas dos produtos
  for (const item of model.items) {
    const rowHeight = 12
    if (currentY + rowHeight > pageHeight - bottomMargin) {
      doc.addPage()
      currentY = 22
      renderSectionHeader('PRODUTOS ENTREGUES EM CONSIGNAÇÃO (Continuação)')
      drawTableHeader()
    }

    doc.setDrawColor(229, 223, 213)
    doc.setLineWidth(0.15)
    doc.line(marginLeft, currentY + rowHeight, marginLeft + contentWidth, currentY + rowHeight)

    let currentX = marginLeft

    // Coluna 1: Foto
    // Tentamos desenhar miniatura caso tenha url ou base64
    let photoAdded = false
    if (item.photo_url) {
      try {
        const base64 = await getBase64ImageFromUrl(item.photo_url)
        if (base64) {
          doc.addImage(base64, 'JPEG', currentX + 1, currentY + 1, 10, 10)
          photoAdded = true
        }
      } catch {
        /* intentionally ignored */
      }
    }
    if (!photoAdded) {
      doc.setFont('helvetica', 'italic')
      doc.setFontSize(5.5)
      doc.setTextColor(140, 130, 117)
      doc.text('Sem foto', currentX + 1.5, currentY + 6.5)
    }
    currentX += colWidths[0]

    // Coluna 2: Código
    doc.setFont('courier', 'bold')
    doc.setFontSize(6.8)
    doc.setTextColor(122, 92, 46)
    doc.text(item.code || '—', currentX + 1, currentY + 6.5)
    currentX += colWidths[1]

    // Coluna 3: Descrição
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6.5)
    doc.setTextColor(45, 42, 38)
    const descLines = doc.splitTextToSize(item.description || '—', colWidths[2] - 2)
    doc.text(descLines.slice(0, 2), currentX + 1, currentY + 4.5)
    currentX += colWidths[2]

    // Coluna 4: Tipo
    doc.text(item.type_name || 'Joia', currentX + 1, currentY + 6.5)
    currentX += colWidths[3]

    // Coluna 5: Material
    doc.text(item.material_name || '—', currentX + 1, currentY + 6.5)
    currentX += colWidths[4]

    // Coluna 6: Tamanho
    doc.text(item.size_name || 'Único', currentX + 1, currentY + 6.5)
    currentX += colWidths[5]

    // Coluna 7: Qtd
    doc.setFont('helvetica', 'bold')
    doc.text(String(item.quantity || 1), currentX + colWidths[6] - 1.5, currentY + 6.5, {
      align: 'right',
    })
    currentX += colWidths[6]

    // Coluna 8: Valor unitário
    doc.setFont('helvetica', 'normal')
    doc.text(formatCurrency(item.selling_price), currentX + colWidths[7] - 1.5, currentY + 6.5, {
      align: 'right',
    })
    currentX += colWidths[7]

    // Coluna 9: Valor total
    doc.setFont('helvetica', 'bold')
    doc.text(formatCurrency(item.subtotal), currentX + colWidths[8] - 1.5, currentY + 6.5, {
      align: 'right',
    })

    currentY += rowHeight
  }

  // --- RESUMO FINANCEIRO ---
  currentY += 4
  checkPageBreak(25)

  doc.setFillColor(253, 251, 247)
  doc.rect(marginLeft, currentY, contentWidth, 20, 'F')
  doc.setDrawColor(198, 166, 100)
  doc.setLineWidth(0.3)
  doc.rect(marginLeft, currentY, contentWidth, 20, 'S')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(45, 42, 38)
  doc.text(
    `Quantidade de tipos de produtos: ${model.totals.items_count}`,
    marginLeft + 4,
    currentY + 5,
  )
  doc.text(
    `Quantidade total de peças: ${model.totals.pieces_count} peças`,
    marginLeft + 4,
    currentY + 9.5,
  )
  doc.text(
    `Valor total da lista: ${formatCurrency(model.totals.total_value)}`,
    marginLeft + 4,
    currentY + 14,
  )

  doc.setFont('helvetica', 'italic')
  doc.setFontSize(7.5)
  doc.setTextColor(122, 92, 46)
  const wordsLines = doc.splitTextToSize(
    `Valor total da lista por extenso: ${model.totals.total_value_words}`,
    contentWidth - 8,
  )
  doc.text(wordsLines, marginLeft + 4, currentY + 18)

  currentY += 25

  // --- DECLARAÇÃO DE RECEBIMENTO E RESPONSABILIDADE ---
  checkPageBreak(30)
  renderSectionHeader('DECLARAÇÃO DE RECEBIMENTO E RESPONSABILIDADE')
  renderParagraph(
    'Declaro que conferi e recebi os produtos descritos e relacionados neste Contrato de Consignação e Termo de Recebimento de Produtos, em perfeito estado e nas quantidades indicadas. Declaro também que assumo a responsabilidade pela guarda, conservação, devolução ou prestação de contas dos produtos, conforme as cláusulas deste documento.',
    true,
  )

  // --- ASSINATURAS ---
  currentY += 4
  checkPageBreak(50)
  renderSectionHeader('ASSINATURAS')

  const sigBoxWidth = (contentWidth - 6) / 2
  const sigBoxHeight = 44

  // Bloco 1: Assinatura da CONSIGNATÁRIA
  doc.setFillColor(253, 251, 247)
  doc.rect(marginLeft, currentY, sigBoxWidth, sigBoxHeight, 'F')
  doc.setDrawColor(229, 223, 213)
  doc.rect(marginLeft, currentY, sigBoxWidth, sigBoxHeight, 'S')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(122, 92, 46)
  doc.text('CONSIGNATÁRIA (REVENDEDORA)', marginLeft + 3, currentY + 5)

  // Imagem da assinatura capturada em tela
  const signImg = signatureDataUrl || snapshot.signature?.signer_name
  if (signatureDataUrl) {
    try {
      doc.addImage(signatureDataUrl, 'PNG', marginLeft + 5, currentY + 7, sigBoxWidth - 10, 16)
    } catch {
      /* intentionally ignored */
    }
  } else {
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(7.5)
    doc.setTextColor(140, 130, 117)
    doc.text('[Aguardando assinatura digital do titular]', marginLeft + 5, currentY + 15)
  }

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(45, 42, 38)
  doc.text(`Nome: ${model.consignataria.nome}`, marginLeft + 3, currentY + 26)
  doc.text(`CPF: ${model.consignataria.cpf}`, marginLeft + 3, currentY + 29.5)
  doc.text(
    `Data/Hora: ${model.signature?.signed_at ? formatDateTime(model.signature.signed_at) : 'Em aberto'}`,
    marginLeft + 3,
    currentY + 33,
  )
  doc.text(
    `IP Signatária: ${model.signature?.signed_ip || 'Pendente'}`,
    marginLeft + 3,
    currentY + 36.5,
  )
  doc.setFont('courier', 'normal')
  doc.setFontSize(5.5)
  doc.setTextColor(107, 101, 94)
  doc.text(
    `Hash: ${hash ? hash.slice(0, 32) + '...' : 'Pendente'}`,
    marginLeft + 3,
    currentY + 40.5,
  )

  // Bloco 2: Assinatura Digital da CONTRATANTE (Scaglioni Joias)
  const contratanteX = marginLeft + sigBoxWidth + 6
  doc.setFillColor(253, 251, 247)
  doc.rect(contratanteX, currentY, sigBoxWidth, sigBoxHeight, 'F')
  doc.setDrawColor(229, 223, 213)
  doc.rect(contratanteX, currentY, sigBoxWidth, sigBoxHeight, 'S')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(122, 92, 46)
  doc.text('CONTRATANTE (EMISSÃO DIGITAL)', contratanteX + 3, currentY + 5)

  doc.setFont('times', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(45, 42, 38)
  doc.text('Scaglioni Joias', contratanteX + 5, currentY + 15)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(45, 42, 38)
  doc.text(`Emissor: ${model.lista.criadorNome}`, contratanteX + 3, currentY + 26)
  doc.text(`Data Emissão: ${model.lista.dataEmissao}`, contratanteX + 3, currentY + 29.5)
  doc.text(`IP Criação: ${model.lista.criadorIp}`, contratanteX + 3, currentY + 33)
  doc.text(`Código da Lista: ${model.lista.codigo}`, contratanteX + 3, currentY + 36.5)

  doc.setFont('courier', 'normal')
  doc.setFontSize(5.5)
  doc.setTextColor(107, 101, 94)
  doc.text(
    `Doc ID / Integridade: ${hash ? hash.slice(0, 32) : 'OK'}`,
    contratanteX + 3,
    currentY + 40.5,
  )

  // --- RODAPÉ E NUMERAÇÃO DE TODAS AS PÁGINAS ---
  const totalPages = doc.getNumberOfPages()
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p)
    doc.setDrawColor(229, 223, 213)
    doc.setLineWidth(0.2)
    doc.line(marginLeft, pageHeight - 12, pageWidth - marginRight, pageHeight - 12)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6.5)
    doc.setTextColor(140, 130, 117)
    doc.text(
      `Scaglioni Joias • Contrato de Consignação [${model.lista.codigo}] • Integridade SHA-256: ${hash ? hash.slice(0, 16) : ''}...`,
      marginLeft,
      pageHeight - 8,
    )
    doc.text(`Página ${p} de ${totalPages}`, pageWidth - marginRight, pageHeight - 8, {
      align: 'right',
    })
  }

  const blob = doc.output('blob')
  const dataUri = doc.output('datauristring')

  return { doc, blob, dataUri }
}
