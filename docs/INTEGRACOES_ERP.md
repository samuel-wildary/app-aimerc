# Integracoes de ERP no AiMerc

## Decisao de arquitetura

O AiMerc usa um contrato canonico de produtos e um agente instalado na rede do supermercado. Cada conector transforma o formato do ERP nesse contrato antes de enviar os dados ao backend.

```text
SysPDV / Varejo Facil / Solicom / outro ERP
                    |
              API ou arquivo local
                    |
            AiMerc Sync Agent
        normalizacao + fila offline
                    |
          HTTPS com token por loja
                    |
             Backend AiMerc
                    |
               PostgreSQL
```

O aplicativo Android e as dashboards nunca acessam o ERP diretamente. Eles leem somente o backend AiMerc.

## O que foi confirmado

### SysPDV e SysPDV Web

A Casa Magalhaes informa em seu treinamento oficial que o SysPDV Web possui API padrao para integracoes. O material do SysPDV Service tambem documenta importacoes automaticas, movimentos e layouts. Existem instalacoes antigas ou especificas que ainda usam integracao por arquivos.

Perfil no agente: `SYSPDV`.

Modos suportados pelo AiMerc:

- `LOCAL_AGENT`: recomendado para servidor dentro da loja.
- `CLOUD_API`: quando a API homologada estiver publicamente acessivel por HTTPS.
- `FILE_LAYOUT`: para instalacoes que entregam arquivos em pasta local.

### Varejo Facil

Os materiais oficiais da Casa Magalhaes apresentam o Varejo Facil como retaguarda integrada ao SysPDV e com operacao em nuvem. O endpoint, a autenticacao e os campos exatos dependem da versao e do acesso de parceiro concedido ao cliente.

Perfil no agente: `VAREJO_FACIL`.

Modos suportados pelo AiMerc:

- `LOCAL_AGENT`: recomendado quando a integracao passa pelo ambiente local da loja.
- `CLOUD_API`: quando a Casa Magalhaes fornecer URL e credenciais homologadas.

### Solicom

Nao foi localizada documentacao publica oficial suficiente para fixar endpoints ou nomes de campos sem risco de inventar um contrato. Por isso, o perfil `SOLICOM` esta pronto, mas permanece configuravel. A homologacao final deve usar o Swagger, manual ou amostra JSON da versao instalada no supermercado.

## Contrato canonico AiMerc

Cada produto enviado pelo agente possui:

| Campo | Regra |
| --- | --- |
| `sku` | Identificador obrigatorio no ERP; usa EAN como alternativa |
| `barcode` | EAN/GTIN somente com digitos |
| `name` | Descricao comercial |
| `category` | Categoria do ERP; pode receber personalizacao no catalogo |
| `price` | Preco vigente |
| `oldPrice` | Preco regular quando existe promocao |
| `stock` | Quantidade disponivel, nunca negativa |
| `unit` | `UN`, `KG`, `L`, `CX` ou `PCT` |
| `promo` | Indica preco promocional valido |
| `active` | Disponibilidade comercial |

Imagem e descricao personalizada pertencem ao catalogo AiMerc e nao sao apagadas pela sincronizacao de preco e estoque.

## Seguranca

- Uma loja possui um token de agente exclusivo e revogavel.
- O backend armazena apenas o hash SHA-256 do token.
- O token completo aparece uma unica vez no SaaS.
- O agente abre apenas conexoes de saida HTTPS; nenhuma porta local precisa ser publicada.
- Credenciais do ERP ficam no arquivo `.env` do servidor local.
- Se a internet cair, o lote normalizado fica na fila em disco e e reenviado.
- Toda execucao gera historico com quantidade recebida, criada, atualizada e erros.

## Homologacao de uma nova loja

1. Obter do fornecedor uma amostra real do JSON ou layout de arquivo.
2. Identificar versao do ERP, endpoint, autenticacao e limites.
3. Selecionar o provedor na pagina `Integracoes ERP` do SaaS.
4. Gerar o token do agente.
5. Baixar `AiMerc-Agent-Setup.exe` no SaaS e preencher o assistente na maquina da loja.
6. Acompanhar o primeiro envio no SaaS e comparar 10 produtos com o PDV.
7. Validar preco normal, promocao, estoque zerado, produto inativo, EAN e unidade por peso.
8. Confirmar que o agente aparece como `ONLINE` e reiniciar a maquina para validar a inicializacao automatica.

## Distribuicao do instalador

O projeto gera um unico instalador configuravel com `npm run build:windows` dentro de `sync-agent`. O resultado fica em `sync-agent/dist/AiMerc-Agent-Setup.exe`.

No ambiente local, o backend entrega esse arquivo diretamente pela rota autenticada do SaaS. Em producao, publique o EXE em uma GitHub Release ou CDN HTTPS e configure `AIMERC_AGENT_DOWNLOAD_URL` no backend. O executavel nao deve ser incorporado ao banco PostgreSQL.

O instalador ainda nao possui assinatura de codigo. Antes de distribuir comercialmente, assine o EXE com certificado Code Signing para reduzir alertas do Microsoft Defender SmartScreen e permitir verificacao de autoria.

## Fontes oficiais consultadas

- Casa Magalhaes, treinamentos de integracao do SysPDV Web: https://cursos.casamagalhaes.com.br/course/index.php?categoryid=8
- Casa Magalhaes, integracao e SysPDV Service: https://eadcm.casamagalhaes.com.br/pluginfile.php/75/mod_folder/content/0/SysPDV/Apresenta%C3%A7%C3%B5es%20%20Treinamentos/SysPDV%20-%20integra%C3%A7%C3%A3o%20e%20bling.pdf
- Casa Magalhaes, materiais Varejo Facil: https://eadcm.casamagalhaes.com.br/course/index.php?browse=courses&categoryid=16&page=2&perpage=20
- Casa Magalhaes, integracao SysPDV por arquivo: https://eadcm.casamagalhaes.com.br/pluginfile.php/75/mod_folder/content/0/SysPDV/Tutoriais%20Antigos%20-%20SysPDV/Sobre%20Venda%20Assistida/Integracao%20Por%20Arquivo%20de%20Pre%20Venda.pdf?forcedownload=1
