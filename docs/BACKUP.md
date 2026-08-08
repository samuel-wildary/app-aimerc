# Rotina de Backup AiMerc (PostgreSQL para R2)

O sistema conta com um script de backup automático do PostgreSQL, enviado para o bucket R2 da Cloudflare. 
Os backups têm **retenção de 14 dias** (backups mais antigos são deletados automaticamente pelo próprio script).

## Configurando o Agendamento (Cron)

O script `node scripts/backup-postgres.js` deve ser rodado **diariamente às 04:17 da manhã** (horário de menor movimento).

### Opção 1: Via EasyPanel (Recomendado)
1. No painel do EasyPanel, vá até o serviço do **backend**.
2. Procure pela seção de tarefas agendadas (Cron / Scheduled Tasks).
3. Adicione uma nova tarefa com:
   - **Comando:** `node scripts/backup-postgres.js`
   - **Expressão Cron:** `17 4 * * *`

### Opção 2: Via crontab do Host
Se o EasyPanel não possuir funcionalidade de cron na versão utilizada, você pode configurar direto no servidor host via crontab:
1. Acesse o host via SSH e digite `crontab -e`.
2. Adicione a seguinte linha (substitua `<container-backend>` pelo nome real do container do backend, que pode ser descoberto com `docker ps`):
   ```bash
   17 4 * * * docker exec <container-backend> node scripts/backup-postgres.js >> /var/log/aimerc-backup.log 2>&1
   ```

## Variáveis de Ambiente Necessárias
As seguintes variáveis devem estar presentes no ambiente do backend (podem ser as mesmas usadas para armazenamento de imagens):
- `AIMERC_R2_ACCOUNT_ID`
- `AIMERC_R2_ACCESS_KEY_ID`
- `AIMERC_R2_SECRET_ACCESS_KEY`
- `AIMERC_R2_BUCKET`

## Como Restaurar um Backup

Para restaurar um dump (.dump) gerado por esta rotina, utilize o `pg_restore`. 
**ATENÇÃO:** O comando abaixo com as flags `--clean --if-exists` irá apagar/sobreescrever os dados existentes do banco! Realize isso com cautela.

1. Baixe o arquivo `aimerc-XXXX.dump` do bucket R2 para o seu servidor.
2. Rode o comando de restauração (ajuste `$DATABASE_URL` se não estiver configurada no ambiente):
   ```bash
   pg_restore --dbname "$DATABASE_URL" --clean --if-exists --no-owner aimerc-XXXX.dump
   ```
