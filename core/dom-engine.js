import { PhantomCrypto } from '../utils/fake-crypto.js';

const GATEWAY_DOM_RULES = {
  stripe: {
    selectors: ['.StripeElement', '[data-stripe]', '#card-element'],
    replaceText: {
      'card number': '4242 4242 4242 4242',
      'expiration': '12/50',
      'cvc': '123'
    },
    status: {
      selectors: ['#payment-status', '.payment-errors'],
      replace: {
        'declined': '✅ LAB APPROVED',
        'failed': '✅ LAB SUCCESS'
      }
    }
  },
  paypal: {
    selectors: ['#paypal-button-container', '.paypal-button'],
    replaceText: {
      'pay with paypal': 'PAY WITH LAB SYSTEM'
    },
    status: {
      selectors: ['.paypal-status', '#paymentStatus'],
      replace: {
        'denied': 'APPROVED (LAB)'
      }
    }
  },
  klarna: {
    selectors: ['#klarna-container', '[data-klarna]'],
    status: {
      selectors: ['.klarna-status-message'],
      replace: {
        'not approved': 'LAB APPROVED',
        'denied': 'AUTHORIZED'
      }
    }
  },
  square: {
    selectors: ['#square-card', '.sq-payment-form'],
    replaceText: {
      'card information': 'LAB TEST CARD'
    },
    status: {
      selectors: ['.sq-status-message'],
      replace: {
        'payment failed': 'PAYMENT SUCCESS'
      }
    }
  },
  twoCheckout: {
    selectors: ['#2co-form', '.twocheckout-payment'],
    status: {
      selectors: ['#2co-error'],
      replace: {
        'declined': 'APPROVED'
      }
    }
  }
};

/**
 * Procesa un elemento del DOM, aplicando reemplazos de texto y modificaciones de estado.
 * @param {HTMLElement} element - Elemento del DOM a procesar.
 */
async function processElement(element) {
  try {
    // Generar firma única para todos los elementos
    const labSignature = await PhantomCrypto.generateHmacSignature('dom-bypass');
    
    // Reemplazar texto en inputs
    if (element.tagName === 'INPUT') {
      Object.entries(GATEWAY_DOM_RULES).forEach(([_, rules]) => {
        Object.entries(rules.replaceText || {}).forEach(([key, value]) => {
          if (element.placeholder?.toLowerCase().includes(key)) {
            element.value = value;
            element.setAttribute('data-lab-modified', 'true');
          }
        });
      });
    }

    // Modificar estados de pago
    Object.entries(GATEWAY_DOM_RULES).forEach(([gateway, rules]) => {
      rules.status.selectors.forEach(selector => {
        if (element.matches(selector)) {
          Object.entries(rules.status.replace).forEach(([original, replacement]) => {
            if (element.textContent.toLowerCase().includes(original)) {
              element.innerHTML = `
                <span style="color: green; font-weight: bold;">
                  ${replacement} 
                  <small>(${gateway.toUpperCase()} LAB BYPASS)</small>
                </span>
              `;
              element.dataset.labSignature = labSignature;
            }
          });
        }
      });
    });
  } catch (error) {
    console.error('[DOM Bypass] Error processing element:', error);
  }
}

/**
 * Inicia el bypass del DOM, procesando elementos existentes y observando cambios dinámicos.
 */
async function domBypass() {
  try {
    // Procesar elementos existentes
    const elements = document.querySelectorAll('*');
    for (const element of elements) {
      await processElement(element);
    }

    // Observar cambios dinámicos
    if (window.MutationObserver) {
      const observer = new MutationObserver(async (mutations) => {
        for (const mutation of mutations) {
          for (const node of mutation.addedNodes) {
            if (node.nodeType === 1) {
              await processElement(node);
              const children = node.querySelectorAll('*');
              for (const child of children) {
                await processElement(child);
              }
            }
          }
        }
      });

      observer.observe(document, {
        subtree: true,
        childList: true,
        attributes: true,
        characterData: true
      });
    }
  } catch (error) {
    console.error('[DOM Bypass] Error during bypass:', error);
  }
}

// Iniciar bypass al cargar
(async () => {
  document.addEventListener('DOMContentLoaded', domBypass);
  document.addEventListener('load', domBypass);
  await domBypass();
})();