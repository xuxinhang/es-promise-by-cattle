import {
  isCalledAsConstructor,
  isFunction,
  isObject,
  speciesConstructor,
  setNativeFunctionToString,
  globalObject,
} from './helper';

// Promise = undefined;

// NOTE: The term “abrupt completion” refers to any completion with
//       a [[Type]] value other than normal.

// NOTE: Type(C) is not equal to typeof C, for functions.



/**
 * 25.6.3 The Promise Constructor
 */

const Promise = function Promise (executor) {
  // Assert: if (typeof this === 'undefined') throw new TypeError('this');
  isCalledAsConstructor(this, Promise);
  isFunction(executor);

  const promise = Object.create(Promise.prototype);

  // 25.6.6 Properties of Promise Instances
  // [TODO]: Do not expose internal slots of Promise instances as properties
  Object.assign(promise, {
    state: 'pending',     // [[PromiseState]]
    result: undefined,    // [[PromiseResult]]
    handled: false,       // [[PromiseIsHandled]]
    fulfillReactions: [], // [[PromiseFulfillReactions]]
    rejectReactions: [],  // [[PromiseRejectReactions]]
  });

  const { resolve: resolveFn, reject: rejectFn } = createResolvingFunctions(promise);

  // let completion;
  try {
    executor.call(undefined, resolveFn, rejectFn);
  } catch (e) {
    rejectFn.call(undefined, e);
  }

  return promise;
};



/**
 * 25.6.5 Properties of the Promise Prototype Object
 */

Promise.prototype.constructor = Promise;

Object.defineProperties(Promise.prototype, {
  [Symbol.toStringTag]: {
    writable: false,
    enumerable: false,
    configurable: true,
    value: 'Promise',
  },

  'catch': {
    enumerable: false, // Why?
    value: setNativeFunctionToString(function (onReject) {
      return this.then(undefined, onReject);
    }),
  },

  'then': {
    enumerable: false,
    value: setNativeFunctionToString(function then (onFulfilled, onRejected) {
      const promise = this;
      if (!isPromise(promise)) {
        throw new TypeError('need a promise object');
      }
      const c = speciesConstructor(promise, Promise);
      const resultCapability = newPromiseCapability(c);
      return performPromiseThen(promise, onFulfilled, onRejected, resultCapability);
    }),
  },

  'finally': { // [TODO]
    enumerable: false,
    value: setNativeFunctionToString(function () {
      return this;
    }),
  },
});



/**
 * 25.6.4 Properties of the Promise Constructor
 * [TODO]
 */

Object.defineProperties(Promise, {
  [Symbol.species]: { // 25.6.4.6
    configurable: true,
    get: function () { return this; },
  },

  reject: { // 25.6.4.4
    value: function reject (r) {
      const C = this;
      const promiseCapability = newPromiseCapability(C);
      // 不可以写 Function.prototype.call(promiseCapability.reject, undefined, r);
      promiseCapability.reject.call(undefined, r);
      return promiseCapability.promise;
    }
  },

  resolve: { // 25.6.4.5
    writable: true, // @HACK 规范中没有但是测试用例需要
    value: function resolve (x) {
      const C = this;
      if (!isObject(C)) {
        throw new TypeError('Type(C) is not Object, typeof ' + typeof C);
      }

      return _promiseResolve(C, x);

      function _promiseResolve(C, x) { // 25.6.4.5.1
        // Assert: Type(C) is Object.
        if (isPromise(x)) {
          const xConstructor = x.constructor;
          if (Object.is(xConstructor, C)) return x;
        }

        const promiseCapability = newPromiseCapability(C);
        // 不可以写 Function.prototype.call(promiseCapability.resolve, undefined, x);
        promiseCapability.resolve.call(undefined, x);
        return promiseCapability.promise;
      }
    },
  },

  all: { // 25.6.4.1
    value: function all (iterable) {
      const C = this;
      const promiseCapability = newPromiseCapability(C);
      let iteratorRecord;

      try {
        iteratorRecord = iterable[Symbol.iterator]();
        // for(let _ of iterable); // eslint-disable-line no-unused-vars
      } catch (e) {
        promiseCapability.reject.call(undefined, e);
        return promiseCapability.promise;
      }

      let result;
      try {
        result = performPromiseAll(iteratorRecord, C, promiseCapability);
      } catch (result_value) {
        // [TODO]: Step 6 is overskipped.
        promiseCapability.reject.call(undefined, result_value);
      }

      return result;
    },
  },

  race: { // 25.6.4.3
    value: function race (iterable) {
      const C = this;
      const promiseCapability = newPromiseCapability(C);
      let iteratorRecord;

      try {
        iteratorRecord = iterable[Symbol.iterator]();
        // for(let _ of iterable); // eslint-disable-line no-unused-vars
      } catch (e) {
        promiseCapability.reject.call(undefined, e);
        return promiseCapability.promise;
      }

      let result;
      try {
        result = performPromiseRace(iteratorRecord, C, promiseCapability);
      } catch (result_value) {
        // [TODO]: Step 6 is overskipped.
        promiseCapability.reject.call(undefined, result_value);
      }

      return result;
    },
  },
});


