const { test, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { User } = require('../models/User');
const { updateUser } = require('../services/userServices');
const { auth } = require('../middleware/auth');
afterEach(() => mock.restoreAll());
async function setup(t) {
 const previous=process.env.JWT_SECRET;
 process.env.JWT_SECRET='test-only-secret-longer-than-thirty-two-characters';
 t.after(()=>{if(previous===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=previous;});
 const user={_id:'aaaaaaaaaaaaaaaaaaaaaaaa',firstName:'Ada',lastName:'Lovelace',name:'Ada Lovelace',email:'ada@example.com',phone:'',sessionVersion:0,password:await bcrypt.hash('current-password',4)};
 mock.method(User,'findById',()=>({select:async()=>user}));
 const writes=mock.method(User,'findOneAndUpdate',async(filter,update,options)=>{assert.equal(options.runValidators,true);return {...user,...update.$set,sessionVersion:user.sessionVersion+(update.$inc?.sessionVersion||0)};});
 return {user,writes};
}
test('profile update trims names, normalizes phone, preserves password and omits secrets',async t=>{
 const {user,writes}=await setup(t);
 const result=await updateUser(user._id,{firstName:' Grace ',lastName:' Hopper ',phone:'+92 300 1234567'});
 assert.equal(result.user.name,'Grace Hopper');assert.equal(result.user.phone,'+92 300 1234567');
 assert.equal(result.user.password,undefined);assert.equal(result.user.sessionVersion,undefined);
 assert.equal(writes.mock.calls[0].arguments[1].$set.password,undefined);
 assert.equal(jwt.verify(result.token,process.env.JWT_SECRET).sessionVersion,0);
});
test('email and password updates need only an authenticated account and replace token version',async t=>{
 const {user,writes}=await setup(t);
 const result=await updateUser(user._id,{email:' NEW@example.com ',newPassword:'new-long-password'});
 assert.equal(result.user.email,'new@example.com');
 assert.ok(await bcrypt.compare('new-long-password',writes.mock.calls[0].arguments[1].$set.password));
 assert.equal(result.requiresLogin,true);
 assert.equal(result.token,undefined);
});
test('email-only and password-only updates work without current password',async t=>{
 const {user,writes}=await setup(t);
 const email=await updateUser(user._id,{email:'new@example.com'});
 assert.equal(email.user.email,'new@example.com');
 assert.equal(jwt.verify(email.token,process.env.JWT_SECRET).sessionVersion,1);
 assert.equal(email.requiresLogin,undefined);
 assert.equal(writes.mock.calls[0].arguments[1].$set.password,undefined);
 const password=await updateUser(user._id,{newPassword:'another-long-password'});
 assert.equal(password.user.email,user.email);
 assert.equal(password.requiresLogin,true);
 assert.equal(password.token,undefined);
 assert.ok(await bcrypt.compare('another-long-password',writes.mock.calls[1].arguments[1].$set.password));
});
test('invalid fields and password limits fail without writes',async t=>{
 const {user,writes}=await setup(t);
 for(const change of [{},{firstName:' '},{lastName:'x'.repeat(101)},{email:'bad'},{phone:'123'},{phone:'abc1234567'},{phone:123},{newPassword:'short'},{newPassword:'😀'.repeat(25)},{role:'admin'},{userId:'other'},{password:'unsafe'}])await assert.rejects(updateUser(user._id,change),{status:400});
 assert.equal(writes.mock.callCount(),0);
});
test('duplicate email and concurrent account changes return conflict',async t=>{
 const {user}=await setup(t);
 mock.method(User,'findOneAndUpdate',async()=>{throw Object.assign(new Error('duplicate'),{code:11000});});
 await assert.rejects(updateUser(user._id,{email:'other@example.com'}),{status:409});
 mock.method(User,'findOneAndUpdate',async()=>null);
 await assert.rejects(updateUser(user._id,{firstName:'Grace'}),{status:409});
});
test('auth rejects old credential sessions but accepts matching and legacy versions',async t=>{
 const {user}=await setup(t);
 const sign=version=>jwt.sign(version===undefined?{}:{sessionVersion:version},process.env.JWT_SECRET,{subject:user._id,issuer:'shopco-api',audience:'shopco',expiresIn:'1h'});
 mock.method(User,'findById',async()=>({...user,sessionVersion:1}));
 await assert.rejects(auth({headers:{authorization:'Bearer '+sign(0)}},{},()=>{}),{status:401});
 let next=false;await auth({headers:{authorization:'Bearer '+sign(1)}},{},()=>{next=true;});assert.ok(next);
 mock.method(User,'findById',async()=>({...user,sessionVersion:undefined}));
 next=false;await auth({headers:{authorization:'Bearer '+sign(undefined)}},{},()=>{next=true;});assert.ok(next);
});
test('account PATCH and DELETE are protected before user data is changed',async t=>{
 await setup(t);
 const express=require('express');const app=express();app.use(express.json());app.use('/api/auth',require('../routes/authRoutes'));
 app.use((error,req,res,next)=>res.status(error.status||500).json({message:error.message}));
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 try{for(const method of ['PATCH','DELETE']){const response=await fetch(`http://127.0.0.1:${server.address().port}/api/auth/me`,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify({firstName:'Changed'})});assert.equal(response.status,401);}}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});


test('reusing the current password rejects the entire update without changing session or profile',async t=>{
 const {user,writes}=await setup(t);
 await assert.rejects(updateUser(user._id,{firstName:'Changed',email:'changed@example.com',newPassword:'current-password'}),{status:400,message:'New password must be different from your current password.'});
 assert.equal(writes.mock.callCount(),0);
 assert.equal(user.sessionVersion,0);
 assert.equal(user.firstName,'Ada');
 assert.ok(await bcrypt.compare('current-password',user.password));
});
