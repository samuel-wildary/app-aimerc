# Deploy do AiMerc no EasyPanel

## Servicos

Crie tres aplicativos a partir do mesmo repositorio GitHub:

| Servico | Diretorio | Dockerfile | Porta interna |
| --- | --- | --- | --- |
| API | `backend` | `backend/Dockerfile` | `3000` |
| Painel do supermercado | `supermarket-dashboard` | `supermarket-dashboard/Dockerfile` | `80` |
| Administracao SaaS | `saas-admin` | `saas-admin/Dockerfile` | `80` |

No modo Docker Compose do EasyPanel, importe diretamente o arquivo `docker-compose.yml` da raiz.
O arquivo `easypanel-compose.yml` permanece como referencia equivalente.

## Variaveis da API

Configure no EasyPanel:

```env
PORT=3000
NODE_ENV=production
AIMERC_TOKEN_SECRET=UMA_CHAVE_ALEATORIA_FORTE
AIMERC_ALLOWED_ORIGINS=http://31.97.252.6:4201,http://31.97.252.6:4202
DATABASE_URL=postgres://USUARIO:SENHA@31.97.252.6:5540/aimerc?sslmode=disable
FIREBASE_SERVICE_ACCOUNT_BASE64=JSON_DA_CONTA_FIREBASE_CODIFICADO_EM_BASE64
```

Nao grave a senha real em arquivos versionados. Use o painel de variaveis secretas do EasyPanel.

## URL da API nos frontends

Adicione como argumento de build nos dois frontends:

```env
VITE_API_URL=http://31.97.252.6:3000/api
```

## Firebase no Docker

Converta o JSON da conta de servico em Base64 no PowerShell:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\caminho\firebase-service-account.json"))
```

Cadastre o resultado no EasyPanel como a variavel secreta `FIREBASE_SERVICE_ACCOUNT_BASE64`.
Nao salve o JSON nem o Base64 no repositorio.

## Persistencia inicial

O backend usa o volume persistente `aimerc_data` montado em `/app/data`. Na primeira inicializacao,
se o volume estiver vazio e `DATABASE_URL` estiver configurada, o container restaura automaticamente
os cadastros, catalogo e pedidos do PostgreSQL para o volume antes de iniciar a API.

Nao publique o servico sem esse volume, pois uma recriacao sem restauracao apagaria pedidos recentes.

O PostgreSQL informado recebe a migracao dos dados atuais, mas a troca do driver principal deve ser
validada antes de remover o volume SQLite. Ate essa validacao, mantenha ambos e use apenas uma replica
do backend para evitar concorrencia sobre o arquivo SQLite.

## Recomendacao de seguranca

Troque o acesso por IP por dominios HTTPS antes de publicar o aplicativo Android. Android e navegadores
podem bloquear trafego HTTP e credenciais nao devem trafegar sem TLS.
