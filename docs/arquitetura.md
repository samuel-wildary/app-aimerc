# Arquitetura AiMerc

## Separacao do produto

O AiMerc possui quatro superficies independentes:

1. App Android do consumidor.
2. Dashboard operacional de cada supermercado.
3. Painel Control exclusivo do dono do SaaS.
4. Backend e worker de integracao.

O cliente do supermercado nunca recebe acesso ao painel Control.

## Persistencia multiempresa

- `backend/data/master.sqlite`: lojas, usuarios, planos e assinaturas.
- `backend/data/stores/{storeId}.sqlite`: produtos, estoque, pedidos e itens de uma unica loja.
- O token do gestor contem o `storeId` e o backend nunca aceita outro `storeId` enviado pela dashboard.
- Uma loja nao consegue consultar ou alterar dados de outra loja.

Os arquivos SQLite sao adequados para desenvolvimento local e primeiros pilotos. Em producao com varias instancias, migrar o banco master para PostgreSQL e avaliar PostgreSQL por tenant ou schemas isolados.

## Autenticacao

- Senhas: PBKDF2 com salt individual.
- Sessao: token assinado com HMAC e validade de 12 horas.
- Perfis: `PLATFORM_ADMIN` e `STORE_MANAGER`.
- Endpoints de pedidos, produtos, sincronizacao e SaaS exigem o perfil correto.

Defina `AIMERC_TOKEN_SECRET` em producao. Nunca use o segredo local padrao fora do computador de desenvolvimento.

## Fluxo do pedido

```text
Android -> catalogo publico da loja -> carrinho -> checkout
        -> API valida loja, estoque e pedido minimo
        -> transacao grava pedido e baixa estoque
        -> dashboard recebe pedido
        -> RECEIVED -> PICKING -> READY -> OUT_FOR_DELIVERY -> DONE
```

Pedidos de retirada passam de `READY` diretamente para `DONE`.

## Sincronizacao

O worker autentica como gestor e envia produtos para `/api/sync/products`.

- Upsert por SKU.
- Atualiza preco, estoque, imagem, promocao e disponibilidade.
- CSV de demonstracao aceita campos entre aspas.
- Integracoes reais de ERP devem ficar em `sync-worker`, nunca no Android.

## Pagamentos

- Consumidor: dinheiro ou cartao na entrega/retirada.
- Supermercado: mensalidade recorrente do SaaS.
- A estrutura local de assinaturas esta pronta.
- A criacao real de cobrancas e webhooks do Asaas depende das credenciais e do ambiente Asaas do proprietario.

## Seguranca de ambiente

- CORS limitado aos paineis locais ou a `AIMERC_ALLOWED_ORIGINS`.
- Limite basico de requisicoes.
- Cabecalhos de seguranca no backend.
- Android debug permite HTTP para `10.0.2.2`.
- Android release bloqueia HTTP; producao deve usar HTTPS.
