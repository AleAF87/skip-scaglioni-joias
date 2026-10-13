# Scaglioni Joias — Sistema de Gestão para Joalheria

Sistema web completo de gestão para a joalheria **Scaglioni Joias**, em português do Brasil, valores em reais (R$), operando perfeitamente em desktop e dispositivos móveis (com tela âncora mobile para cadastro rápido de joias por voz com auxílio de Inteligência Artificial).

---

## 💎 Identidade Visual e Arquitetura

- **Paleta de Cores:** Dourado nobre (`#C6A664`, hover `#B08F4E`, escuro `#7A5C2E`), off-white quente de fundo (`#FDFBF7`), superfícies em branco (`#FFFFFF`), texto em carvão quente (`#2D2A26`) e detalhes em ouro champagne (`#F3EAD8`).
- **Tipografia:** Serifada sofisticada (*Playfair Display*) para títulos e cabeçalhos editoriais; sem serifa moderna (*Inter*) para interface, números e dados de alta legibilidade.
- **Frontend:** React 18, Vite, TypeScript, Tailwind CSS, shadcn/ui, Recharts e Sonner.
- **Backend:** Skip Cloud (PocketBase) com migrações JavaScript declarativas, autenticação por tokens, controle de acesso refinado por papéis (`admin`, `operator`, `reseller`) e status de conta (`pending`, `active`, `rejected`, `disabled`).
- **Inteligência Artificial:** Skip AI Gateway com alias `fast` (chamada single-turn/stateless segura no servidor via `pb_hooks`), garantindo que segredos e chaves nunca sejam expostos no cliente.

---

## 🚀 Instalação e Execução Local

### Pré-requisitos
- Node.js 18+ e npm.
- Instância PocketBase configurada (já conectada via Skip Cloud).

### Passos:
1. Instale as dependências:
```bash
npm install
```

2. Configuração de Variáveis de Ambiente:
No Skip Cloud as variáveis são injetadas automaticamente. Caso execute localmente, verifique:
- `VITE_POCKETBASE_URL`: URL base do backend PocketBase (ex: `https://sua-instancia.skipcloud.io` ou `http://127.0.0.1:8090`).

3. Inicie o servidor de desenvolvimento:
```bash
npm run dev
```

4. Acesse no navegador: `http://localhost:5173`.

---

## 📦 Migrações e Banco de Dados (PocketBase)

As migrações localizam-se em `pocketbase/migrations/` e executam na ordem:
- `0001_update_users_collection.js`: Adiciona os campos de `role`, `status`, `phone`, `document`, `city`, `state`, `notes` e regras de autorização na coleção `users`.
- `0002_create_auxiliary_collections.js`: Cria `product_types`, `product_materials`, `product_sizes`, `settings` e `customers`.
- `0003_create_core_collections.js`: Cria `products`, `resellers`, `sales` e `consignment_lists`.
- `0004_seed_initial_data.js`: Insere dados iniciais idempotentes:
  - Usuário Administrador padrão: `drcesartadeu@gmail.com` / `Skip@Pass`
  - Operador de exemplo: `operador@scaglionijoias.com.br` / `Skip@Pass`
  - Revendedora de exemplo: `revendedora@scaglionijoias.com.br` / `Skip@Pass`
  - 5 joias realistas com preços em R$, fotos e tipos
  - Cadastros auxiliares de tipos, materiais e tamanhos padrão
  - Venda concluída e lista de consignação aceita de exemplo.

---

## 🔒 Papéis e Permissões de Acesso

1. **Administrador (`admin`):**
   - Acesso irrestrito a todos os módulos.
   - Gestão de usuários (aprovar, reprovar, ativar, desativar).
   - Aprovação de revendedores parceiros com justificativa de recusa.
   - Configurações de alerta de estoque mínimo.

2. **Operador (`operator`):**
   - Acesso a Cadastro por Voz, Produtos, Estoque, PDV (Vendas), Vitrine, Consignações e Dashboard.
   - Não gerencia usuários nem aprova revendedores.

3. **Revendedor (`reseller`):**
   - Acesso ao próprio perfil, Vitrine (catálogo com preços de venda ao consumidor) e acompanhamento/aceite de suas Listas de Consignação.
   - **Proteção de negócio:** Revendedores **nunca** têm acesso ao preço de custo/valor investido nem à administração interna.

---

## 🎙️ Cadastro Rápido de Joias por Voz com IA (Mobile-First — v0.0.6)

