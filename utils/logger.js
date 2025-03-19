// Logger seguro y flexible
export class LabLogger {
  static #levels = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3
  };

  static #currentLevel = this.#levels.INFO; // Nivel de registro por defecto

  /**
   * Configura el nivel de registro.
   * @param {string} level - Nivel de registro (DEBUG, INFO, WARN, ERROR).
   */
  static setLevel(level) {
    if (this.#levels[level] !== undefined) {
      this.#currentLevel = this.#levels[level];
    } else {
      console.warn(`[LAB] Invalid log level: ${level}`);
    }
  }

  /**
   * Registra un mensaje de depuración.
   * @param {string} message - Mensaje a registrar.
   * @param {Object} [data] - Datos adicionales.
   */
  static debug(message, data) {
    if (this.#currentLevel <= this.#levels.DEBUG) {
      this.#log('DEBUG', message, data);
    }
  }

  /**
   * Registra un mensaje informativo.
   * @param {string} message - Mensaje a registrar.
   * @param {Object} [data] - Datos adicionales.
   */
  static info(message, data) {
    if (this.#currentLevel <= this.#levels.INFO) {
      this.#log('INFO', message, data);
    }
  }

  /**
   * Registra un mensaje de advertencia.
   * @param {string} message - Mensaje a registrar.
   * @param {Object} [data] - Datos adicionales.
   */
  static warn(message, data) {
    if (this.#currentLevel <= this.#levels.WARN) {
      this.#log('WARN', message, data);
    }
  }

  /**
   * Registra un mensaje de error.
   * @param {string} message - Mensaje a registrar.
   * @param {Object} [data] - Datos adicionales.
   */
  static error(message, data) {
    if (this.#currentLevel <= this.#levels.ERROR) {
      this.#log('ERROR', message, data);
    }
  }

  /**
   * Registra un mensaje en la consola.
   * @param {string} level - Nivel de registro.
   * @param {string} message - Mensaje a registrar.
   * @param {Object} [data] - Datos adicionales.
   */
  static #log(level, message, data) {
    const timestamp = new Date().toISOString();
    const logMessage = `[LAB] ${timestamp} [${level}]: ${message}`;

    try {
      // Imprimir en la consola
      switch (level) {
        case 'DEBUG':
          console.debug(logMessage, data || '');
          break;
        case 'INFO':
          console.info(logMessage, data || '');
          break;
        case 'WARN':
          console.warn(logMessage, data || '');
          break;
        case 'ERROR':
          console.error(logMessage, data || '');
          break;
        default:
          console.log(logMessage, data || '');
      }

      // Guardar en localStorage (opcional)
      this.#saveToLocalStorage(logMessage, data);
    } catch (error) {
      console.error('[LAB] Logger Error:', error);
    }
  }

  /**
   * Guarda el registro en localStorage (opcional).
   * @param {string} message - Mensaje a guardar.
   * @param {Object} [data] - Datos adicionales.
   */
  static #saveToLocalStorage(message, data) {
    try {
      const logs = JSON.parse(localStorage.getItem('labLogs') || '[]');
      logs.push({ message, data, timestamp: new Date().toISOString() });
      localStorage.setItem('labLogs', JSON.stringify(logs));
    } catch (error) {
      console.error('[LAB] Failed to save logs to localStorage:', error);
    }
  }

  /**
   * Obtiene los registros guardados en localStorage.
   * @returns {Array} - Lista de registros.
   */
  static getLogs() {
    try {
      return JSON.parse(localStorage.getItem('labLogs') || '[]');
    } catch (error) {
      console.error('[LAB] Failed to retrieve logs from localStorage:', error);
      return [];
    }
  }

  /**
   * Limpia los registros guardados en localStorage.
   */
  static clearLogs() {
    try {
      localStorage.removeItem('labLogs');
    } catch (error) {
      console.error('[LAB] Failed to clear logs from localStorage:', error);
    }
  }
}