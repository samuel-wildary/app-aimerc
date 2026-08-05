# AiMerc Pedidos Agent (app com janela)

Abre um programa com:

- e-mail e senha (iguais ao painel web)
- busca de impressoras termicas na rede (porta 9100)
- conectar / desconectar
- impressao automatica dos pedidos novos

## Rodar no Mac (desenvolvimento)

```bash
cd print-agent
npm install
npm run desktop
```

## Gerar o app no Desktop

```bash
npm run desktop:mac
```

Copia a pasta `AiMerc Pedidos Agent-darwin-x64/AiMerc Pedidos Agent.app` para o Desktop.

## Como usar

1. Abra o app
2. Digite e-mail e senha do gestor
3. Clique em **Buscar na rede** e escolha a termica
4. Clique em **Conectar**
5. Deixe aberto — pedidos novos imprimem sozinhos
