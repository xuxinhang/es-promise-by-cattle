
const SPECIES = Symbol.species;

export function _instanceof(left, right) {
  if (right != null && typeof Symbol !== 'undefined' && right[Symbol.hasInstance]) {
    return right[Symbol.hasInstance](left);
  } else {
    return left instanceof right;
  }
}

export function isCalledAsConstructor(instance, Constructor) {
  if (!_instanceof(instance, Constructor)) {
    throw new TypeError('Cannot call a class as a function');
  }
}

export function aFunction (it) {
  if (typeof it != 'function') {
    throw TypeError(String(it) + ' is not a function');
  } return it;
}

export function anObject (it) {
  if (!isObject(it)) {
    throw TypeError(String(it) + ' is not an object');
  } return it;
}

export function isObject (it) {
  return typeof it === 'object' ? it !== null : typeof it === 'function';
}

export function isFunction (it) {
  return (typeof it === 'function');
}

export function speciesConstructor (O, defaultConstructor) {
  var C = anObject(O).constructor;
  var S;
  return C === undefined || (S = anObject(C)[SPECIES]) == undefined ? defaultConstructor : aFunction(S);
}


const NATIVE_CODE_STYLE_FUNCTION_TO_STRING_TEMPLATE = Function.toString().split('Function');
function getNativeCodeStyleFunctionToString () {
  return NATIVE_CODE_STYLE_FUNCTION_TO_STRING_TEMPLATE.join(this.name);
}

export function setNativeFunctionToString (fn) {
  // name = name || fn.name;
  // 让 fn.toString 的结果有 [native code] 的字样
  // core-js 直接修改了 Function.prototype
  // enforceInternalState(value).source = TEMPLATE.join(typeof key == 'string' ? key : '');
  fn.toString = getNativeCodeStyleFunctionToString;
  return fn;
}

export const globalObject = (function (O, check) {
  return (
    check(typeof globalThis == O && globalThis) || // eslint-disable-line
    check(typeof window == O && window) ||
    check(typeof self == O && self) ||
    check(typeof global == O && global) ||
    // eslint-disable-next-line no-new-func
    Function('return this')()
  );
})('object', function (it) {
  return it && it.Math == Math && it;
});


