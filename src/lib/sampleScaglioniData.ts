// Fixture de teste com dados representativos reais do Scaglioni para verificação do importador
// Baseado na estrutura exata: ; UTF-8 com BOM, descrições com quebras, preco_promocional vazio, UUIDs, dimensões, etc.

export const SAMPLE_SCAGLIONI_CSV = `\uFEFFid;nome;slug;descricao;sku;marca_id;marca;categoria_id;categoria(s);preco;preco_promocional;estoque;imagem_url;urls_imagens;arquivos_imagens;altura_cm;largura_cm;comprimento_cm;peso_g;ativo;destaque;created_at;updated_at;coluna_legada_conferencia
8d482-001;Gargantilha Pérola Barroca Ouro 18k;gargantilha-perola-barroca-ouro-18k;"Gargantilha sofisticada com pérola cultivada barroca natural.

Acabamento refinado em banho de ouro 18k antialérgico, com fecho boia de segurança.";SCG-PER-001;brand-uuid-1;Scaglioni Joias;cat-uuid-colares;Colares|Alta Joalheria;389.9;;12;https://img.usecurling.com/p/600/600?q=pearl%20necklace;https://img.usecurling.com/p/600/600?q=pearl%20necklace|https://img.usecurling.com/p/600/600?q=necklace%20gold;fotos/perola_barroca.jpg;2.5;15.0;45.0;18.5;true;true;2026-01-15T10:30:00-03:00;2026-03-20T14:15:00-03:00;VALOR_LEGADO_1
8d482-002;Anel Solitário Zircônia Prime;anel-solitário-zirconia-prime;"Anel clássico solitário estilo joalheria tradicional.

Cravação inglesa com garras reforçadas.";SCG-ANE-002;brand-uuid-1;Scaglioni Joias;cat-uuid-aneis;Anéis|Zircônias;189.9;149.9;8;https://img.usecurling.com/p/600/600?q=diamond%20ring;https://img.usecurling.com/p/600/600?q=ring%20detail;fotos/anel_solitario.jpg;1.2;2.0;2.0;6.8;true;false;2026-02-01T08:00:00-03:00;2026-03-25T11:00:00-03:00;VALOR_LEGADO_2
8d482-003;Brinco Cascata Cristais;brinco-cascata-cristais;"Brinco com cristais multifacetados.";SCG-BRI-003;brand-uuid-2;Atelier Scaglioni;cat-uuid-brincos;Brincos;89.9;;0;https://img.usecurling.com/p/600/600?q=crystal%20earrings;;;4.0;1.0;1.0;8.2;false;false;2026-02-10T12:00:00-03:00;2026-03-10T16:00:00-03:00;VALOR_LEGADO_3
`
