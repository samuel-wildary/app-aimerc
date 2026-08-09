# Monitoramento AiMerc

O backend expõe dois endpoints de saúde e loga cada requisição em JSON.

## Endpoints

- `GET /api/health` — API + banco no ar. Responde `{"ok": true, ...}`.
- `GET /api/health/integrations` — saúde do sync ERP das lojas.
  - `200 {"status":"HEALTHY","stores":N}` — tudo sincronizando.
  - `503 {"status":"UNHEALTHY","stores":[...]}` — alguma loja com sync em erro
    ou sem sincronizar há 3x o intervalo configurado (mínimo de 15 minutos).

## Alertas (UptimeRobot — grátis)

1. Crie uma conta em https://uptimerobot.com.
2. Adicione um monitor **HTTP(s)** para `https://<sua-api>/api/health`
   (intervalo de 5 min). Alerta quando ficar fora do ar.
3. Adicione um monitor **Keyword** para `https://<sua-api>/api/health/integrations`:
   - Keyword: `HEALTHY`
   - Alerta: quando a palavra **não existir** (pega tanto API fora quanto sync quebrado).
4. Configure o contato de alerta (e-mail/app do UptimeRobot).

## Logs

Cada requisição gera uma linha JSON no stdout do container:

```json
{"type":"http","method":"GET","path":"/api/public/stores/loja/products","status":200,"ms":12,"storeId":null}
```

Erros não tratados viram `{"type":"unhandledRejection",...}`.

Para ver: EasyPanel → serviço do backend → aba **Logs**.
Para achar erros de uma loja, filtre por `"storeId":"<id>"` ou pelo path da rota.
