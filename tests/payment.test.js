const { test, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Stripe = require('stripe');
const config = require('../config/stripe');
const orders = require('../services/orderService');
const service = require('../services/paymentService');
const { Order } = require('../models/Order');
const { Product } = require('../models/Product');
const emails = require('../services/orderEmailService');
afterEach(()=>mock.restoreAll());
function fixture(t) {
 mock.method(emails,'enqueue',async()=>{});mock.method(emails,'deliver',async()=>({status:'sent'}));
 const old = process.env.STRIPE_WEBHOOK_SECRET; process.env.STRIPE_WEBHOOK_SECRET='whsec_unit_test';
 t.after(()=>{if(old===undefined) delete process.env.STRIPE_WEBHOOK_SECRET; else process.env.STRIPE_WEBHOOK_SECRET=old;});
 const order={_id:'aaaaaaaaaaaaaaaaaaaaaaaa',user:'bbbbbbbbbbbbbbbbbbbbbbbb',status:'awaiting_payment',paymentStatus:'unpaid',paymentMethod:'stripe',total:79,subtotal:80,discount:16,deliveryFee:15,currency:'USD',shipping:{email:'test@example.com'},items:[{productId:'cccccccccccccccccccccccc',quantity:1,name:'Shorts',size:'M',color:'green'}],stripeExpiresAt:new Date(Date.now()+3600000)};
 const session={id:'cs_test_example',status:'open',payment_status:'unpaid',mode:'payment',livemode:false,client_reference_id:order._id,metadata:{orderId:order._id,userId:order.user},amount_total:7900,currency:'usd',url:'https://checkout.stripe.com/c/pay/cs_test_example',payment_intent:'pi_test_example'};
 const client={checkout:{sessions:{create:mock.fn(async()=>session),retrieve:mock.fn(async()=>session)}},webhooks:new Stripe('sk_test_dummy').webhooks};
 mock.method(config,'stripe',()=>client);
 mock.method(orders,'createOrder',async()=>({order}));
 mock.method(Order,'findOne',async()=>order); mock.method(Order,'findById',async()=>order);
 mock.method(Order,'updateOne',async()=>({modifiedCount:1}));
 mock.method(Order,'findOneAndUpdate',async()=>order);
 mock.method(Product,'updateOne',async()=>({modifiedCount:1}));
 const transaction={withTransaction:async f=>f(),endSession:mock.fn(async()=>{})};
 mock.method(mongoose,'startSession',async()=>transaction);
 return {order,session,client,transaction};
}
test('session totals are built from saved order amounts and retry key is stable',async t=>{
 const {order,client}=fixture(t);
 const result=await service.startCheckout(order.user,{total:1},'request-key');
 const [params,options]=client.checkout.sessions.create.mock.calls[0].arguments;
 assert.equal(params.line_items.reduce((sum,l)=>sum+l.quantity*l.price_data.unit_amount,0),7900);
 assert.deepEqual(params.allowed_payment_method_types,['card']);
 assert.equal(options.idempotencyKey,'shopco-'+order._id);
 assert.equal(params.metadata.userId,order.user);
 assert.equal(result.sessionId,'cs_test_example');
 assert.equal(Order.findOneAndUpdate.mock.callCount(),0);
});
test('existing Stripe session is reused without creating another',async t=>{
 const {order,client}=fixture(t); order.stripeSessionId='cs_test_example';
 await service.startCheckout(order.user,{},'request-key');
 assert.equal(client.checkout.sessions.create.mock.callCount(),0);
 assert.equal(client.checkout.sessions.retrieve.mock.callCount(),1);
});
test('wrong amount, currency, owner, mode and session cannot mark order paid',async t=>{
 const {order,session}=fixture(t);
 for(const change of [{amount_total:1},{currency:'eur'},{livemode:true},{mode:'subscription'},{metadata:{orderId:order._id,userId:'different'}}])
  assert.throws(()=>service.verifySession(order,{...session,...change}),{status:409});
 order.stripeSessionId='cs_test_different';
 assert.throws(()=>service.verifySession(order,session),{status:409});
});
test('unpaid sessions do not confirm orders',async t=>{
 const {session}=fixture(t); await service.applySession(session);
 assert.equal(Order.findOneAndUpdate.mock.callCount(),0);
});
test('successful payment uses a conditional transaction and does not decrement stock again',async t=>{
 const {session,transaction}=fixture(t); session.status='complete';session.payment_status='paid';
 await service.applySession(session);
 const [filter,update,options]=Order.findOneAndUpdate.mock.calls[0].arguments;
 assert.equal(filter.paymentStatus,'unpaid');assert.equal(filter.status,'awaiting_payment');
 assert.equal(update.$set.paymentStatus,'paid');assert.equal(options.session,transaction);
 assert.equal(Product.updateOne.mock.callCount(),0);assert.equal(transaction.endSession.mock.callCount(),1);
});
test('expiration restores reserved inventory once even if event repeats',async t=>{
 const {session,order}=fixture(t); session.status='expired';
 let first=true; Order.findOneAndUpdate.mock.mockImplementation(async()=>{if(!first)return null;first=false;return order;});
 await service.applySession(session);await service.applySession(session);
 assert.equal(Product.updateOne.mock.callCount(),1);
 assert.deepEqual(Product.updateOne.mock.calls[0].arguments[1],{$inc:{stock:1,sales:-1}});
});
test('status endpoint scopes lookup to signed in user',async t=>{
 fixture(t);Order.findOne.mock.mockImplementation(async()=>null);
 await assert.rejects(service.checkoutStatus('different-user','cs_test_example'),{status:404});
 assert.equal(Order.findOne.mock.calls[0].arguments[0].user,'different-user');
});
test('bad webhook signatures are rejected; authentic test completion is handled',async t=>{
 const {session,client}=fixture(t);session.status='complete';session.payment_status='paid';
 const payload=JSON.stringify({id:'evt_unit',livemode:false,type:'checkout.session.completed',data:{object:session}});
 await assert.rejects(service.webhook(Buffer.from(payload),'bad'),{status:400});
 assert.equal(Order.findOne.mock.callCount(),0);
 const signature=client.webhooks.generateTestHeaderString({payload,secret:'whsec_unit_test'});
 assert.deepEqual(await service.webhook(Buffer.from(payload),signature),{received:true});
 assert.equal(Order.findOneAndUpdate.mock.callCount(),1);
});
test('Stripe failures preserve the order for safe retry',async t=>{
 const {order,client}=fixture(t);
 client.checkout.sessions.create.mock.mockImplementation(async()=>{throw new Error('network failure');});
 await assert.rejects(service.startCheckout(order.user,{},'request-key'),{status:502});
 assert.equal(Order.findOneAndUpdate.mock.callCount(),0);
 assert.equal(Product.updateOne.mock.callCount(),0);
});

test('cancel expires an open session and restores stock',async t=>{
 const {session,client}=fixture(t);
 client.checkout.sessions.expire=mock.fn(async()=>({...session,status:'expired'}));
 const result=await service.cancelCheckout('bbbbbbbbbbbbbbbbbbbbbbbb','cs_test_example');
 assert.equal(result.status,'expired');assert.equal(client.checkout.sessions.expire.mock.callCount(),1);
 assert.equal(Product.updateOne.mock.callCount(),1);
});

test('GST is exactly 16 percent of discounted merchandise, excluding delivery', async t => {
 const {order}=fixture(t); order.gst=10.24; order.total=89.24;
 const params=service.sessionParameters(order);
 assert.equal(params.line_items.find(l=>l.price_data.product_data.name==='GST (16%)').price_data.unit_amount,1024);
 assert.equal(params.line_items.reduce((n,l)=>n+l.price_data.unit_amount*l.quantity,0),8924);
});

test('embedded card checkout returns an owner-scoped client secret and saved shipping name',async t=>{
 const {order,session,client}=fixture(t);
 order.shipping.firstName='Ada';order.shipping.lastName='van Rossum';
 session.ui_mode='elements';session.client_secret='cs_test_example_secret_test';session.url=null;
 const result=await service.startCheckout(order.user,{checkoutUi:'elements',customerName:'Untrusted name'},'request-key');
 const [params]=client.checkout.sessions.create.mock.calls[0].arguments;
 assert.equal(params.ui_mode,'elements');assert.ok(params.return_url.endsWith('/checkout?session_id={CHECKOUT_SESSION_ID}'));
 assert.equal(params.success_url,undefined);assert.equal(params.cancel_url,undefined);
 assert.equal(result.clientSecret,session.client_secret);assert.equal(result.customerName,'Ada van Rossum');
});

test('retrying a hosted session keeps its original redirect flow',async t=>{
 const {order,client}=fixture(t);order.stripeSessionId='cs_test_example';
 const result=await service.startCheckout(order.user,{checkoutUi:'elements'},'request-key');
 assert.equal(client.checkout.sessions.create.mock.callCount(),0);
 assert.equal(result.clientSecret,undefined);assert.ok(result.url.startsWith('https://checkout.stripe.com/'));
});
