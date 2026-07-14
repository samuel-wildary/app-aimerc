# Mercadinho Queiroz

- Pacote Android: `com.mercadinhoqueiroz.app`
- Cadastro SaaS: `store_85176df6`
- Identificador da API: `mecadinho-queiroz`
- Cor principal: `#1B2950`
- Cor de destaque: `#FF7D18`
- Fundo: `#F7F8FC`
- API de producao: `https://wildhub-aimerc-backend-app.5mos1l.easypanel.host/api`

## APK de teste

`app/build/outputs/apk/debug/app-debug.apk`

## Push

Antes da publicacao, registre o pacote `com.mercadinhoqueiroz.app` no projeto Firebase do AiMerc e coloque o novo `google-services.json` dentro da pasta `app`. O arquivo do aplicativo generico nao pode ser reutilizado porque pertence a outro pacote Android.

## Catalogo automatico

O worker `sync-worker` consulta o PostgreSQL do Queiroz, cruza os EANs com a API de imagens e envia o catalogo para o backend AiMerc. O Android recebe somente URLs do backend. Execute `npm run watch:queiroz` com `QUEIROZ_DATABASE_URL`, `CATALOG_API_URL`, `AIMERC_API_URL`, `AIMERC_SYNC_EMAIL` e `AIMERC_SYNC_PASSWORD` configurados como variaveis seguras.

Para publicar somente os arquivos de imagem sem alterar precos ou estoque, execute `npm run images:queiroz` no `sync-worker` com `CATALOG_API_URL`, `AIMERC_API_URL`, `AIMERC_SYNC_EMAIL` e `AIMERC_SYNC_PASSWORD`.
