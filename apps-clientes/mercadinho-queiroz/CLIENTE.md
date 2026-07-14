# Mercadinho Queiroz

- Pacote Android: `com.mercadinhoqueiroz.app`
- Cadastro SaaS: `store_85176df6`
- Identificador da API: `mecadinho-queiroz`
- Cor principal: `#1B2950`
- Cor de destaque: `#FF7D18`
- Fundo: `#F7F8FC`
- API local no emulador: `http://10.0.2.2:4100/api`

## APK de teste

`app/build/outputs/apk/debug/app-debug.apk`

## Push

Antes da publicacao, registre o pacote `com.mercadinhoqueiroz.app` no projeto Firebase do AiMerc e coloque o novo `google-services.json` dentro da pasta `app`. O arquivo do aplicativo generico nao pode ser reutilizado porque pertence a outro pacote Android.

## Catalogo automatico

O worker `sync-worker` consulta o PostgreSQL do Queiroz, cruza os EANs com a API de imagens e atualiza o catalogo AiMerc. Em producao, execute `npm run watch:queiroz` com `QUEIROZ_DATABASE_URL`, `CATALOG_API_URL` e `CATALOG_PUBLIC_URL` configurados como variaveis seguras do servidor.
