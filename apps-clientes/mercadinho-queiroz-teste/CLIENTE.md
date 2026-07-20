# Mercadinho Queiroz - ambiente de teste

- Nome no celular: `Queiroz Teste`
- Pacote Android: `com.mercadinhoqueiroz.teste`
- Cadastro SaaS: `store_85176df6`
- Identificador da API: `mecadinho-queiroz`
- Cor principal: `#1B2950`
- Cor de destaque: `#FF7D18`
- Fundo: `#F7F8FC`
- API local no emulador: `http://10.0.2.2:4100/api`
- Este projeto nao deve ser publicado na Play Store. Ele existe para testar mudancas locais sem alterar o app de producao.

## APK de teste

`app/build/outputs/apk/debug/app-debug.apk`

## Push

Se push for testado futuramente, registre separadamente o pacote `com.mercadinhoqueiroz.teste` no Firebase.

## Catalogo automatico

O worker `sync-worker` consulta o PostgreSQL do Queiroz, cruza os EANs com a API de imagens e envia o catalogo para o backend AiMerc. O Android recebe somente URLs do backend. Execute `npm run watch:queiroz` com `QUEIROZ_DATABASE_URL`, `CATALOG_API_URL`, `AIMERC_API_URL`, `AIMERC_SYNC_EMAIL` e `AIMERC_SYNC_PASSWORD` configurados como variaveis seguras.

Para publicar somente os arquivos de imagem sem alterar precos ou estoque, execute `npm run images:queiroz` no `sync-worker` com `CATALOG_API_URL`, `AIMERC_API_URL`, `AIMERC_SYNC_EMAIL` e `AIMERC_SYNC_PASSWORD`.
