const {test,afterEach,mock}=require('node:test');
const assert=require('node:assert/strict');
const bcrypt=require('bcryptjs');
const mongoose=require('mongoose');
const {User}=require('../models/User');
const {Cart}=require('../models/Cart');
const {Order}=require('../models/Order');
const {deleteUser}=require('../services/userServices');
afterEach(()=>mock.restoreAll());
async function setup(){
 const user={_id:'aaaaaaaaaaaaaaaaaaaaaaaa',sessionVersion:2,password:await bcrypt.hash('current-password',4)};
 const session={withTransaction:mock.fn(async callback=>callback()),endSession:mock.fn(async()=>{})};
 mock.method(User,'findById',()=>({select:async fields=>{assert.equal(fields,'+password');return user;}}));
 const start=mock.method(mongoose,'startSession',async()=>session);
 const remove=mock.method(User,'deleteOne',async(filter,options)=>{assert.deepEqual(filter,{_id:user._id,password:user.password,sessionVersion:2});assert.equal(options.session,session);return{deletedCount:1};});
 const cart=mock.method(Cart,'deleteMany',async(filter,options)=>{assert.deepEqual(filter,{user:user._id});assert.equal(options.session,session);});
 const orders=mock.method(Order,'deleteMany',async()=>{throw new Error('Order history must be retained');});
 return {user,session,start,remove,cart,orders};
}
test('deletion requires current password and allows only the signed-in customer identity',async()=>{
 const {user,start,remove}=await setup();
 for(const body of [undefined,{},[],{currentPassword:''},{currentPassword:42},{currentPassword:'x',userId:'other'},{currentPassword:'x'.repeat(73)}])await assert.rejects(deleteUser(user._id,body),{status:400});
 await assert.rejects(deleteUser(user._id,{currentPassword:'wrong-password'}),{status:403});
 assert.equal(start.mock.callCount(),0);assert.equal(remove.mock.callCount(),0);
});
test('verified deletion removes account and saved cart together, preserves orders, and closes session',async()=>{
 const {user,session,remove,cart,orders}=await setup();
 assert.deepEqual(await deleteUser(user._id,{currentPassword:'current-password'}),{deleted:true});
 assert.equal(remove.mock.callCount(),1);assert.equal(cart.mock.callCount(),1);assert.equal(orders.mock.callCount(),0);assert.equal(session.endSession.mock.callCount(),1);
});
test('changed credentials prevent deletion and cart removal',async()=>{
 const {user,session,cart}=await setup();mock.method(User,'deleteOne',async()=>({deletedCount:0}));
 await assert.rejects(deleteUser(user._id,{currentPassword:'current-password'}),{status:409});
 assert.equal(cart.mock.callCount(),0);assert.equal(session.endSession.mock.callCount(),1);
});
test('database failure propagates and closes transaction without claiming success',async()=>{
 const {user,session}=await setup();mock.method(Cart,'deleteMany',async()=>{throw new Error('Database failure');});
 await assert.rejects(deleteUser(user._id,{currentPassword:'current-password'}),/Database failure/);
 assert.equal(session.endSession.mock.callCount(),1);
});
test('missing customer cannot be deleted',async()=>{
 const {user,start}=await setup();mock.method(User,'findById',()=>({select:async()=>null}));
 await assert.rejects(deleteUser(user._id,{currentPassword:'current-password'}),{status:401});assert.equal(start.mock.callCount(),0);
});
