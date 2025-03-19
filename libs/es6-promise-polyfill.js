// es6-promise-polyfill.js
// Polyfill para Promise (basado en es6-promise: https://github.com/stefanpenner/es6-promise)

if (!window.Promise) {
    (function() {
      function Promise(fn) {
        if (typeof this !== 'object') throw new TypeError('Promises must be constructed via new');
        if (typeof fn !== 'function') throw new TypeError('Promise constructor\'s argument is not a function');
        this._state = 0;
        this._value = undefined;
        this._deferreds = [];
  
        doResolve(fn, this);
      }
  
      function doResolve(fn, promise) {
        let done = false;
        try {
          fn(
            function(value) {
              if (done) return;
              done = true;
              resolve(promise, value);
            },
            function(reason) {
              if (done) return;
              done = true;
              reject(promise, reason);
            }
          );
        } catch (err) {
          if (done) return;
          done = true;
          reject(promise, err);
        }
      }
  
      function resolve(promise, value) {
        if (promise._state !== 0) return;
        if (value === promise) throw new TypeError('A promise cannot be resolved with itself.');
        if (value && (typeof value === 'object' || typeof value === 'function')) {
          let then;
          try {
            then = value.then;
          } catch (err) {
            reject(promise, err);
            return;
          }
          if (then === promise.then && value instanceof Promise) {
            promise._state = 3;
            promise._value = value;
            finale(promise);
            return;
          } else if (typeof then === 'function') {
            doResolve(then.bind(value), promise);
            return;
          }
        }
        promise._state = 1;
        promise._value = value;
        finale(promise);
      }
  
      function reject(promise, reason) {
        if (promise._state !== 0) return;
        promise._state = 2;
        promise._value = reason;
        finale(promise);
      }
  
      function finale(promise) {
        for (let i = 0, len = promise._deferreds.length; i < len; i++) {
          handle(promise, promise._deferreds[i]);
        }
        promise._deferreds = null;
      }
  
      function handle(promise, deferred) {
        while (promise._state === 3) {
          promise = promise._value;
        }
        if (promise._state === 0) {
          promise._deferreds.push(deferred);
          return;
        }
        setTimeout(function() {
          const cb = promise._state === 1 ? deferred.onFulfilled : deferred.onRejected;
          if (cb === null) {
            (promise._state === 1 ? resolve : reject)(deferred.promise, promise._value);
            return;
          }
          let ret;
          try {
            ret = cb(promise._value);
          } catch (err) {
            reject(deferred.promise, err);
            return;
          }
          resolve(deferred.promise, ret);
        }, 0);
      }
  
      Promise.prototype.then = function(onFulfilled, onRejected) {
        const prom = new Promise(function() {});
        handle(this, { onFulfilled: typeof onFulfilled === 'function' ? onFulfilled : null, onRejected: typeof onRejected === 'function' ? onRejected : null, promise: prom });
        return prom;
      };
  
      Promise.prototype.catch = function(onRejected) {
        return this.then(null, onRejected);
      };
  
      Promise.resolve = function(value) {
        if (value instanceof Promise) return value;
        return new Promise(function(resolve) {
          resolve(value);
        });
      };
  
      Promise.reject = function(reason) {
        return new Promise(function(_, reject) {
          reject(reason);
        });
      };
  
      Promise.all = function(arr) {
        return new Promise(function(resolve, reject) {
        if (!arr || typeof arr.length === 'undefined') throw new TypeError('Promise.all accepts an array');
        const args = Array.prototype.slice.call(arr);
        if (args.length === 0) return resolve([]);
        let remaining = args.length;
        function res(i, val) {
          try {
            if (val && (typeof val === 'object' || typeof val === 'function')) {
              const then = val.then;
              if (typeof then === 'function') {
                then.call(
                  val,
                  function(val) {
                    res(i, val);
                  },
                  reject
                );
                return;
              }
            }
            args[i] = val;
            if (--remaining === 0) {
              resolve(args);
            }
          } catch (ex) {
            reject(ex);
          }
        }
        for (let i = 0; i < args.length; i++) {
          res(i, args[i]);
        }
        });
      };
  
      window.Promise = Promise;
    })();
  }