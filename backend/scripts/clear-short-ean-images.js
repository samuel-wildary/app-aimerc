/**
 * Remove product_images de produtos com EAN/codigo com menos de 6 digitos.
 *
 * Uso (na VPS / EasyPanel, com DATABASE_URL):
 *   node backend/scripts/clear-short-ean-images.js
 *   node backend/scripts/clear-short-ean-images.js --store=STORE_ID
 *   node backend/scripts/clear-short-ean-images.js --digits=5
 */
import 'dotenv/config';
import { clearShortEanProductImages } from '../src/lib/product-images.js';
import { closePostgres } from '../src/lib/postgres.js';

const args = process.argv.slice(2);
const storeArg = args.find(item => item.startsWith('--store='));
const digitsArg = args.find(item => item.startsWith('--digits='));
const storeId = storeArg ? storeArg.split('=')[1] : null;
// <= 5 digitos = menos de 6
const maxDigits = digitsArg ? Number(digitsArg.split('=')[1]) : 5;

const result = await clearShortEanProductImages({ storeId, maxDigits });
console.log(JSON.stringify(result, null, 2));
await closePostgres();
