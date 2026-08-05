# AiMerc Pedidos Agent (app + servico)

App com janela para configurar, e **servico em segundo plano** para nao parar.

## O que ele faz

1. Voce abre o app, entra com e-mail/senha e escolhe a termica
2. Clica **Conectar e iniciar servico**
3. Pode fechar a janela — fica no icone da barra de menus
4. No Mac ou Windows, o agent pode subir sozinho quando o PC ligar (LaunchAgent / login item)
5. Se a conexao cair, ele reconecta sozinho


## Windows

```bash
cd print-agent
npm install
npm run desktop:windows
```

Gera `dist-desktop/AiMerc-Pedidos-Agent-Windows.zip` com o app Electron.

No app:
- **Conectar e iniciar servico** → conecta + ativa inicio automatico no Windows
- **Ativar inicio automatico** / **Remover inicio automatico**

O instalador tambem pode ser baixado pelo painel da loja em **Integracao**.

## Mac

```bash
cd print-agent
npm install
npm run desktop          # desenvolvimento
npm run desktop:mac      # gera o .app
```

No app:
- **Conectar e iniciar servico** → conecta + ativa inicio automatico
- **Ativar inicio automatico** / **Remover inicio automatico**

## Importante

- O agent precisa do PC ligado (e logado) para imprimir
- A termica precisa estar na rede local
- Nao rode duas copias do app; a segunda so abre a janela da que ja esta no fundo
