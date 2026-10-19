const {test, afterEach, mock} = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const {Product} = require('../models/Product');
const {Subscriber} = require('../models/Subscriber');
const {listProducts, getProduct} = require('../services/productService');
const {listReviews} = require('../services/reviewService');
const {errorHandler} = require('../middleware/errorHandler');

afterEach(() => mock.restoreAll());
test('cart quotes reject invalid quantities and product IDs before database access', async () => {
  const {quote}=require('../services/checkoutService');
  const lookup=mock.method(Product,'find',()=>{throw new Error('Must not query')});
  const item={productId:'aaaaaaaaaaaaaaaaaaaaaaaa',quantity:1,size:'M',color:'Black'};
  for(const quantity of [-1,0,1.5,'2',null,10001])
    await assert.rejects(quote([{...item,quantity}]),{status:400});
  await assert.rejects(quote([{...item,productId:'bad'}]),{status:400});
  assert.equal(lookup.mock.callCount(),0);
});
test('invalid product links return not-found before database access', async () => {
  const lookup = mock.method(Product, 'findOne', () => { throw new Error('Unexpected lookup'); });
  await assert.rejects(getProduct('missing-product'), {status:404});
  await assert.rejects(listReviews('missing-product'), {status:404});
  assert.equal(lookup.mock.callCount(), 0);
});
test('sale browsing filters discounted products and keeps requested sorting', async () => {
  let filter, sort;
  mock.method(Product, 'find', value => {
    filter=value;
    return {sort(value){sort=value;return this},skip(){return this},limit(){return this},lean:async()=>[]};
  });
  mock.method(Product, 'countDocuments', async()=>0);
  await listProducts({sale:'true',sort:'newest'});
  assert.deepEqual(filter.$expr, {$gt:['$oldPrice','$price']});
  assert.deepEqual(sort, {createdAt:-1,_id:-1});
});
test('newsletter endpoint accepts normalized emails and rejects invalid input', async t => {
  const write=mock.method(Subscriber,'updateOne',async()=>({acknowledged:true}));
  const app=express();app.use(express.json());app.use('/api/newsletter',require('../routes/newsletterRoutes'));app.use(errorHandler);
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const send=email=>fetch(`http://127.0.0.1:${server.address().port}/api/newsletter`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email})});
  assert.equal((await send('bad')).status,400);
  assert.equal(write.mock.callCount(),0);
  assert.equal((await send(' Reader@Example.com ')).status,200);
  assert.deepEqual(write.mock.calls[0].arguments[0],{email:'reader@example.com'});
});