- Localizado na rota `/voz` (ou botão central na barra inferior no celular).
- **Arquitetura Estável de Voz (v0.0.6):** A antiga Web Speech API do navegador foi descontinuada devido a problemas de repetição de palavras e ciclos de reinício no Android/Safari. Agora a captura é feita via **MediaRecorder nativo** (`getUserMedia`) com fallback inteligente de MIME type (`audio/webm;codecs=opus` para Android/Chrome e `audio/mp4` / `audio/aac` para iOS Safari).
- **Gravação Contínua e Limpa:** O botão de microfone grava ininterruptamente do início ao fim até o usuário clicar em Parar. Não há religações intermediárias nem desarmes acidentais.
- **Transcrição Segura no Servidor (pb_hooks):** O áudio gravado é enviado via multipart para o hook `/backend/v1/ai/transcribe-audio`.
  - **Configuração de STT:** O hook consome a variável de ambiente `OPENAI_API_KEY` (configurada via Skip Cloud / variáveis de ambiente). Segredos ficam estritamente no servidor.
  - Caso a chave ainda não tenha sido configurada, o sistema exibe aviso amigável e permite a digitação manual da descrição sem bloquear o uso da IA para preencher os campos.
- **Preenchimento com IA:** Com o texto transcrito e editável, o botão *"Preencher Formulário com IA"* aciona o Skip AI Gateway (`/backend/v1/ai/interpret-product`), extraindo código, descrição limpa, tipo, material, tamanho, perfil, investimento, preço e estoque.
- **Regra Crítica de Negócio:** A IA **nunca** inventa preços ou quantidades. Se não constarem na fala, os campos permanecem em branco com destaque visual para revisão manual.
- **Captura de Câmera:** Botão com `capture="environment"` para fotos diretas da câmera do smartphone.
- **Ditado de Observações:** Também utiliza gravação de áudio e transcrição no servidor.
- O usuário valida e revisa os campos antes de clicar em salvar no estoque.

---

## 🛒 PDV & Consistência de Estoque

- **Leitor de Código de Barras:** O campo de busca aceita leitura contínua com leitor físico ou digitação, disparando a inserção imediata ao pressionar Enter.
- **Formas de Pagamento:** Pix, Dinheiro, Cartão de Débito e Cartão de Crédito com parcelamento em até 12x, detalhando valor de cada parcela.
- **Transação Atômica no Servidor:** O checkout dispara `$app.runInTransaction` no hook `/backend/v1/sales/checkout`. O estoque só é debitado se houver saldo suficiente no momento da conclusão, impedindo saldo negativo mesmo em acessos concorrentes.
- **Vendas Pendentes:** Permite salvar vendas em aberto sem afetar o estoque até a conclusão final.
- **Recibo Imprimível:** Emissão de cupom/recibo simples ao concluir venda.

---

## 🤝 Consignação & Regra de Consistência

- Administradores e operadores criam listas de consignação para revendedores ativos.
- O revendedor visualiza a lista em seu painel e pode **Aceitar** ou **Recusar**.
- **Fechamento consistente:** O hook `/backend/v1/consignments/close` valida obrigatoriamente se `(Vendidos + Devolvidos) == Total Consignado`.
- Peças vendidas geram faturamento; peças devolvidas retornam ao estoque disponível.
- Emissão de **Recibo de Consignação** e **Relatório de Fechamento** no formato A4 imprimível.

---

## 🧪 Roteiro de Teste dos Fluxos

1. **Acesso com Administrador:**
   - Acesse `/login` e entre com `drcesartadeu@gmail.com` / `Skip@Pass`.
   - Navegue pelo Dashboard e confira os indicadores e gráficos.
2. **Cadastro por Voz:**
   - Acesse `/voz`, clique no microfone ou digite: *"anel de ouro 18k com rubi, feminino, tamanho 18, investi 400, vendo por 1100, 3 unidades"*.
   - Clique em *"Preencher Formulário com IA"*, revise os campos e salve.
3. **Estoque e Etiquetas:**
   - Acesse `/estoque`, selecione 2 produtos e clique em *"Etiquetas"*. Veja o layout A4 com Código 128 pronto para impressão.
4. **PDV / Venda Concluída:**
   - Acesse `/pdv`, busque uma joia, selecione Cartão de Crédito 6x e clique em *"Concluir Venda"*. Verifique a impressão do comprovante e a redução imediata no estoque.
5. **Consignação:**
   - Acesse `/consignacoes`, visualize a lista aceita de teste `CONS-2025-001`, clique em *"Fechar Lista"*, informe as quantidades e confirme.
