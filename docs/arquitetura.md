# Arquitetura AiMerc

## Superficies

1. App Android individual de cada supermercado.
2. Dashboard operacional do supermercado.
3. Painel Control exclusivo do dono do SaaS.
4. Backend central e workers de integracao.

O Android e os dois paineis falam somente com a API HTTPS. Nenhum deles recebe credencial do PostgreSQL, Firebase Admin, ERP ou Asaas.

```text
Android / Dashboard / SaaS
            |
          HTTPS
            |
       Backend Node.js
            |
    pool de conexoes PostgreSQL
            |
 lojas, usuarios, produtos, imagens, pedidos, banners e campanhas
```

Docker empacota e executa os servicos; ele nao e o protocolo de comunicacao do aplicativo. O Android usa requisicoes HTTPS para o dominio publico do backend.

## Persistencia multiempresa

- PostgreSQL e a unica fonte oficial de dados.
- Todas as tabelas operacionais possuem `store_id`.
- O token do gestor contem o `storeId`; a API ignora qualquer tenant enviado pelo navegador.
- Consultas e alteracoes sempre filtram pelo tenant autenticado.
- Imagens sao armazenadas em `BYTEA` e servidas pela API com cache HTTP.
- Pedido e baixa/devolucao de estoque ocorrem na mesma transacao e usam bloqueio de linha.

## Autenticacao e protecao

- Senhas novas: `scrypt` com salt individual; hashes PBKDF2 antigos sao atualizados no proximo login.
- Sessao: token HMAC com validade limitada e suporte a rotacao de chave.
- Perfis: `PLATFORM_ADMIN` e `STORE_MANAGER`.
- Login e criacao publica de pedidos possuem limites persistidos no PostgreSQL.
- Tokens de acompanhamento de pedido ficam armazenados apenas como SHA-256.
- CORS de producao aceita somente origens declaradas e a API envia HSTS e cabecalhos de seguranca.
- Android release exige HTTPS, desabilita backup e criptografa o cadastro salvo no aparelho.

## Fluxo do pedido

```text
Android -> API valida loja, itens, estoque e pedido minimo
        -> transacao cria pedido e baixa estoque
        -> dashboard acompanha e altera o status
        -> Android consulta o status usando token exclusivo do pedido
        -> RECEIVED -> PICKING -> READY -> OUT_FOR_DELIVERY -> DONE
```

O aplicativo pode cancelar somente no periodo configurado e enquanto o pedido estiver em `RECEIVED`. Cancelamentos validos devolvem o estoque na mesma transacao.

## Sincronizacao

O worker autentica como gestor e envia produtos para `/api/sync/products`. A integracao de ERP fica no backend/worker, nunca dentro do APK.

## Pagamentos

- Consumidor: dinheiro, cartao ou Pix na entrega/retirada.
- Supermercado: mensalidade recorrente do SaaS.
- Cobrancas Asaas e webhooks exigem credenciais configuradas somente no backend.
