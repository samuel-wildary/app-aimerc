import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const credentialsPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH
  || path.resolve(currentDir, '..', '..', 'secrets', 'firebase-service-account.json');

function firebaseApp() {
  if (getApps().length) return getApps()[0];
  if (!fs.existsSync(credentialsPath)) throw new Error('Credencial Firebase nao configurada no backend');
  const serviceAccount = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
  return initializeApp({ credential: cert(serviceAccount), projectId: serviceAccount.project_id });
}

export function firebaseStatus() {
  return { configured: fs.existsSync(credentialsPath) };
}

export async function sendFirebaseNotification(tokens, campaign) {
  if (!tokens.length) return { successCount: 0, failureCount: 0, invalidTokens: [] };
  const messaging = getMessaging(firebaseApp());
  let successCount = 0;
  let failureCount = 0;
  const invalidTokens = [];

  for (let index = 0; index < tokens.length; index += 500) {
    const batch = tokens.slice(index, index + 500);
    const response = await messaging.sendEachForMulticast({
      tokens: batch,
      notification: { title: campaign.title, body: campaign.body },
      data: { campaignId: campaign.id, title: campaign.title, body: campaign.body },
      android: { priority: 'high', notification: { channelId: 'aimerc_offers', sound: 'default' } }
    });
    successCount += response.successCount;
    failureCount += response.failureCount;
    response.responses.forEach((result, position) => {
      const code = result.error?.code || '';
      if (code.includes('registration-token-not-registered') || code.includes('invalid-registration-token')) invalidTokens.push(batch[position]);
    });
  }
  return { successCount, failureCount, invalidTokens };
}
