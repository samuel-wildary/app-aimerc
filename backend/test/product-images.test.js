import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const temporaryData = fs.mkdtempSync(path.join(os.tmpdir(), 'aimerc-images-'));
process.env.AIMERC_DATA_DIR = temporaryData;
process.env.NODE_ENV = 'test';
const { productImage } = await import('../src/lib/product-images.js');

test('imagem do produto fica disponivel no cache do backend', async t => {
  t.after(() => fs.rmSync(temporaryData, { recursive: true, force: true }));
  const bytes = Buffer.from('imagem-de-teste');
  const source = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'image/png');
    res.end(bytes);
  });
  await new Promise(resolve => source.listen(0, '127.0.0.1', resolve));
  const port = source.address().port;
  const product = { id: 'produto-1', image: `http://127.0.0.1:${port}/produto.png` };

  const first = await productImage('loja-1', product);
  assert.deepEqual(first.data, bytes);
  await new Promise(resolve => source.close(resolve));

  const cached = await productImage('loja-1', product);
  assert.deepEqual(cached.data, bytes);
  assert.equal(cached.contentType, 'image/png');
});
