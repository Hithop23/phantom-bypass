class PhantomUI {
    constructor() {
      this.bypassEnabled = false;
      this.initElements();
      this.checkLabEnvironment();
      this.initEventListeners();
      this.initLogs();
    }
  
    initElements() {
      this.toggle = document.getElementById('bypassToggle');
      this.statusLed = document.getElementById('statusLed');
      this.statusText = document.getElementById('connectionStatus');
      this.killswitch = document.getElementById('killswitch');
      this.logContainer = document.getElementById('logs');
    }
  
    checkLabEnvironment() {
      chrome.runtime.sendMessage({ action: 'verifyEnvironment' }, (response) => {
        if (response?.valid) {
          this.updateStatus(true, 'Conectado al Laboratorio');
          this.loadState();
        } else {
          this.updateStatus(false, '⚠️ Fuera del Entorno Autorizado');
          this.disableControls();
        }
      });
    }
  
    updateStatus(connected, text) {
      this.statusLed.classList.toggle('active', connected);
      this.statusText.textContent = text;
      this.statusText.style.color = connected ? '#0f0' : '#f00';
    }
  
    disableControls() {
      this.toggle.disabled = true;
      this.killswitch.disabled = true;
    }
  
    loadState() {
      chrome.storage.local.get(['bypassEnabled'], (result) => {
        this.bypassEnabled = result.bypassEnabled || false;
        this.toggle.checked = this.bypassEnabled;
        this.log(`Estado cargado: ${this.bypassEnabled ? 'ACTIVO' : 'INACTIVO'}`);
      });
    }
  
    initEventListeners() {
      this.toggle.addEventListener('change', (e) => {
        this.bypassEnabled = e.target.checked;
        chrome.runtime.sendMessage({
          action: 'toggleBypass',
          state: this.bypassEnabled
        });
        this.log(`Bypass ${this.bypassEnabled ? 'activado' : 'desactivado'}`);
      });
  
      this.killswitch.addEventListener('click', () => {
        if (confirm('¿Auto-destruir todos los datos del laboratorio?')) {
          chrome.runtime.sendMessage({ action: 'selfDestruct' });
          window.close();
        }
      });
    }
  
    initLogs() {
      chrome.runtime.onMessage.addListener((request) => {
        if (request.type === 'log') {
          this.log(request.message, request.timestamp);
        }
      });
    }
  
    log(message, timestamp = new Date().toLocaleTimeString()) {
      const entry = document.createElement('div');
      entry.className = 'log-entry';
      entry.innerHTML = `<span class="time">[${timestamp}]</span> ${message}`;
      this.logContainer.prepend(entry);
    }
  }
  
  // Inicializar UI
  new PhantomUI();