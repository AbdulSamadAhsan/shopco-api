const { test, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const { User } = require('../models/User');
const { createUser, loginUser, publicUser } = require('../services/userServices');
afterEach(() => mock.restoreAll());
function setup(t) {
 const previous = process.env.JWT_SECRET;
 process.env.JWT_SECRET = 'test-only-jwt-secret-with-more-than-32-characters';
 t.after(() => { if (previous === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previous; });
}
test('registration stores separate trimmed names and login returns them without password', async t => {
 setup(t);
 let stored;
 mock.method(User, 'create', async value => (stored = { _id: 'aaaaaaaaaaaaaaaaaaaaaaaa', ...value }));
 const result = await createUser({ firstName: ' Ada ', lastName: ' van Rossum ', email: 'ADA@example.com', phone: ' +92 300 1234567 ', password: 'a-long-test-password' });
 assert.equal(stored.phone, '+92 300 1234567');
 assert.equal(result.user.phone, '+92 300 1234567');
 assert.equal(stored.firstName, 'Ada'); assert.equal(stored.lastName, 'van Rossum');
 assert.equal(result.user.name, 'Ada van Rossum'); assert.equal(result.user.email, 'ada@example.com');
 assert.equal(result.user.password, undefined);
 assert.ok(await bcrypt.compare('a-long-test-password', stored.password));
 mock.method(User, 'findOne', () => ({ select: async () => stored }));
 const signedIn = await loginUser({email:'ada@example.com',password:'a-long-test-password'});
 assert.deepEqual(signedIn.user, result.user);
});
test('legacy accounts expose first and remaining names', () => {
 assert.deepEqual(publicUser({_id:'1',name:'Ada van Rossum',email:'ada@example.com'}),{_id:'1',name:'Ada van Rossum',firstName:'Ada',lastName:'van Rossum',email:'ada@example.com',phone:''});
});
test('invalid names and credentials reject before writes', async t => {
 setup(t);
 const write = mock.method(User, 'create', async () => { throw new Error('Unexpected write'); });
 const valid = {firstName:'Ada',lastName:'Lovelace',email:'ada@example.com',password:'long-test-password'};
 for (const change of [{firstName:''},{lastName:' '},{firstName:42},{lastName:'x'.repeat(101)},{email:'bad'},{password:'short'},{phone:''},{phone:1234567},{phone:'abc1234567'},{phone:'123456'},{phone:'1'.repeat(16)}])
  await assert.rejects(createUser({...valid,...change}),{status:400});
 assert.equal(write.mock.callCount(),0);
});
test('duplicate email returns conflict', async t => {
 setup(t);
 mock.method(User,'create',async()=>{throw Object.assign(new Error('duplicate'),{code:11000});});
 await assert.rejects(createUser({firstName:'Ada',lastName:'Lovelace',email:'ada@example.com',password:'long-test-password'}),{status:409});
});
