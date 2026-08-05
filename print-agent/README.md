# AiMerc Pedidos Agent

Um unico agent no PC/Mac da loja:

1. Faz login na VPS com o **mesmo email/senha do painel web**
2. Abre WebSocket e escuta **pedidos** daquela loja
3. Se `PRINTER_HOST` estiver configurado, imprime o cupom sozinho na termica

## Configuracao (.env ao lado do executavel)

```env
AIMERC_API_URL=https://wildhub-aimerc-backend-app.5mos1l.easypanel.host/api
AIMERC_EMAIL=gestor@sua-loja.com
AIMERC_PASSWORD=sua_senha
PRINTER_HOST=192.168.1.50
PRINTER_PORT=9100
AUTO_PRINT=true
```

- Email/senha: iguais ao login do Chrome no painel
- `PRINTER_HOST`: IP da termica **na rede da loja** (nunca na VPS)

## Mac (executavel)

```bash
cd print-agent
npm install
npm run build:mac
# sai em dist/AiMerc-Print-Agent
cp .env.example dist/.env
# edite dist/.env
./dist/AiMerc-Print-Agent
```

Teste de impressao:

```bash
./dist/AiMerc-Print-Agent --test-print
```

## Windows

No PC Windows:

```bash
npm install
npm run build:windows
```

Gera `dist/AiMerc-Print-Agent.exe`.

## Health

`http://127.0.0.1:4177/health`

O painel (Loja & App) usa esse endereco para mostrar se o agent esta online.
