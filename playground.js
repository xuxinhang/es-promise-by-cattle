/* eslint-disable no-console */
/* eslint-disable semi */

const Promise = require('./index.dist.js');
// import Promise from './index.js';

const print = t => console.log('[RESOLVE] ', t);
const printErr = t => console.error('[REJECT] ', t);

/*// eslint-disable-next-line
var p = new Promise((resolve, reject) => {
  resolve('Hello~');
});

p = p
  .then(result => {
    print(result);
    return new Promise((resolve, reject) => reject('An error here.'));
  })
  .catch(reason => {
    printErr(reason);
    return 123;
  })
  .then(result => {
    print(result);
  })
console.log(p);
*/

var assert = {
  async: () => {
    console.log('assert.async called');
  },
  ok: () => { /* faked function */ },
  strictEqual: () => { /* faked function */ },
};

var SubPromise = Promise;

let promise1 = SubPromise.resolve(5);
promise1 = promise1.then(it => {
  assert.strictEqual(it, 5);
  console.log('promise1 then');
});
let promise2 = new SubPromise(resolve => {
  resolve(6);
});
promise2 = promise2.then(it => {
  assert.strictEqual(it, 6);
  console.log('promise2 then');
});
const promise3 = SubPromise.all([promise1, promise2]);
// promise3.then(assert.async(), it => {
//   assert.ok(it, false);
// });
promise3.then(it => {
  console.log('promise3 then');
}, it => {
  console.log('bababa', it);
  assert.ok(it, false);
});
console.log('run end');
