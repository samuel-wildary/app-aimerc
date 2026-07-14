# AiMerc

SaaS de e-commerce para supermercados com aplicativo Android, operacao web, painel administrativo e sincronizacao de ERP.

## Modulos

- `android-customer-app`: catalogo, busca, carrinho e checkout do consumidor.
- `supermarket-dashboard`: pedidos, separacao, estoque e entregas da loja.
- `saas-admin`: clientes, planos, receita recorrente e assinaturas da plataforma.
- `backend`: API autenticada, persistencia SQLite local e migracao segura para PostgreSQL.
- `sync-worker`: sincronizacao de produtos, precos, imagens e estoque.

## Iniciar localmente

```powershell
C:\Users\Samuel Wildary\Desktop\aimerc\run-aimerc-local.cmd
```

| Modulo | URL |
| --- | --- |
| Backend | http://127.0.0.1:4100/api/health |
| Dashboard | http://127.0.0.1:4201 |
| SaaS Control | http://127.0.0.1:4202 |

## Acessos de desenvolvimento

Dashboard:

```text
gestor@aimerc.local
Aimerc@2026
```

SaaS Control:

```text
admin@aimerc.local
Admin@2026
```

## Validar o projeto

```powershell
cd "C:\Users\Samuel Wildary\Desktop\aimerc\backend"
npm test

cd "C:\Users\Samuel Wildary\Desktop\aimerc\supermarket-dashboard"
npm run build

cd "C:\Users\Samuel Wildary\Desktop\aimerc\saas-admin"
npm run build

cd "C:\Users\Samuel Wildary\Desktop\aimerc\android-customer-app"
$env:JAVA_HOME="C:\Program Files\Android\Android Studio1\jbr"
$env:Path="$env:JAVA_HOME\bin;$env:Path"
.\gradlew.bat :app:assembleDebug
```

APK:

```text
C:\Users\Samuel Wildary\Desktop\aimerc\android-customer-app\app\build\outputs\apk\debug\app-debug.apk
```

## Documentacao

- Arquitetura: `docs\arquitetura.md`
- Guia para outra IDE: `docs\ANTIGRAVITY_GUIA.md`
- Emulador pequeno: `ABRIR_EMULADOR_AIMERC.bat`

## Producao

Antes de publicar, configure HTTPS, `AIMERC_TOKEN_SECRET`, `AIMERC_ALLOWED_ORIGINS`, URL de producao do Android e credenciais/webhooks do Asaas. Os pagamentos do consumidor permanecem na entrega ou retirada.

### EasyPanel

O repositorio possui Dockerfiles independentes para:

- API: `backend/Dockerfile`, porta interna `3000`.
- Painel do supermercado: `supermarket-dashboard/Dockerfile`, porta interna `80`.
- Administracao SaaS: `saas-admin/Dockerfile`, porta interna `80`.

No EasyPanel, use o arquivo `docker-compose.yml` da raiz para criar os tres servicos de uma vez. Consulte [docs/EASYPANEL_DEPLOY.md](docs/EASYPANEL_DEPLOY.md) para configurar volumes, restauracao inicial, Firebase e variaveis secretas.

URL publica planejada para a API:

```text
http://31.97.252.6:3000/api
```

Os dados locais podem ser enviados ao PostgreSQL com:

```powershell
cd backend
$env:DATABASE_URL="postgres://USUARIO:SENHA@HOST:PORTA/BANCO?sslmode=disable"
npm run migrate:postgres
```

A senha real nunca deve ser salva no GitHub. Ate a troca completa do driver principal para PostgreSQL ser validada, o backend precisa do volume persistente `/app/data` e deve executar com apenas uma replica.
