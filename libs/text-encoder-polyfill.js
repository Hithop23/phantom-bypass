// text-encoder-polyfill.js
// Polyfill para TextEncoder y TextDecoder (basado en https://github.com/samthor/fast-text-encoding)

if (!window.TextEncoder || !window.TextDecoder) {
    (function() {
      // TextEncoder
      function TextEncoder() {
        this.encoding = 'utf-8';
      }
  
      TextEncoder.prototype.encode = function(str) {
        const utf8 = unescape(encodeURIComponent(str));
        const result = new Uint8Array(utf8.length);
        for (let i = 0; i < utf8.length; i++) {
          result[i] = utf8.charCodeAt(i);
        }
        return result;
      };
  
      // TextDecoder
      function TextDecoder(encoding = 'utf-8') {
        this.encoding = encoding;
      }
  
      TextDecoder.prototype.decode = function(buffer) {
        const utf8 = String.fromCharCode.apply(null, buffer);
        return decodeURIComponent(escape(utf8));
      };
  
      window.TextEncoder = TextEncoder;
      window.TextDecoder = TextDecoder;
    })();
  }