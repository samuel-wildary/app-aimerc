# AiMerc Sync Agent

Ponte segura entre o ERP instalado na rede do supermercado e o backend AiMerc. O agente inicia a conexao de dentro para fora; nenhuma porta do servidor local precisa ser exposta na internet.

## Perfis

- `SYSPDV`: SysPDV e SysPDV Web, da Casa Magalhaes.
- `VAREJO_FACIL`: Varejo Facil, da Casa Magalhaes.
- `SOLIDCON`: perfil validado com o JSON real de produtos, estoque, precos e categorias.
- `SOLICOM`: perfil configuravel; os campos finais dependem do manual da versao instalada.
- `GENERIC_JSON`: qualquer API REST JSON mapeavel.

## Instalador Windows

Execute `npm install` e `npm run build:windows`. O arquivo pronto para distribuir sera criado em `dist/AiMerc-Agent-Setup.exe`.

O mesmo instalador atende todos os supermercados. Durante a instalacao, informe o token gerado no SaaS, selecione o ERP e configure a URL local. A opcao `Iniciar automaticamente com o Windows` registra o agente como tarefa continua em segundo plano usando a conta `SYSTEM`; nenhuma porta da loja e exposta na internet. Mesmo sem essa opcao, o agente inicia ao concluir a instalacao, mas nao volta sozinho depois de reiniciar o computador.

Quando a API local do ERP nao exige senha, selecione `NONE`: nenhuma credencial ou cabecalho de autenticacao sera enviado ao ERP. O token da loja continua necessario para autorizar o envio ao backend AiMerc.

O perfil escolhido fornece apenas os campos padrao. O mapeamento avancado salvo no SaaS pode trocar caminho da lista, SKU, EAN, nome, categoria, precos, estoque, unidade e situacao ativa sem recompilar ou reinstalar o agente.

Configuracao e logs ficam em `C:\ProgramData\AiMerc\SyncAgent`. O executavel fica em `C:\Program Files\AiMerc\Sync Agent`.

### SysPDV com banco Firebird

Para instalacoes do SysPDV sem API HTTP, selecione `FIREBIRD` no assistente. Informe o
`isql.exe` da mesma instalacao do Firebird usada pelo SysPDV, o servidor e porta, o
caminho ou alias do banco, o usuario e a senha. O agente usa uma transacao
explicitamente `READ ONLY` e executa apenas consultas `SELECT`.

O conector le:

- produto e preco vigente em `PRODUTO`;
- EAN em `PRODUTOAUX`;
- unidade em `PRODUTO.PROUNID`, incluindo venda por peso por `PROPESVAR`;
- categoria em `SECAO`;
- estoque em `ESTOQUE`, preservando saldo zero;
- oferta ativa em `ENCARTE` e `ENCARTE_PRODUTO`;
- preco anterior em `AUDITORIA_PRECO`, quando existe historico valido anterior ao encarte.

O Firebird nao e exposto na internet. O `isql.exe` e executado localmente e o agente
abre para fora apenas a conexao HTTPS com o backend AiMerc. A senha do banco fica em
`C:\ProgramData\AiMerc\SyncAgent\agent.env`, cuja permissao e limitada a `SYSTEM` e
administradores.

## Instalar manualmente para desenvolvimento

1. Instale Node.js 22 LTS no servidor Windows da loja.
2. Copie `.env.example` para `.env` e preencha o token gerado no SaaS e a URL local do ERP.
3. Teste com `npm run once`.
4. Abra PowerShell como administrador e execute `./install-windows.ps1`.

Se a internet cair, o lote normalizado fica em `data/pending-products.json` e e reenviado na proxima tentativa.
