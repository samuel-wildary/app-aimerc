import { query } from './postgres.js';
import { decryptIntegrationSecret, encryptIntegrationSecret } from './store-integration.js';

const AI_AGENT_KEY = 'ai_search_agent';

export async function getPlatformSetting(key) {
  const row = (await query('SELECT value, updated_at FROM platform_settings WHERE key=$1', [key])).rows[0];
  if (!row) return null;
  return { key, value: row.value || {}, updatedAt: row.updated_at };
}

export async function setPlatformSetting(key, value) {
  const result = await query(`
    INSERT INTO platform_settings (key, value, updated_at)
    VALUES ($1, $2::jsonb, NOW())
    ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=NOW()
    RETURNING key, value, updated_at
  `, [key, JSON.stringify(value || {})]);
  return { key: result.rows[0].key, value: result.rows[0].value, updatedAt: result.rows[0].updated_at };
}

export async function getAiSearchAgent() {
  const setting = await getPlatformSetting(AI_AGENT_KEY);
  const value = setting?.value || {};
  const envKey = String(process.env.AIMERC_OPENAI_API_KEY || process.env.OPENAI_API_KEY || '').trim();
  const envModel = String(process.env.AIMERC_OPENAI_MODEL || 'gpt-4o-mini').trim();
  let apiKey = '';
  if (value.encryptedApiKey) {
    try { apiKey = decryptIntegrationSecret(value.encryptedApiKey); } catch { apiKey = ''; }
  }
  if (!apiKey) apiKey = envKey;
  return {
    provider: value.provider || 'openai',
    model: value.model || envModel || 'gpt-5.6-terra',
    hasApiKey: Boolean(apiKey),
    apiKeyConfigured: Boolean(apiKey),
    source: value.encryptedApiKey ? 'settings' : (envKey ? 'env' : 'none'),
    updatedAt: setting?.updatedAt || null,
    // never expose raw key in public responses
  };
}

export async function getAiSearchAgentSecrets() {
  const publicView = await getAiSearchAgent();
  const setting = await getPlatformSetting(AI_AGENT_KEY);
  const value = setting?.value || {};
  let apiKey = '';
  if (value.encryptedApiKey) {
    try { apiKey = decryptIntegrationSecret(value.encryptedApiKey); } catch { apiKey = ''; }
  }
  if (!apiKey) apiKey = String(process.env.AIMERC_OPENAI_API_KEY || process.env.OPENAI_API_KEY || '').trim();
  return {
    ...publicView,
    apiKey,
    model: publicView.model
  };
}

export async function saveAiSearchAgent(input = {}) {
  const current = await getPlatformSetting(AI_AGENT_KEY);
  const currentValue = current?.value || {};
  const next = {
    provider: String(input.provider || currentValue.provider || 'openai').toLowerCase(),
    model: String(input.model || currentValue.model || 'gpt-5.6-terra').trim() || 'gpt-5.6-terra',
    encryptedApiKey: currentValue.encryptedApiKey || ''
  };
  const incomingKey = String(input.apiKey || '').trim();
  if (incomingKey) {
    next.encryptedApiKey = encryptIntegrationSecret(incomingKey);
  }
  if (input.clearApiKey) {
    next.encryptedApiKey = '';
  }
  await setPlatformSetting(AI_AGENT_KEY, next);
  return getAiSearchAgent();
}
