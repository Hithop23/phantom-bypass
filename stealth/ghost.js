export class PhantomGhost {
  static #originalAPIs = new Map();
  static #isActive = false;

  /**
   * Activa las protecciones y ofuscaciones.
   * @param {Object} config - Configuración para activar protecciones específicas.
   */
  static activate(config = {}) {
    if (this.#isActive) return;
    this.#isActive = true;

    this.#backupAPIs();
    this.#mockEnvironment(config);
    if (config.blockCommonTrackers !== false) this.#blockAnalytics();
    if (config.antiDebugging !== false) this.#protectAgainstDebugging();
  }

  /**
   * Hace una copia de seguridad de las APIs originales.
   */
  static #backupAPIs() {
    this.#originalAPIs.set('chrome', window.chrome);
    this.#originalAPIs.set('eval', window.eval);
    this.#originalAPIs.set('Function', window.Function);
    this.#originalAPIs.set('console', { ...console });
  }

  /**
   * Ofusca y modifica el entorno de ejecución.
   * @param {Object} config - Configuración para activar protecciones específicas.
   */
  static #mockEnvironment(config) {
    // Ocultar APIs de extensión
    if (config.hideChromeAPI !== false) {
      window.chrome = new Proxy({}, {
        get: (target, prop) => {
          if (prop === 'runtime') return undefined;
          return this.#originalAPIs.get('chrome')[prop];
        },
        set: () => false
      });
    }

    // Modificar APIs de pago
    window.PaymentRequest = class MockPaymentRequest {
      constructor() {
        return new Proxy({}, {
          get: (target, prop) => {
            const methods = {
              show: () => Promise.resolve({
                complete: () => ({
                  transactionIdentifier: crypto.randomUUID()
                })
              }),
              abort: () => Promise.resolve()
            };
            return methods[prop] || null;
          }
        });
      }
    };

    // Ofuscar huella del navegador
    Object.defineProperties(navigator, {
      userAgent: {
        value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        configurable: false
      },
      webdriver: {
        get: () => false
      }
    });
  }

  /**
   * Bloquea solicitudes a servicios de análisis comunes.
   */
  static #blockAnalytics() {
    if (!chrome.declarativeNetRequest) return;

    const blockPatterns = [
      '*google-analytics.com*',
      '*segment.io*',
      '*mixpanel.com*',
      '*.hotjar.com*'
    ];

    chrome.declarativeNetRequest.updateDynamicRules({
      addRules: [{
        id: 1,
        priority: 1,
        action: { type: 'block' },
        condition: {
          urlFilter: blockPatterns.join('|'),
          resourceTypes: ['xmlhttprequest', 'script']
        }
      }],
      removeRuleIds: [1]
    });
  }

  /**
   * Implementa técnicas para proteger contra la depuración.
   */
  static #protectAgainstDebugging() {
    // Detección de DevTools
    const threshold = 160;
    let devtoolsOpen = false;
    
    const checkDevTools = () => {
      const widthDiff = window.outerWidth - window.innerWidth;
      const heightDiff = window.outerHeight - window.innerHeight;
      
      const shouldReload = widthDiff > threshold || 
                          heightDiff > threshold ||
                          window.Firebug?.chrome?.isInitialized;

      if (shouldReload && !devtoolsOpen) {
        window.location.reload();
        devtoolsOpen = true;
      }
    };

    setInterval(checkDevTools, 1000);

    // Protección del código
    Object.freeze(Object.prototype);
    Object.freeze(Array.prototype);
    
    // Modificar console.log
    const consoleMethods = ['log', 'warn', 'error', 'info', 'debug', 'dir', 'trace'];
    consoleMethods.forEach(method => {
      const original = console[method];
      console[method] = (...args) => {
        if (args.some(arg => 
          typeof arg === 'string' && 
          arg.match(/phantom|bypass|lab/i)
        )) return;
        original.apply(console, args);
      };
    });

    // Anti-debugging
    const debuggerProtection = () => {
      const start = Date.now();
      debugger;
      if (Date.now() - start > 200) {
        document.body.innerHTML = '';
        window.stop();
      }
    };
    
    setInterval(debuggerProtection, 2000);
  }

  /**
   * Desactiva las protecciones y restaura las APIs originales.
   */
  static deactivate() {
    this.#isActive = false;
    // Restaurar APIs originales
    this.#originalAPIs.forEach((value, key) => {
      window[key] = value;
    });
    
    if (chrome.declarativeNetRequest) {
      chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: [1]
      });
    }
  }
}

// Uso
PhantomGhost.activate({
  hideChromeAPI: true,
  blockCommonTrackers: true,
  antiDebugging: true
});