// src/core/loader.js
import { PhantomCrypto } from '../utils/fake-crypto.js';
import { NetworkInterceptor } from './network-interceptor.js';
import { WebSocketInterceptor } from './websocket-interceptor.js';
import { DOMBypass } from './dom-engine.js';
import { PhantomGhost } from '../stealth/ghost.js';
import { LabLogger } from '../utils/logger.js';

const MODULE_VERSIONS = {
  network: '2.1.0',
  websocket: '1.2.1',
  dom: '3.0.0',
  stealth: '4.0.0'
};

class PhantomLoader {
  static #instance = null;
  #modules = new Map();
  #logger = new LabLogger();

  constructor() {
    if (PhantomLoader.#instance) return PhantomLoader.#instance;
    PhantomLoader.#instance = this;
    
    this.#initialize().catch(error => {
      this.#logger.error('Boot Critical Failure:', error);
      this.#activateKillswitch();
    });
  }

  async #initialize() {
    try {
      await this.#validateLabEnvironment();
      await this.#loadCoreModules();
      this.#logger.log('System Operational', { 
        version: chrome.runtime.getManifest().version,
        modules: MODULE_VERSIONS 
      });
    } catch (error) {
      this.#logger.error('Initialization Failed:', error);
      throw error;
    }
  }

  async #validateLabEnvironment() {
    try {
      const labToken = await PhantomCrypto.generateLabAuthToken();
      const response = await fetch('https://lab-control/api/auth', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${labToken}` }
      });
      
      if (!response.ok) throw new Error('Invalid Lab Environment');
    } catch (error) {
      this.#logger.error('Environment Validation Failed:', error);
      throw new Error('Network Security Protocol Activated');
    }
  }

  async #loadCoreModules() {
    try {
      this.#modules.set('network', new NetworkInterceptor());
      this.#modules.set('websocket', new WebSocketInterceptor());
      this.#modules.set('dom', new DOMBypass());
      this.#modules.set('stealth', new PhantomGhost());
      
      for (const [name, module] of this.#modules) {
        await module.initialize();
        this.#logger.debug(`Module ${name.toUpperCase()} Loaded`, {
          version: MODULE_VERSIONS[name]
        });
      }
    } catch (error) {
      this.#logger.error('Module Load Failure:', error);
      throw new Error('Core Systems Offline');
    }
  }

  #activateKillswitch() {
    this.#logger.warn('Activating Emergency Protocol');
    chrome.storage.local.clear(() => {
      chrome.runtime.reload();
      window.location.replace('about:blank');
    });
  }
}

// Secure Boot Sequence
const initializePhantom = () => {
  if (!window.phantomBootLock) {
    window.phantomBootLock = true;
    new PhantomLoader();
  }
};

// Polyfill Management
const loadPolyfills = async () => {
  if (!window.Promise) {
    await import('../libs/es6-promise-polyfill.js');
  }
  if (!window.TextEncoder) {
    await import('../libs/text-encoder-polyfill.js');
  }
};

// Execution Flow
(async () => {
  await loadPolyfills();
  document.addEventListener('DOMContentLoaded', initializePhantom);
  if (document.readyState === 'complete') initializePhantom();
})();
