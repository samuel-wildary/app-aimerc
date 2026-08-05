# AiMerc Print Agent

Imprime automaticamente a guia de separacao na termica **sem dialogo do navegador**.

Quando um pedido novo chega no AiMerc, este programa (rodando no PC da loja) recebe o evento em tempo real e envia o cupom ESC/POS direto para a impressora em rede (`IP:9100`).

## Requisitos

- Windows (ou Linux/macOS) com Node.js 20+
- Termica 80mm acessivel na rede local (Epson, Elgin, Bematech, etc.)
- Conta de gestor da loja (mesmo login do painel)

## Instalacao rapida

```bash
cd print-agent
copy .env.example .env
# edite .env: AIMERC_EMAIL, AIMERC_PASSWORD, PRINTER_HOST
npm start
```

Teste a impressora:

```bash
npm run test-print
```

Health (o painel consulta isso):

```text
http://127.0.0.1:4177/health
```

## Configuracao (.env)

| Variavel | Descricao |
|----------|-----------|
| `AIMERC_API_URL` | URL da API AiMerc |
| `AIMERC_EMAIL` / `AIMERC_PASSWORD` | Login do gestor |
| `AIMERC_TOKEN` | Alternativa: JWT pronto |
| `PRINTER_HOST` | IP da termica (ex.: `192.168.1.50`) |
| `PRINTER_PORT` | Porta raw (padrao `9100`) |
| `HEALTH_PORT` | Porta local do health (padrao `4177`) |

## Iniciar com o Windows

1. Crie um atalho de `npm start` (ou `node src/index.js`) na pasta Inicializar
2. Ou use o Agendador de Tarefas: ao fazer logon, executar `node src\index.js` com pasta inicial `print-agent`

O Chrome **nao precisa** estar aberto. Enquanto o Print Agent estiver rodando, cada pedido novo sai sozinho na termica.

## Painel

Em **Loja & App** o dashboard mostra se o agent local esta online (`127.0.0.1:4177`). O botao **Imprimir guia** no pedido continua disponivel como fallback (com dialogo do navegador).

## Solucao de problemas

- `Timeout ao conectar na impressora`: confira IP, cabo/Wi-Fi e se a porta 9100 esta liberada
- Pedido nao imprime: veja o log do agent; confirme login e se o websocket ficou `Print Agent pronto`
- Cupom com caracteres estranhos: acentuacao e removida no ESC/POS ASCII por compatibilidade
