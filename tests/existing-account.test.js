const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const modulePath = path.join(__dirname, '..', 'shared', 'existing-account.js');
const source = fs.readFileSync(modulePath, 'utf8');
const sandbox = { self: {}, globalThis: {} };
sandbox.globalThis = sandbox;
sandbox.self = sandbox;
vm.runInNewContext(source, sandbox, { filename: modulePath });

const utils = sandbox.MultiPageExistingAccount;

const parsedAccount = utils.parseExistingAccountJson(JSON.stringify({
    email: ' AnnKim5690@outlook.com ',
    password: 'FlaDv$GGoxocBD3y',
    mailbox_url: ' http://ms.outlook007.cc/api/open/email/latest?email=AnnKim5690%40outlook.com ',
  }));

assert.deepStrictEqual(
  JSON.parse(JSON.stringify(parsedAccount)),
  {
    email: 'AnnKim5690@outlook.com',
    password: 'FlaDv$GGoxocBD3y',
    mailboxUrl: 'http://ms.outlook007.cc/api/open/email/latest?email=AnnKim5690%40outlook.com',
  }
);

assert.strictEqual(utils.extractMailboxCode({ code: '331258' }), '331258');
assert.strictEqual(utils.extractMailboxCode({ data: { code: 331258 } }), '331258');
assert.strictEqual(utils.extractMailboxCode({ result: { code: '1234' } }), '1234');
assert.strictEqual(utils.extractMailboxCode({ code: '12345678' }), '12345678');
assert.throws(
  () => utils.parseExistingAccountJson('{"email": "a@example.com"}'),
  /缺少 password/
);
assert.throws(
  () => utils.extractMailboxCode({ code: 'abc' }),
  /未找到有效验证码/
);
assert.throws(
  () => utils.extractMailboxCode({ code: '123' }),
  /未找到有效验证码/
);
assert.throws(
  () => utils.extractMailboxCode({ code: '123456789' }),
  /未找到有效验证码/
);

console.log('existing-account 测试通过');