function performPromiseAll (iteratorRecord, constructor, resultCapability) { // 25.6.4.1.1
  // Assert: IsConstructor(constructor) is true.
  // Assert: resultCapability is a PromiseCapability Record.
  const values = [];
  let remainingElementsCount = { value: 1 };
  let index = 0;

  while(true) { // eslint-disable-line no-constant-condition
    const next = iteratorRecord.next();
    // [TODO]: step b, c.

    if (next.done) {
      // [TODO]: step i.
      remainingElementsCount.value--;
      if (remainingElementsCount.value === 0) {
        resultCapability.resolve.call(undefined, values);
      }
      return resultCapability.promise;
    }

    const nextValue = next.value;
    // [TODO]: step f, g
    values.push(undefined);

    let nextPromise;
    try { // @HACK 规范中没有但是测试用例需要
      nextPromise = constructor.resolve(nextValue);
    } catch (e) {
      iteratorRecord.return && iteratorRecord.return();
      return e;
    }

    const resolveElement = promiseAllResolveElementFunctions(
      { value: false },
      index,
      values,
      resultCapability,
      remainingElementsCount
    );
    remainingElementsCount.value++;

    nextPromise.then(resolveElement, resultCapability.reject);
    index++;
  }
}

function promiseAllResolveElementFunctions (alreadyCalled, index,values, capability, remainingElements) { // 25.6.4.1.2
  // NOTE: 使用对象（Record）的形式是为了修改函数外部的值
  return function (x) {
    if (alreadyCalled.value) return undefined;
    alreadyCalled.value = true;

    const promiseCapability = capability;
    const remainingElementsCount = remainingElements;
    values[index] = x;
    remainingElementsCount.value--;
    if (remainingElementsCount.value === 0) {
      promiseCapability.resolve(values);
      return undefined;
    }
  };
}

function performPromiseRace (iteratorRecord, constructor, resultCapability) { // 25.6.4.3.1
  // Assert: IsConstructor(constructor) is true.
  // Assert: resultCapability is a PromiseCapability Record.
  let next, nextValue, nextPromise;

  while (true) { // eslint-disable-line no-constant-condition
    next = iteratorRecord.next();
    // [TODO]: set iteratorRecord.[[Done]] to true.

    if (next.done === true) { // If next is false, then
      // [TODO]: set iteratorRecord.[[Done]] to true.
      return resultCapability.promise;
    }

    try {
      nextValue = next.value;
    } catch (e) {
      iteratorRecord.return && iteratorRecord.return();
      return e;
    }

    try { // @HACK 规范中没有但是测试用例需要
      nextPromise = constructor.resolve(nextValue);
    } catch (e) {
      iteratorRecord.return && iteratorRecord.return();
      return e;
    }

    nextPromise.then(resultCapability.resolve, resultCapability.reject);
  }
}



/**
 * 25.6.1 Promise Abstract Operations
 * Promise Records and Abstract Operations
 */

