import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectCommand } from '@aws-sdk/client-s3';
const execFileAsync = promisify(execFile);
const databaseUrl = String(process.env.DATABASE_URL || '').trim();
if (!databaseUrl) throw new Error('DATABASE_URL nao configurada');
const accountId = String(process.env.AIMERC_R2_ACCOUNT_ID || '').trim();
const accessKeyId = String(process.env.AIMERC_R2_ACCESS_KEY_ID || '').trim();
const secretAccessKey = String(process.env.AIMERC_R2_SECRET_ACCESS_KEY || '').trim();
const bucket = String(process.env.AIMERC_R2_BUCKET || '').trim();
if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
  throw new Error('Configure AIMERC_R2_ACCOUNT_ID, AIMERC_R2_ACCESS_KEY_ID, AIMERC_R2_SECRET_ACCESS_KEY e AIMERC_R2_BUCKET');
}
const PREFIX = 'backups/postgres/';
const RETENTION_DAYS = 14;
const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId, secretAccessKey },
});
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const file = path.join(os.tmpdir(), `aimerc-${timestamp}.dump`);
console.log('Gerando dump...');
await execFileAsync('pg_dump', ['--dbname', databaseUrl, '--format=custom', '--compress', '6', '--file', file], { maxBuffer: 64 * 1024 * 1024 });
const { size } = fs.statSync(file);
if (size < 1024) throw new Error(`Dump suspeito (apenas ${size} bytes)`);
const key = `${PREFIX}aimerc-${timestamp}.dump`;
console.log(`Enviando ${(size / 1024 / 1024).toFixed(1)} MB para r2://${bucket}/${key}`);
await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: fs.createReadStream(file) }));
fs.unlinkSync(file);
const listed = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: PREFIX }));
const cutoff = Date.now() - RETENTION_DAYS * 86_400_000;
let removed = 0;
for (const object of listed.Contents || []) {
  if (object.LastModified && object.LastModified.getTime() < cutoff) {
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: object.Key }));
    removed += 1;
  }
}
console.log(`Backup concluido. Removidos ${removed} backups com mais de ${RETENTION_DAYS} dias.`);
