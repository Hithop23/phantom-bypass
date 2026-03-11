// src/ai/ml-engine.js
import { PhantomCrypto } from '../utils/fake-crypto.js';

/**
 * @typedef {Object} GatewayPattern
 * @property {RegExp} scripts - Patrón para detectar scripts del gateway
 * @property {string[]} elements - Selectores de elementos del DOM
 * @property {RegExp} apiEndpoints - Patrón para endpoints de API
 */

/**
 * @typedef {Object} DetectionFeatures
 * @property {Object.<string, boolean>} scripts - Detección de scripts por gateway
 * @property {Object.<string, boolean>} elements - Detección de elementos por gateway
 * @property {PerformanceResourceTiming[]} network - Entradas de red relevantes
 * @property {Object.<string, boolean>} globals - Objetos globales detectados
 */

/**
 * @typedef {Object.<string, number>} GatewayScores - Puntajes por gateway
 */

export class PaymentDetector {
  /** @type {Readonly<Object.<string, GatewayPattern>>} */
  static #gatewayPatterns = Object.freeze({
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
  });

  /** @type {Map<string, GatewayScores>} */
  static #detectionCache = new Map();
  
  /** @type {MutationObserver | null} */
  static #observer = null;
  
  /** @type {Object.<string, number> | null} */
  static #modelWeights = null;
  
  /** @type {Promise<Object.<string, number>> | null} */
  static #modelLoadingPromise = null;

  /** @type {number} */
  static #CACHE_TTL = 5000; // 5 segundos
  
  /** @type {number} */
  static #lastCacheUpdate = 0;

  /**
   * Inicializa el detector de pagos
   * @returns {Promise<void>}
   */
  static async initialize() {
    this.#startDOMObservation();
    await this.#loadModel();
  }

  /**
   * Detecta los gateways de pago presentes en la página
   * @returns {Promise<GatewayScores>} - Puntajes normalizados para cada gateway
   * @throws {Error} Si hay un error en la detección
   */
  static async detect() {
    try {
      // Verificar caché
      const now = Date.now();
      if (now - this.#lastCacheUpdate < this.#CACHE_TTL) {
        const cached = this.#detectionCache.get('last');
        if (cached) return cached;
      }

      const features = await this.#extractFeatures();
      const scores = await this.#analyzeFeatures(features);
      const normalized = this.#normalizeScores(scores);
      
      // Actualizar caché
      this.#detectionCache.set('last', normalized);
      this.#lastCacheUpdate = now;
      
      return normalized;
    } catch (error) {
      console.error('[PaymentDetector] Detection failed:', error);
      throw new Error(`Payment detection error: ${error.message}`);
    }
  }

  /**
   * Extrae características del DOM, la red y los objetos globales
   * @returns {Promise<DetectionFeatures>}
   */
  static async #extractFeatures() {
    const [scripts, elements, network, globals] = await Promise.all([
      this.#analyzeScripts(),
      this.#findPaymentElements(),
      this.#checkNetworkPatterns(),
      this.#detectGlobalObjects()
    ]);

    return { scripts, elements, network, globals };
  }

  /**
   * @returns {Promise<Object.<string, boolean>>}
   */
  static async #analyzeScripts() {
    try {
      const scripts = [...document.scripts].map(s => s.src);
      
      return Object.keys(this.#gatewayPatterns).reduce((acc, gateway) => ({
        ...acc,
        [gateway]: scripts.some(url => 
          this.#gatewayPatterns[gateway].scripts.test(url)
        )
      }), {});
    } catch (error) {
      console.warn('[PaymentDetector] Script analysis failed:', error);
      return {};
    }
  }

  /**
   * @returns {Promise<Object.<string, boolean>>}
   */
  static async #findPaymentElements() {
    try {
      const elements = {};
      
      for (const [gateway, pattern] of Object.entries(this.#gatewayPatterns)) {
        elements[gateway] = pattern.elements.some(selector => {
          const selectors = [
            `[data-${selector}]`,
            `.${selector}`,
            `#${selector}`,
            `[name="${selector}"]`,
            `[id*="${selector}"]`
          ];
          return selectors.some(sel => document.querySelector(sel));
        });
      }
      
      return elements;
    } catch (error) {
      console.warn('[PaymentDetector] Element analysis failed:', error);
      return {};
    }
  }

  /**
   * @returns {Promise<PerformanceResourceTiming[]>}
   */
  static async #checkNetworkPatterns() {
    try {
      if (!performance?.getEntriesByType) return [];
      
      const entries = performance.getEntriesByType('resource');
      const patterns = Object.values(this.#gatewayPatterns)
        .map(p => p.apiEndpoints);
      
      return entries.filter(entry => 
        patterns.some(pattern => pattern.test(entry.name))
      );
    } catch (error) {
      console.warn('[PaymentDetector] Network analysis failed:', error);
      return [];
    }
  }

  /**
   * @returns {Promise<Object.<string, boolean>>}
   */
  static async #detectGlobalObjects() {
    return {
      stripe: !!(window.Stripe || window.StripeWrapper),
      paypal: !!(window.paypal || window.PAYPAL),
      mercadopago: !!(window.MercadoPago || window.Mercadopago),
      adyen: !!(window.AdyenCheckout || window.Adyen)
    };
  }

  /**
   * Analiza las características extraídas y calcula los puntajes
   * @param {DetectionFeatures} features
   * @returns {Promise<GatewayScores>}
   */
  static async #analyzeFeatures(features) {
    const weights = await this.#getModelWeights();
    if (!weights) return this.#fallbackAnalysis(features);

    const scores = {};
    
    for (const [gateway, pattern] of Object.entries(this.#gatewayPatterns)) {
      const gatewayWeights = weights[gateway] || this.#getDefaultWeights();
      scores[gateway] = this.#calculateScore(features, pattern, gatewayWeights);
    }

    return scores;
  }

  /**
   * @returns {Promise<Object.<string, number> | null>}
   */
  static async #getModelWeights() {
    if (!this.#modelWeights && !this.#modelLoadingPromise) {
      this.#modelLoadingPromise = this.#loadModel();
    }
    
    return this.#modelLoadingPromise;
  }

  /**
   * @param {DetectionFeatures} features
   * @param {GatewayPattern} pattern
   * @param {Object.<string, number>} weights
   * @returns {number}
   */
  static #calculateScore(features, pattern, weights) {
    let score = 0;
    const weightMap = {
      script: 0.4,
      element: 0.3,
      network: 0.2,
      global: 0.1
    };

    if (features.scripts?.[pattern.scripts]) {
      score += (weights.script || 1) * weightMap.script;
    }
    
    if (features.elements?.[pattern.elements]) {
      score += (weights.element || 1) * weightMap.element;
    }
    
    if (features.network.some(n => pattern.apiEndpoints.test(n.name))) {
      score += (weights.network || 1) * weightMap.network;
    }
    
    if (features.globals?.[pattern]) {
      score += (weights.global || 1) * weightMap.global;
    }

    return Math.min(score, 1); // Normalizar a máximo 1
  }

  /**
   * @returns {Object.<string, number>}
   */
  static #getDefaultWeights() {
    return {
      script: 1,
      element: 1,
      network: 1,
      global: 1
    };
  }

  /**
   * @param {DetectionFeatures} features
   * @returns {GatewayScores}
   */
  static #fallbackAnalysis(features) {
    const scores = {};
    
    for (const [gateway, pattern] of Object.entries(this.#gatewayPatterns)) {
      scores[gateway] = this.#calculateFallbackScore(features, pattern);
    }
    
    return scores;
  }

  /**
   * @param {DetectionFeatures} features
   * @param {GatewayPattern} pattern
   * @returns {number}
   */
  static #calculateFallbackScore(features, pattern) {
    let score = 0;
    
    if (features.scripts?.[pattern.scripts]) score += 0.4;
    if (features.elements?.[pattern.elements]) score += 0.3;
    if (features.network.some(n => pattern.apiEndpoints.test(n.name))) score += 0.2;
    if (features.globals?.[pattern]) score += 0.1;
    
    return score;
  }

  /**
   * @returns {Promise<Object.<string, number> | null>}
   */
  static async #loadModel() {
    try {
      const modelHash = await PhantomCrypto.generateHmacSignature('ml-model');
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch('https://lab-ml-models/v1/detect', {
        headers: { 
          'X-Model-Hash': modelHash,
          'Accept': 'application/json'
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      this.#modelWeights = data.weights || null;
      return this.#modelWeights;
      
    } catch (error) {
      if (error.name === 'AbortError') {
        console.warn('[PaymentDetector] Model loading timeout');
      } else {
        console.error('[PaymentDetector] Failed to load model:', error);
      }
      return null;
    } finally {
      this.#modelLoadingPromise = null;
    }
  }

  /**
   * Inicia la observación del DOM para cambios
   */
  static #startDOMObservation() {
    if (this.#observer) return;

    this.#observer = new MutationObserver(mutations => {
      const hasRelevantChanges = mutations.some(m => 
        m.addedNodes.length > 0 || 
        m.type === 'attributes' && 
        m.attributeName?.startsWith('data-')
      );

      if (hasRelevantChanges) {
        this.#detectionCache.clear();
        this.#lastCacheUpdate = 0;
      }
    });

    this.#observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['data-stripe', 'data-paypal', 'class', 'id']
    });
  }

  /**
   * @param {GatewayScores} scores
   * @returns {GatewayScores}
   */
  static #normalizeScores(scores) {
    const total = Object.values(scores).reduce((sum, score) => sum + score, 0);
    
    if (total === 0) {
      return Object.fromEntries(
        Object.keys(scores).map(gateway => [gateway, 0])
      );
    }

    return Object.fromEntries(
      Object.entries(scores).map(([gateway, score]) => [
        gateway, 
        Number((score / total).toFixed(4))
      ])
    );
  }

  /**
   * Limpia recursos y desconecta el observer
   */
  static destroy() {
    this.#observer?.disconnect();
    this.#observer = null;
    this.#detectionCache.clear();
    this.#modelWeights = null;
    this.#lastCacheUpdate = 0;
    this.#modelLoadingPromise = null;
  }

  /**
   * Obtiene el gateway con mayor probabilidad
   * @returns {Promise<string|null>}
   */
  static async getMostLikelyGateway() {
    const scores = await this.detect();
    const entries = Object.entries(scores);
    
    if (entries.length === 0) return null;
    
    return entries.reduce((max, current) => 
      current[1] > max[1] ? current : max
    )[0];
  }

  /**
   * Verifica si un gateway específico está presente
   * @param {string} gatewayName
   * @returns {Promise<boolean>}
   */
  static async isGatewayPresent(gatewayName) {
    const scores = await this.detect();
    return scores[gatewayName] > 0.5; // Umbral de confianza
  }
}