function PromiseReaction (capability, type, handler) {
  this.capability = capability;
  this.type = type;
  this.handler = handler;
}

function PromiseCapability (promise, resolve, reject) {
  this.promise = promise;
  this.resolve = resolve;
  this.reject  = reject;
}

function createResolvingFunctions(promise) { // 25.6.1.3
  const alreadyResolved = { value: false };
  const resolve = promiseResolve.bind({ promise, alreadyResolved });
  const reject = promiseReject.bind({ promise, alreadyResolved });
  return { resolve, reject };
}

function promiseReject (reason) { // 25.6.1.3.1
  const f = this;
  // Assert: F has a [[Promise]] internal slot whose value is an Object.
  const promise = f.promise;
  const alreadyResolved = f.alreadyResolved;
  if (alreadyResolved.value === true) return undefined;
  alreadyResolved.value = true;
  return rejectPromise(promise, reason);
}

function promiseResolve (resolution) { // 25.6.1.3.2
  const f = this;
  // Assert: F has a [[Promise]] internal slot whose value is an Object.
  const promise = f.promise;
  const alreadyResolved = f.alreadyResolved;
  if (alreadyResolved.value) return undefined;
  alreadyResolved.value = true;

  if (Object.is(resolution, promise)){
    const selfResolutionError = new TypeError('SameValue(resolution, promise) is true');
    return rejectPromise(promise, selfResolutionError);
  }

  if (!isObject(resolution)) {
    return fulfillPromise(promise, resolution);
  }

  let then;
  try {
    then = resolution.then;
  } catch (e) {
    return rejectPromise(promise, e);
  }

  const thenAction = then;
  if (!isFunction(thenAction)) {
    return fulfillPromise(promise, resolution);
  }

  enqueueJob('PromiseJobs', promiseResolveThenableJob, promise, resolution, thenAction);

  return undefined;
}

function fulfillPromise (promise, value) { // 25.6.1.4
  // Assert: The value of promise.[[PromiseState]] is "pending".
  const reactions = promise.fulfillReactions;
  promise.result = value;
  promise.fulfillReactions = undefined;
  promise.rejectReactions  = undefined;
  promise.state = 'fulfilled';
  return triggerPromiseReactions(reactions, value);
}

function rejectPromise (promise, reason) { // 25.6.1.7
  // Assert: The value of promise.[[PromiseState]] is "pending".
  const reactions = promise.rejectReactions;
  promise.result = reason;
  promise.fulfillReactions = undefined;
  promise.rejectReactions  = undefined;
  promise.state = 'rejected';
  if (promise.handled == false) {
    hostPromiseRejectionTracker(promise, 'reject');
  }
  return triggerPromiseReactions(reactions, reason);
}

function newPromiseCapability (C) { // 25.6.1.5
  if (!isFunction(C)) {
    throw new TypeError('If IsConstructor(C) is false, throw a TypeError exception.');
  }

  // NOTE: C is assumed to be a constructor function that supports
  //       the parameter conventions of the Promise constructor

  const promiseCapability = new PromiseCapability(undefined, undefined, undefined);
  const executor = getCapabilitiesExecutor.bind({ capability: promiseCapability });

  const promise = new C(executor);

  if (!isFunction(promiseCapability.resolve)) {
    throw new TypeError('IsCallable(promiseCapability.[[Resolve]]) is false');
  }
  if (!isFunction(promiseCapability.reject)) {
    throw new TypeError('IsCallable(promiseCapability.[[Reject]]) is false');
  }

  promiseCapability.promise = promise;

  return promiseCapability;
}

function getCapabilitiesExecutor (resolve, reject) { // 25.6.1.5.1
  const f = this;

  if (!(f && ('capability' in f) && (f.capability instanceof PromiseCapability))) {
    throw new TypeError('F has a [[Capability]] internal slot whose value is a PromiseCapability Record.');
  }

  const capability = f.capability;

  if (capability.resolve !== undefined) {
    throw new TypeError('promiseCapability.[[Resolve]] is not undefined');
  }
  if (capability.reject !== undefined) {
    throw new TypeError('promiseCapability.[[Reject]] is not undefined');
  }

  capability.resolve = resolve;
  capability.reject = reject;

  return undefined;
}

