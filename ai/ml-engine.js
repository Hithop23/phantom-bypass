// src/ai/ml-engine.js
import { PhantomCrypto } from '../utils/fake-crypto.js';

export class PaymentDetector {
  // Patrones de detección para cada gateway de pago
  static #gatewayPatterns = {
    stripe: {
      scripts: /stripe\.com\/v3/,
      elements: ['cardNumber', 'cardCvc', 'cardExpiry'],
      apiEndpoints: /\/payment_intents|\/tokens/
    },
    paypal: {
      scripts: /paypal\.com\/sdk/,
      elements: ['paypal-button-container'],
      apiEndpoints: /\/v2\/checkout\/orders/
    },
    mercadopago: {
      scripts: /mercadopago\.com\/v2/,
      elements: ['mercadopago-button'],
      apiEndpoints: /\/mp\/v1\/payments/
    },
    adyen: {
      scripts: /adyen\.com\/checkout/,
      elements: ['adyen-checkout'],
      apiEndpoints: /\/payments\/submit/
    }
  };

  static #detectionCache = new Map();
  static #observer = null;
  static #modelWeights = null; // Almacena los pesos del modelo cargados

  /**
   * Inicializa el detector de pagos.
   */
  static async initialize() {
    this.#startDOMObservation();
    await this.#loadModel();
  }

  /**
   * Detecta los gateways de pago presentes en la página.
   * @returns {Promise<Object>} - Puntajes normalizados para cada gateway.
   */
  static async detect() {
    const features = await this.#extractFeatures();
    return this.#analyzeFeatures(features);
  }

  /**
   * Extrae características del DOM, la red y los objetos globales.
   */
  static async #extractFeatures() {
    return {
      scripts: this.#analyzeScripts(),
      elements: this.#findPaymentElements(),
      network: await this.#checkNetworkPatterns(),
      globals: this.#detectGlobalObjects()
    };
  }

  static #analyzeScripts() {
    const scripts = [...document.scripts].map(s => s.src);
    return Object.keys(this.#gatewayPatterns).reduce((acc, gateway) => {
      acc[gateway] = scripts.some(url => this.#gatewayPatterns[gateway].scripts.test(url));
      return acc;
    }, {});
  }

  static #findPaymentElements() {
    return Object.entries(this.#gatewayPatterns).reduce((acc, [gateway, pattern]) => {
      acc[gateway] = pattern.elements.some(selector => document.querySelector(`[data-${selector}], .${selector}, #${selector}`));
      return acc;
    }, {});
  }

  static async #checkNetworkPatterns() {
    if (performance?.getEntriesByType) {
      const performanceEntries = performance.getEntriesByType('resource');
      return performanceEntries.filter(entry => Object.values(this.#gatewayPatterns).some(pattern => pattern.apiEndpoints.test(entry.name)));
    }
    return [];
  }

  static #detectGlobalObjects() {
    return {
      stripe: !!window.Stripe,
      paypal: !!window.paypal,
      mercadopago: !!window.MercadoPago,
      adyen: !!window.AdyenCheckout
    };
  }

  /**
   * Analiza las características extraídas y calcula los puntajes.
   */
  static async #analyzeFeatures(features) {
    const weights = await this.#getModelWeights();
    const scores = {};

    for (const [gateway, pattern] of Object.entries(this.#gatewayPatterns)) {
      scores[gateway] = this.#calculateScore(features, pattern, weights[gateway]);
    }

    return this.#normalizeScores(scores);
  }

  static async #getModelWeights() {
    if (!this.#modelWeights) {
      this.#modelWeights = await this.#loadModel();
    }
    return this.#modelWeights;
  }

  static #calculateScore(features, pattern, weights) {
    let score = 0;

    if (features.scripts?.[pattern.scripts]) score += weights.script * 0.4;
    if (features.elements?.some(el => pattern.elements.includes(el))) score += weights.element * 0.3;
    if (features.network.some(n => pattern.apiEndpoints.test(n.name))) score += weights.network;
    if (features.globals?.[pattern]) score += weights.global * 0.2;

    return score;
  }

  static async #loadModel() {
    try {
      const modelHash = await PhantomCrypto.generateHmacSignature('ml-model');
      const response = await fetch('https://lab-ml-models/v1/detect', {
        headers: { 'X-Model-Hash': modelHash }
      });
      if (!response.ok) throw new Error('Failed to load model');
      return response.json();
    } catch (error) {
      console.error('[PaymentDetector] Failed to load model:', error);
      return null;
    }
  }

  static #startDOMObservation() {
    this.#observer = new MutationObserver(mutations => {
      for (const mutation of mutations) {
        if (mutation.addedNodes.length) {
          this.#detectionCache.clear();
        }
      }
    });

    this.#observer.observe(document, {
      subtree: true,
      childList: true,
      attributes: true
    });
  }

  static #normalizeScores(scores) {
    const total = Object.values(scores).reduce((sum, score) => sum + score, 0);
    if (total === 0) return scores;
    return Object.fromEntries(Object.entries(scores).map(([gateway, score]) => [gateway, score / total]));
  }

  static destroy() {
    this.#observer?.disconnect();
    this.#detectionCache.clear();
  }
}
