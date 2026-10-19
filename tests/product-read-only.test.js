const { test, mock } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const service = require('../services/productService');

test('storefront products support browsing and reject product writes', async t => {
  mock.method(service, 'listProducts', async () => ({ data: [], pagination: { total: 0 } }));
  mock.method(service, 'getProduct', async id => ({ _id: id, name: 'QA product' }));
  t.after(() => mock.restoreAll());
  const app = express();
  app.use(express.json());
  app.use('/api/products', require('../routes/productRoutes'));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/api/products`;
  assert.equal((await fetch(base)).status, 200);
  assert.equal((await fetch(base + '/000000000000000000000001')).status, 200);
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    for (const path of ['', '/000000000000000000000001']) {
      const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json' }, body: '{}' });
      assert.equal(response.status, 404, `${method} ${path || '/'} must not expose a write endpoint`);
    }
  }
  assert.equal(service.createProduct, undefined);
  assert.equal(service.updateProduct, undefined);
  assert.equal(service.deleteProduct, undefined);
});
