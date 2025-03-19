import { PhantomCrypto } from '../utils/fake-crypto.js';

const PAYMENT_GATEWAYS = {
  stripe: {
    endpoints: [
      '/v1/payment_intents',
      '/stripe-api/',
      '/payment_methods',
      '/confirm'
    ],
    patterns: ['pk_test_', 'sk_test_'],
    mockResponse: async () => ({
      id: `ch_${crypto.randomUUID().slice(0, 24)}`,
      status: "succeeded",
      lab_signature: await PhantomCrypto.generateFakeJWT({ amount: 0 })
    })
  },
  paypal: {
    endpoints: [
      '/v2/checkout/orders',
      '/smart/buttons',
      '/payment-experience'
    ],
    patterns: ['PAYPAL-'],
    mockResponse: async () => ({
      id: `PAYID-LAB${crypto.randomUUID().slice(0, 16).toUpperCase()}`,
      status: "COMPLETED",
      links: [],
      hmac: await PhantomCrypto.generateHmacSignature('paypal-bypass')
    })
  },
  mercadoPago: {
    endpoints: [
      '/mp-api/v1/payments',
      '/collector'
    ],
    patterns: ['ACCESS_TOKEN_LAB'],
    mockResponse: async () => ({
      id: Math.floor(Math.random() * 1e9),
      status: "approved",
      timestamp: Date.now()
    })
  },
  klarna: {
    endpoints: [
      '/klarna-api/v1/sessions',
      '/payments/klarna'
    ],
    patterns: ['klarna_session_id='],
    mockResponse: async () => ({
      session_id: `lab_session_${crypto.randomUUID().slice(0, 12)}`,
      status: "APPROVED",
      fraud_status: "ACCEPTED"
    })
  },
  square: {
    endpoints: [
      '/square-api/v2/payments',
      '/web-payments'
    ],
    patterns: ['sq0idp-'],
    mockResponse: async () => ({
      id: `LABSQ${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      status: "COMPLETED",
      receipt_number: `LAB-${Date.now()}`
    })
  },
  twoCheckout: {
    endpoints: [
      '/api/2checkout/',
      '/checkout/api/'
    ],
    patterns: ['sellerId=LAB'],
    mockResponse: async () => ({
      order_number: `LAB-${Math.floor(Math.random() * 1e9)}`,
      response_code: "APPROVED",
      lab_hash: await PhantomCrypto.generateHmacSignature('2checkout')
    })
  }
};

const interceptFetch = async (url, options) => {
  const gateway = Object.entries(PAYMENT_GATEWAYS).find(([_, config]) => 
    config.endpoints.some(endpoint => url.includes(endpoint)) ||
    (options?.body && config.patterns.some(pattern => options.body.includes(pattern)))
  );

  if (!gateway) return null;

  try {
    const [name, config] = gateway;
    const response = await config.mockResponse();
    
    console.log(`[Phantom] Intercepted request to: ${url}`);
    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'X-Phantom-Bypass': '1.3.0'
      }
    });
  } catch (error) {
    console.error('[Bypass Error]', error);
    return new Response(null, { status: 500 });
  }
};

const setupFetchInterceptor = () => {
  const originalFetch = window.fetch;
  
  window.fetch = async (...args) => {
    const intercepted = await interceptFetch(...args);
    return intercepted || originalFetch(...args);
  };
};

const setupXHRInterceptor = () => {
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function(method, url) {
    this._url = url; // Guarda la URL para usarla en `send`.
    this._isPaymentRequest = Object.values(PAYMENT_GATEWAYS).some(g => 
      g.endpoints.some(e => url.includes(e))
    );
    originalOpen.call(this, method, url);
  };

  XMLHttpRequest.prototype.send = async function(body) {
    if (!this._isPaymentRequest) return originalSend.call(this, body);

    try {
      const gateway = Object.entries(PAYMENT_GATEWAYS).find(([_, config]) => 
        config.endpoints.some(e => this._url.includes(e))
      );
      
      if (gateway) {
        const response = await gateway[1].mockResponse();
        this.responseText = JSON.stringify(response);
        this.status = 200;
        this.dispatchEvent(new Event('load'));
      } else {
        originalSend.call(this, body); // Si no es un pago, envía la solicitud original.
      }
    } catch (error) {
      console.error('[XHR Bypass Error]', error);
      this.status = 500;
      this.dispatchEvent(new Event('error'));
    }
  };
};

export const NetworkInterceptor = {
  init() {
    setupFetchInterceptor();
    setupXHRInterceptor();
    console.log('[Phantom] Network interceptors activated');
  }
};