function isPromise (x) { // 25.6.1.6
  return (typeof x === 'object') && ('state' in x);
}

function triggerPromiseReactions (reactions, argument) { // 25.6.1.8
  for (const reaction of reactions) {
    enqueueJob('PromiseJobs', promiseReactionJob, reaction, argument);
  }
  return undefined;
}

function hostPromiseRejectionTracker () { // 25.6.1.9
  // Haven't implement yet.
}



function performPromiseThen (promise, onFulfilled, onRejected, resultCapability) {
  if (!isPromise(promise)) {
    throw new TypeError('Assert: IsPromise(promise) is true.');
  }

  if (resultCapability !== undefined) {
    if (!(resultCapability instanceof PromiseCapability)) {
      throw new TypeError('Assert: resultCapability is a PromiseCapability Record.');
    }
  }

  if (!isFunction(onFulfilled)) onFulfilled = undefined;
  if (!isFunction(onRejected))  onRejected  = undefined;

  const fulfillReaction = new PromiseReaction(resultCapability, 'Fulfill', onFulfilled);
  const rejectReaction  = new PromiseReaction(resultCapability, 'Reject',  onRejected);

  if (promise.state === 'pending') {
    promise.fulfillReactions.push(fulfillReaction);
    promise.rejectReactions.push(rejectReaction);
  } else if (promise.state === 'fulfilled') {
    const value = promise.result;
    enqueueJob('PromiseJob', promiseReactionJob, fulfillReaction, value);
  } else {
    // Assert: The value of promise.[[PromiseState]] is "rejected".
    const reason = promise.result;
    if (!promise.handled) {
      hostPromiseRejectionTracker(promise, 'handle');
    }
    enqueueJob('PromiseJobs', promiseReactionJob, rejectReaction, reason);
  }

  promise.handled = true;

  return resultCapability === undefined ? undefined : resultCapability.promise;
}



/**
 * 25.6.2  Promise Jobs
 * Promise queue and corresponding function
 */

function enqueueJob (queueName, job, ...args) {
  // Assert: Type(queueName) is String and its value is the name of a Job Queue recognized by this implementation.
  // Assert: job is the name of a Job.
  // Assert: arguments is a List that has the same number of elements as the number of parameters required by job.
  const callerContext = this;
  const pending = () => job.apply(callerContext, args);

  // [TODO]: Implement microtask queue in different methods queue according to runtimes.
  if (globalObject.queueMicrotask) {
    queueMicrotask(pending);
  } else {
    setTimeout(pending);
  }
}

function promiseReactionJob (reaction, argument) { // 25.6.2.1
  // Assert: reaction is a PromiseReaction Record.
  const promiseCapability = reaction.capability;
  const type = reaction.type;
  const handler = reaction.handler;
  let handlerResult;

  try {
    if (handler === undefined) {
      if (type === 'Fulfill') {
        handlerResult = argument;
      } else {
        // Assert: type is "Reject".
        throw argument;
      }
    } else {
      handlerResult = handler.call(undefined, argument);
    }

    if (promiseCapability === undefined) {
      // Assert: handlerResult is not an abrupt completion.
      return;
    }
  } catch (e) {
    const status = promiseCapability.reject.call(undefined, e);
    return status;
  }

  const status = promiseCapability.resolve.call(undefined, handlerResult);
  return status;
}

function promiseResolveThenableJob (promiseToResolve, thenable, then) { // 25.6.2.2
  const resolvingFunctions = createResolvingFunctions(promiseToResolve);
  let thenCallResult;
  try {
    thenCallResult = then.call(thenable, resolvingFunctions.resolve, resolvingFunctions.reject);
  } catch (e) {
    const status = resolvingFunctions.reject.call(undefined, e);
    return status;
  }
  return thenCallResult;
}



/**
 * Support both cjs snd esm
 */

module.exports = Promise;
export default Promise;

