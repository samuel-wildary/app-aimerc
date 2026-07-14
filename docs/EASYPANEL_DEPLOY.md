# Deploy do AiMerc no EasyPanel

## Servicos

Crie tres aplicativos a partir do mesmo repositorio GitHub:

| Servico | Diretorio | Dockerfile | Porta interna |
| --- | --- | --- | --- |
| API | `backend` | `backend/Dockerfile` | `3000` |
| Painel do supermercado | `supermarket-dashboard` | `supermarket-dashboard/Dockerfile` | `80` |
| Administracao SaaS | `saas-admin` | `saas-admin/Dockerfile` | `80` |

O arquivo `easypanel-compose.yml` serve como referencia caso o projeto use o modo Docker Compose.

## Variaveis da API

Configure no EasyPanel:

```env
PORT=3000
NODE_ENV=production
AIMERC_TOKEN_SECRET=UMA_CHAVE_ALEATORIA_FORTE
AIMERC_ALLOWED_ORIGINS=http://31.97.252.6:4201,http://31.97.252.6:4202
DATABASE_URL=postgres://USUARIO:SENHA@31.97.252.6:5540/aimerc?sslmode=disable
```

Nao grave a senha real em arquivos versionados. Use o painel de variaveis secretas do EasyPanel.

## URL da API nos frontends

Adicione como argumento de build nos dois frontends:

```env
VITE_API_URL=http://31.97.252.6:3000/api
```

## Firebase

Monte o JSON da conta de servico como arquivo secreto em:

```text
/app/secrets/firebase-service-account.json
```

## Persistencia inicial

O backend atual usa SQLite e precisa do volume persistente `aimerc_data` montado em `/app/data`.
Nao publique o servico sem esse volume, pois uma recriacao do container apagaria pedidos e cadastros.

O PostgreSQL informado recebe a migracao dos dados atuais, mas a troca do driver principal deve ser
validada antes de remover o volume SQLite. Ate essa validacao, mantenha ambos e use apenas uma replica
do backend para evitar concorrencia sobre o arquivo SQLite.

## Recomendacao de seguranca

Troque o acesso por IP por dominios HTTPS antes de publicar o aplicativo Android. Android e navegadores
podem bloquear trafego HTTP e credenciais nao devem trafegar sem TLS.
