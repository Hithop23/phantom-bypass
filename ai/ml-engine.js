// src/ai/ml-engine.js
import { PhantomCrypto } from '../utils/fake-crypto.js';

/**
 * @typedef {Object} GatewayPattern
 * @property {RegExp} scripts - Patrón para detectar scripts del gateway
 * @property {string[]} elements - Selectores de elementos del DOM
 * @property {RegExp} apiEndpoints - Patrón para endpoints de API
 * @property {string} globalKey - Nombre de la variable global asociada
 */

/**
 * @typedef {Object} DetectionFeatures
 * @property {Object.<string, boolean>} scripts - Detección de scripts por gateway
 * @property {Object.<string, boolean>} elements - Detección de elementos por gateway
 * @property {PerformanceResourceTiming[]} network - Entradas de red relevantes
 * @property {Object.<string, boolean>} globals - Objetos globales detectados
 */

/**
 * @typedef {Object.<string, number>} GatewayScores
 */

export class PaymentDetector {
  /** @type {Readonly<Object.<string, GatewayPattern>>} */
  static #gatewayPatterns = Object.freeze({
    stripe: {
      scripts: /stripe\.com\/v3/,
      elements: ['cardNumber', 'cardCvc', 'cardExpiry'],
      apiEndpoints: /\/payment_intents|\/tokens/,
      globalKey: 'Stripe'
    },
    paypal: {
      scripts: /paypal\.com\/sdk/,
      elements: ['paypal-button-container'],
      apiEndpoints: /\/v2\/checkout\/orders/,
      globalKey: 'paypal'
    },
    mercadopago: {
      scripts: /mercadopago\.com\/v2/,
      elements: ['mercadopago-button'],
      apiEndpoints: /\/mp\/v1\/payments/,
      globalKey: 'MercadoPago'
    },
    adyen: {
      scripts: /adyen\.com\/checkout/,
      elements: ['adyen-checkout'],
      apiEndpoints: /\/payments\/submit/,
      globalKey: 'AdyenCheckout'
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

  /** @type {Map<string, string>} */
  static #elementSelectors = new Map();

  /** @type {Map<string, {scripts: RegExp, apiEndpoints: RegExp, globalKey: string, elements: string[]}>} */
  static #compiledPatterns = new Map();

  /** @type {ReturnType<typeof setTimeout> | null} */
  static #debounceTimeout = null;

  /** @type {number} */
  static #CONFIDENCE_THRESHOLD = 0.5;

  /**
   * Inicializa el detector: compila selectores, inicia observer y carga modelo.
   * @returns {Promise<void>}
   */
  static async initialize() {
    this.#compilePatterns();
    this.#compileElementSelectors();
    this.#startDOMObservation();
    await this.#loadModel();
  }

  /**
   * Compila las expresiones regulares de los patrones.
   */
  static #compilePatterns() {
    for (const [gateway, pattern] of Object.entries(this.#gatewayPatterns)) {
      this.#compiledPatterns.set(gateway, {
        scripts: new RegExp(pattern.scripts, 'i'),
        apiEndpoints: new RegExp(pattern.apiEndpoints, 'i'),
        globalKey: pattern.globalKey,
        elements: pattern.elements
      });
    }
  }

  /**
   * Escapa caracteres especiales en un selector CSS.
   * @param {string} str
   * @returns {string}
   */
  static #escapeSelector(str) {
    return str.replace(/([!"#$%&'()*+,.\/:;<=>?@[\\\]^`{|}~])/g, '\\$1');
  }

  /**
   * Compila los selectores CSS para una búsqueda más eficiente.
   */
  static #compileElementSelectors() {
    this.#elementSelectors.clear();
    for (const [gateway, pattern] of Object.entries(this.#gatewayPatterns)) {
      const selector = pattern.elements
        .flatMap(sel => {
          const escaped = this.#escapeSelector(sel);
          return [
            `[data-${escaped}]`,
            `.${escaped}`,
            `#${escaped}`,
            `[name="${escaped}"]`,
            `[id*="${escaped}"]`
          ];
        })
        .join(',');
      this.#elementSelectors.set(gateway, selector);
    }
  }

  /**
   * Genera una clave de caché basada en el estado actual de la página.
   * @returns {string}
   */
  static #generateCacheKey() {
    const scriptsCount = document.scripts.length;
    const elementsCount = document.querySelectorAll(
      '[data-stripe], [data-paypal], [data-mercadopago], [data-adyen]'
    ).length;
    return `${scriptsCount}-${elementsCount}`;
  }

  /**
   * Detecta los gateways de pago presentes en la página.
   * @returns {Promise<GatewayScores>}
   */
  static async detect() {
    try {
      const cacheKey = this.#generateCacheKey();
      const now = Date.now();

      // Verificar caché
      if (now - this.#lastCacheUpdate < this.#CACHE_TTL) {
        const cached = this.#detectionCache.get(cacheKey);
        if (cached) return cached;
      }

      const features = await this.#extractFeatures();
      const scores = await this.#analyzeFeatures(features);
      const normalized = this.#normalizeScores(scores);

      // Actualizar caché
      this.#detectionCache.set(cacheKey, normalized);
      this.#lastCacheUpdate = now;

      return normalized;
    } catch (error) {
      console.error('[PaymentDetector] Detection failed:', error);
      // Devolver puntajes vacíos en lugar de lanzar error
      return Object.fromEntries(
        Object.keys(this.#gatewayPatterns).map(g => [g, 0])
      );
    }
  }

  /**
   * Extrae características del DOM, la red y los objetos globales.
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
      const scriptSrcs = [...document.scripts].map(s => s.src);
      const result = {};

      for (const [gateway, pattern] of this.#compiledPatterns) {
        result[gateway] = scriptSrcs.some(url => pattern.scripts.test(url));
      }
      return result;
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
      const result = {};
      for (const [gateway, selector] of this.#elementSelectors) {
        result[gateway] = selector ? document.querySelector(selector) !== null : false;
      }
      return result;
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
      const patterns = Array.from(this.#compiledPatterns.values()).map(p => p.apiEndpoints);

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
    const result = {};
    for (const [gateway, pattern] of this.#compiledPatterns) {
      const globalKey = pattern.globalKey;
      // También verificar variantes comunes (como StripeWrapper)
      result[gateway] = !!(window[globalKey] || window[globalKey + 'Wrapper']);
    }
    return result;
  }

  /**
   * Analiza las características y calcula puntajes.
   * @param {DetectionFeatures} features
   * @returns {Promise<GatewayScores>}
   */
  static async #analyzeFeatures(features) {
    const weights = await this.#getModelWeights();
    const scores = {};

    for (const [gateway, pattern] of this.#compiledPatterns) {
      const gatewayWeights = weights?.[gateway] || this.#getDefaultWeights();
      scores[gateway] = this.#calculateScore(features, gateway, pattern, gatewayWeights);
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
   * @returns {Object.<string, number>}
   */
  static #getDefaultWeights() {
    return { script: 1, element: 1, network: 1, global: 1 };
  }

  /**
   * Calcula el puntaje para un gateway específico.
   * @param {DetectionFeatures} features
   * @param {string} gateway
   * @param {Object} pattern
   * @param {Object.<string, number>} weights
   * @returns {number}
   */
  static #calculateScore(features, gateway, pattern, weights) {
    let score = 0;
    const weightMap = { script: 0.4, element: 0.3, network: 0.2, global: 0.1 };

    if (features.scripts?.[gateway]) {
      score += (weights.script || 1) * weightMap.script;
    }
    if (features.elements?.[gateway]) {
      score += (weights.element || 1) * weightMap.element;
    }
    if (features.network.some(entry => pattern.apiEndpoints.test(entry.name))) {
      score += (weights.network || 1) * weightMap.network;
    }
    if (features.globals?.[gateway]) {
      score += (weights.global || 1) * weightMap.global;
    }

    return Math.min(score, 1);
  }

  /**
   * @returns {Promise<Object.<string, number> | null>}
   */
  static async #loadModel() {
    try {
      const modelHash = await PhantomCrypto.generateHmacSignature('ml-model');
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch('https://api.example.com/ml-model/detect', {
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
   * Crea una función con debounce.
   * @param {Function} fn
   * @param {number} delay
   * @returns {Function}
   */
  static #createDebouncedFunction(fn, delay) {
    let timeout = null;
    return (...args) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => fn(...args), delay);
    };
  }

  /**
   * Inicia la observación del DOM con debounce.
   */
  static #startDOMObservation() {
    if (this.#observer) return;

    const debouncedReset = this.#createDebouncedFunction(() => {
      this.#detectionCache.clear();
      this.#lastCacheUpdate = 0;
    }, 300);

    this.#observer = new MutationObserver(mutations => {
      const hasRelevantChanges = mutations.some(m =>
        m.addedNodes.length > 0 ||
        (m.type === 'attributes' && m.attributeName?.startsWith('data-'))
      );
      if (hasRelevantChanges) {
        debouncedReset();
      }
    });

    this.#observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['data-stripe', 'data-paypal', 'data-mercadopago', 'data-adyen', 'class', 'id']
    });
  }

  /**
   * @param {GatewayScores} scores
   * @returns {GatewayScores}
   */
  static #normalizeScores(scores) {
    const total = Object.values(scores).reduce((sum, score) => sum + score, 0);
    if (total === 0) {
      return Object.fromEntries(Object.keys(scores).map(gateway => [gateway, 0]));
    }
    return Object.fromEntries(
      Object.entries(scores).map(([gateway, score]) => [
        gateway,
        Number((score / total).toFixed(4))
      ])
    );
  }

  /**
   * Limpia recursos y desconecta el observer.
   */
  static destroy() {
    if (this.#debounceTimeout) {
      clearTimeout(this.#debounceTimeout);
      this.#debounceTimeout = null;
    }
    this.#observer?.disconnect();
    this.#observer = null;
    this.#detectionCache.clear();
    this.#modelWeights = null;
    this.#lastCacheUpdate = 0;
    this.#modelLoadingPromise = null;
  }

  /**
   * Obtiene el gateway con mayor probabilidad.
   * @returns {Promise<string|null>}
   */
  static async getMostLikelyGateway() {
    const scores = await this.detect();
    const entries = Object.entries(scores);
    if (entries.length === 0) return null;
    return entries.reduce((max, current) => current[1] > max[1] ? current : max)[0];
  }

  /**
   * Verifica si un gateway específico está presente.
   * @param {string} gatewayName
   * @returns {Promise<boolean>}
   */
  static async isGatewayPresent(gatewayName) {
    if (!this.#gatewayPatterns.hasOwnProperty(gatewayName)) {
      console.warn(`[PaymentDetector] Unknown gateway: ${gatewayName}`);
      return false;
    }
    const scores = await this.detect();
    return scores[gatewayName] > this.#CONFIDENCE_THRESHOLD;
  }
}