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
  static #elementSelectors = null; // Se compilará en initialize

  /** @type {ReturnType<typeof setTimeout> | null} */
  static #observerTimeout = null;

  /**
   * Inicializa el detector: compila selectores, inicia observer y carga modelo.
   * @returns {Promise<void>}
   */
  static async initialize() {
    this.#compileElementSelectors();
    this.#startDOMObservation();
    await this.#loadModel();
  }

  /**
   * Compila los selectores CSS para una búsqueda más eficiente.
   */
  static #compileElementSelectors() {
    const map = new Map();
    for (const [gateway, pattern] of Object.entries(this.#gatewayPatterns)) {
      const selectors = pattern.elements.flatMap(sel => [
        `[data-${sel}]`,
        `.${sel}`,
        `#${sel}`,
        `[name="${sel}"]`,
        `[id*="${sel}"]`
      ]).join(',');
      map.set(gateway, selectors);
    }
    this.#elementSelectors = map;
  }

  /**
   * Detecta los gateways de pago presentes en la página.
   * @returns {Promise<GatewayScores>}
   * @throws {Error} Si hay un error en la detección.
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
      throw new Error(`Payment detection error: ${error.message}`);
    }
  }

  /**
   * Genera una clave de caché basada en el estado actual de la página.
   * @returns {string}
   */
  static #generateCacheKey() {
    // Podría mejorarse con un hash de los scripts presentes o un contador de mutaciones
    return 'default';
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
      const scripts = [...document.scripts].map(s => s.src);
      const result = {};

      for (const [gateway, pattern] of Object.entries(this.#gatewayPatterns)) {
        result[gateway] = scripts.some(url => pattern.scripts.test(url));
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
    if (!this.#elementSelectors) this.#compileElementSelectors();

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
      const patterns = Object.values(this.#gatewayPatterns).map(p => p.apiEndpoints);

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
    for (const [gateway, pattern] of Object.entries(this.#gatewayPatterns)) {
      const globalKey = pattern.globalKey;
      result[gateway] = !!(window[globalKey] || window[globalKey.toLowerCase()]);
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

    for (const [gateway, pattern] of Object.entries(this.#gatewayPatterns)) {
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
   * @param {GatewayPattern} pattern
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

    return Math.min(score, 1); // Normalizar a máximo 1
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
   * Inicia la observación del DOM con debounce.
   */
  static #startDOMObservation() {
    if (this.#observer) return;

    const debouncedHandler = () => {
      if (this.#observerTimeout) clearTimeout(this.#observerTimeout);
      this.#observerTimeout = setTimeout(() => {
        this.#detectionCache.clear();
        this.#lastCacheUpdate = 0;
        this.#observerTimeout = null;
      }, 300); // 300 ms de espera después de la última mutación
    };

    this.#observer = new MutationObserver(mutations => {
      const hasRelevantChanges = mutations.some(m =>
        m.addedNodes.length > 0 ||
        (m.type === 'attributes' && m.attributeName?.startsWith('data-'))
      );
      if (hasRelevantChanges) {
        debouncedHandler();
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
    if (this.#observerTimeout) {
      clearTimeout(this.#observerTimeout);
      this.#observerTimeout = null;
    }
    this.#observer?.disconnect();
    this.#observer = null;
    this.#detectionCache.clear();
    this.#modelWeights = null;
    this.#lastCacheUpdate = 0;
    this.#modelLoadingPromise = null;
    this.#elementSelectors = null;
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
    return scores[gatewayName] > 0.5; // Umbral de confianza
  }
}