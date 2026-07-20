# AiMerc

## Integracoes de supermercado

O pacote `sync-agent` conecta SysPDV, Varejo Facil, Solicom configuravel e APIs JSON ao backend sem expor o servidor local da loja. Consulte `docs/INTEGRACOES_ERP.md` para instalacao, seguranca e homologacao.

SaaS de e-commerce para supermercados com aplicativo Android, operacao web, painel administrativo e sincronizacao de ERP.

## Modulos

- `android-customer-app`: catalogo, busca, carrinho e checkout do consumidor.
- `supermarket-dashboard`: pedidos, separacao, estoque e entregas da loja.
- `saas-admin`: clientes, planos, receita recorrente e assinaturas da plataforma.
- `backend`: API autenticada com persistencia 100% PostgreSQL para lojas, usuarios, produtos, imagens, pedidos, banners e campanhas.
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

## Configuracao local

Copie `backend/.env.example` para `backend/.env.local`, informe um PostgreSQL de desenvolvimento e defina suas proprias credenciais. Nao existem senhas de demonstracao fixas no codigo.

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

URL publica da API deve usar HTTPS:

```text
https://api.seudominio.com.br/api
```

Os dados locais podem ser enviados ao PostgreSQL com:

```powershell
cd backend
$env:DATABASE_URL="postgres://USUARIO:SENHA@HOST:PORTA/BANCO?sslmode=disable"
npm run migrate:legacy-sqlite
```

A senha real nunca deve ser salva no GitHub. PostgreSQL e a fonte oficial de lojas, usuarios, produtos, imagens, pedidos, banners e campanhas. O volume `/app/data` e necessario apenas na primeira implantacao que importa os arquivos SQLite legados; depois da validacao, novas replicas dependem somente do PostgreSQL.
