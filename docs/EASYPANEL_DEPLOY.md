# Deploy do AiMerc no EasyPanel

## Servicos

Crie tres aplicativos a partir do mesmo repositorio GitHub:

| Servico | Caminho de build | Dockerfile | Porta interna |
| --- | --- | --- | --- |
| API | `/backend` | `backend/Dockerfile` | `3000` |
| Painel do supermercado | `/supermarket-dashboard` | `supermarket-dashboard/Dockerfile` | `80` |
| Administracao SaaS | `/saas-admin` | `saas-admin/Dockerfile` | `80` |

Cada frontend e uma imagem estatica separada. O supermercado nunca recebe acesso ao painel SaaS.

## PostgreSQL

O PostgreSQL e a unica persistencia de execucao. Use preferencialmente o endereco privado do servico PostgreSQL dentro do EasyPanel. Se o banco for acessado por IP publico, habilite TLS e use `sslmode=require`.

Antes da primeira implantacao desta versao:

1. Faca backup do PostgreSQL e do volume `/app/data` atual.
2. Mantenha o volume antigo conectado somente para a importacao unica dos SQLite legados.
3. Implante uma unica replica do backend.
4. Confirme no log `Importando dados legados para PostgreSQL` e depois `AiMerc backend PostgreSQL running`.
5. Confirme `/api/health` com `persistence: postgresql`.
6. Valide login, lojas, catalogo, imagens, pedidos e banners antes de remover o volume legado.

Depois que o marcador `/app/data/.postgres-migrated-v2` existir, o backend nao le nem grava SQLite. Novas replicas compartilham somente o PostgreSQL.

## Variaveis da API

```env
NODE_ENV=production
PORT=3000
DATABASE_URL=postgres://USUARIO:SENHA@HOST_INTERNO:5432/aimerc?sslmode=require
AIMERC_TOKEN_SECRET=CHAVE_ALEATORIA_COM_PELO_MENOS_32_CARACTERES
AIMERC_TOKEN_SECRET_PREVIOUS=
AIMERC_ALLOWED_ORIGINS=https://painel.seudominio.com.br,https://admin.seudominio.com.br
AIMERC_PUBLIC_API_URL=https://api.seudominio.com.br/api
AIMERC_TRUST_PROXY_HOPS=1
AIMERC_DB_POOL_MAX=10
AIMERC_ADMIN_NAME=Administrador AiMerc
AIMERC_ADMIN_EMAIL=admin@seudominio.com.br
AIMERC_ADMIN_PASSWORD=SENHA_FORTE_COM_12_OU_MAIS_CARACTERES
FIREBASE_SERVICE_ACCOUNT_BASE64=JSON_FIREBASE_CODIFICADO_EM_BASE64
```

Cadastre senhas e chaves como segredos do EasyPanel. `AIMERC_ADMIN_*` cria ou atualiza a conta master ao iniciar. Durante uma rotacao, mova a chave antiga para `AIMERC_TOKEN_SECRET_PREVIOUS`; remova-a quando as sessoes antigas expirarem.

## Frontends

Nos dois servicos, configure como argumento de build, nao apenas como variavel de execucao:

```env
VITE_API_URL=https://api.seudominio.com.br/api
```

Depois de alterar esse valor, execute uma nova implantacao para recompilar o JavaScript. O endereco precisa ser HTTPS para evitar bloqueio de conteudo misto.

## Firebase

Converta a conta de servico para Base64 no PowerShell:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\caminho\firebase-service-account.json"))
```

Cadastre o resultado em `FIREBASE_SERVICE_ACCOUNT_BASE64`. Nao salve o JSON nem o Base64 no repositorio.

## Verificacao

```text
GET https://api.seudominio.com.br/api/health
```

O endpoint so retorna sucesso quando o PostgreSQL responde. Em producao, CORS aceita apenas as origens declaradas em `AIMERC_ALLOWED_ORIGINS`.
