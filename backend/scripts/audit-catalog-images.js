/**
 * Audita o banco de imagens (catalog_assets) e lista mismatches descricao x foto.
 *
 * Uso (VPS, com DATABASE_URL e opcionalmente chave OpenAI):
 *   node backend/scripts/audit-catalog-images.js
 *   node backend/scripts/audit-catalog-images.js --limit=5000
 *   node backend/scripts/audit-catalog-images.js --no-ai
 *   node backend/scripts/audit-catalog-images.js --delete
 */
import { runCatalogImageAudit } from '../src/lib/catalog-audit.js';

const args = process.argv.slice(2);
const getArg = name => {
  const hit = args.find(item => item.startsWith(`${name}=`));
  return hit ? hit.slice(name.length + 1) : null;
};

const limit = Number(getArg('--limit') ?? process.env.AUDIT_LIMIT ?? 3000);
const useAi = !args.includes('--no-ai') && process.env.AUDIT_NO_AI !== '1';
const deleteMismatches = args.includes('--delete') || process.env.AUDIT_DELETE === '1';

async function main() {
  if (!String(process.env.DATABASE_URL || '').trim()) {
    console.error('Defina DATABASE_URL antes de executar.');
    process.exit(1);
  }

  console.log(`Auditoria catalogo | limit=${limit} useAi=${useAi} delete=${deleteMismatches}`);
  const summary = await runCatalogImageAudit({
    limit,
    useAi,
    deleteMismatches,
    onProgress: progress => {
      if (progress.phase === 'AI' && progress.examined % 25 === 0) {
        console.log(`[AI] ${progress.examined}/${progress.total} · flagged=${progress.flagged} · aiMismatch=${progress.aiMismatches}`);
      }
      if (progress.phase === 'HEURISTICS') {
        console.log(`[HEURISTICS] flagged=${progress.flagged} duplicates=${progress.duplicateGroups}`);
      }
    }
  });

  console.log('\n=== RESUMO ===');
  console.log({
    flagged: summary.flagged,
    deleted: summary.deleted,
    duplicateGroups: summary.duplicateGroups,
    aiChecked: summary.aiChecked,
    aiMismatches: summary.aiMismatches,
    message: summary.message
  });

  const top = (summary.mismatches || []).slice(0, 40);
  for (const item of top) {
    console.log(`- ${item.ean} | ${item.type} | ${String(item.description || '').slice(0, 60)} | ${item.reason}`);
  }
  if ((summary.mismatches || []).length > top.length) {
    console.log(`... +${summary.mismatches.length - top.length} erros`);
  }
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
