# Guia do AiMerc para outra IDE

Leia este arquivo antes de alterar o projeto.

## Caminho principal

```text
C:\Users\Samuel Wildary\Desktop\aimerc
```

## O que existe

```text
aimerc/
  backend/                  API, autenticacao e PostgreSQL
  supermarket-dashboard/    Painel do supermercado - porta 4201
  saas-admin/               Painel exclusivo do dono do SaaS - porta 4202
  sync-worker/              Integracao de produtos/precos/estoque
  android-customer-app/     Aplicativo Android do consumidor
  docs/                     Arquitetura e operacao
```

Nao misture `supermarket-dashboard` com `saas-admin`. Sao produtos, logins e permissoes diferentes.

## Servicos locais

| Servico | Endereco |
| --- | --- |
| Backend | http://127.0.0.1:4100/api |
| Dashboard | http://127.0.0.1:4201 |
| SaaS Control | http://127.0.0.1:4202 |

Para iniciar tudo:

```powershell
C:\Users\Samuel Wildary\Desktop\aimerc\run-aimerc-local.cmd
```

## Configuracao local

Copie `backend\.env.example` para `backend\.env.local`. Configure uma base PostgreSQL de desenvolvimento, uma chave de token e suas proprias credenciais administrativas. Nao coloque credenciais de producao nesse arquivo.

## Banco de dados

PostgreSQL e a unica fonte de dados. O Android e os frontends nunca conectam diretamente ao banco: toda leitura e escrita passa pela API.

## Android

Projeto:

```text
C:\Users\Samuel Wildary\Desktop\aimerc\android-customer-app
```

Compilar:

```powershell
cd "C:\Users\Samuel Wildary\Desktop\aimerc\android-customer-app"
$env:JAVA_HOME="C:\Program Files\Android\Android Studio1\jbr"
$env:Path="$env:JAVA_HOME\bin;$env:Path"
.\gradlew.bat :app:assembleDebug
```

APK:

```text
app\build\outputs\apk\debug\app-debug.apk
```

O emulador Android acessa o backend do PC por:

```text
http://10.0.2.2:4100/api
```

Para celular fisico, compile informando a URL HTTPS ou o IP local:

```powershell
.\gradlew.bat :app:assembleDebug -PAIMERC_API_BASE_URL=http://SEU_IP:4100/api
```

## Emulador

- AVD: `Pixel_10_Pro`
- Escala visual: `0.55`
- Janela manual usada: largura `455`, altura `760`, X `90`, Y `70`.

Abrir pelo arquivo da raiz:

```text
ABRIR_EMULADOR_AIMERC.bat
```

Ou pelo comando:

```powershell
& "C:\Users\Samuel Wildary\AppData\Local\Android\Sdk\emulator\emulator.exe" -avd Pixel_10_Pro -scale 0.55
```

Resolucao interna pode ser conferida com:

```powershell
adb shell wm size
adb shell wm density
```

## Testes obrigatorios depois de alterar

```powershell
cd backend
npm test

cd ..\supermarket-dashboard
npm run build

cd ..\saas-admin
npm run build

cd ..\android-customer-app
.\gradlew.bat :app:assembleDebug
```

## Regras que nao devem ser quebradas

1. Nao colocar o SaaS Control dentro da dashboard do supermercado.
2. Nao remover autenticacao dos endpoints operacionais.
3. Nao aceitar `storeId` do navegador para decidir o tenant.
4. Nao colocar chave de ERP, Asaas ou banco dentro do Android.
5. Nao alterar as portas sem atualizar scripts e documentacao.
6. Nao expor `AIMERC_TOKEN_SECRET` ou credenciais reais.
7. Nao habilitar HTTP no build release do Android.
8. Nao alterar `gradle.properties` sem compilar o APK em seguida.

## Estado atual

- Backend PostgreSQL persistente e autenticado.
- Dashboard integrada com pedidos, status, produtos e entregas.
- Painel SaaS integrado com lojas e assinaturas locais.
- Worker sincroniza CSV autenticado.
- Android carrega catalogo real, busca, adiciona ao carrinho e envia checkout.
- Pagamento do consumidor somente na entrega ou retirada.
- Integracao externa Asaas ainda requer credenciais reais e configuracao de webhook.
