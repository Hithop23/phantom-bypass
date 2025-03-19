export class PhantomCrypto {
  static #secretKey = 'phantom-lab-secret-2023';
  static #algorithm = 'SHA-256';
  static #encoder = new TextEncoder();
  static #decoder = new TextDecoder();

  /**
   * Genera un JWT falso con un payload personalizado.
   * @param {Object} payload - Datos para incluir en el JWT.
   * @returns {Promise<string>} - JWT simulado.
   */
  static async generateFakeJWT(payload = {}) {
    if (typeof payload !== 'object' || payload === null) {
      throw new Error('Payload must be an object');
    }

    const header = {
      alg: 'HS256',
      typ: 'JWT',
      lab: true
    };

    const encodedHeader = btoa(JSON.stringify(header))
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');

    const encodedPayload = btoa(JSON.stringify({
      ...payload,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600
    }))
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');

    const key = await crypto.subtle.importKey(
      'raw',
      this.#encoder.encode(this.#secretKey),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const signature = await crypto.subtle.sign(
      'HMAC',
      key,
      this.#encoder.encode(`${encodedHeader}.${encodedPayload}`)
    );

    const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');

    return `${encodedHeader}.${encodedPayload}.${signatureB64}`;
  }

  /**
   * Genera una firma HMAC para los datos proporcionados.
   * @param {string|Object} data - Datos para firmar.
   * @returns {Promise<string>} - Firma HMAC en formato hexadecimal.
   */
  static async generateHmacSignature(data) {
    if (typeof data !== 'string' && typeof data !== 'object') {
      throw new Error('Data must be a string or an object');
    }

    const key = await crypto.subtle.importKey(
      'raw',
      this.#encoder.encode(this.#secretKey),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const signature = await crypto.subtle.sign(
      'HMAC',
      key,
      this.#encoder.encode(typeof data === 'string' ? data : JSON.stringify(data))
    );

    return Array.from(new Uint8Array(signature))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase();
  }

  /**
   * Simula el cifrado de datos usando AES-GCM.
   * @param {Object} data - Datos para cifrar.
   * @returns {Promise<{iv: string, cipher: string, key: CryptoKey}>} - Datos cifrados.
   */
  static async fakeEncrypt(data) {
    const key = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );

    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      this.#encoder.encode(JSON.stringify(data))
    );

    return {
      iv: Array.from(iv).join(','),
      cipher: Array.from(new Uint8Array(encrypted)).join(','),
      key
    };
  }

  /**
   * Simula el descifrado de datos cifrados con AES-GCM.
   * @param {Object} encryptedData - Datos cifrados.
   * @returns {Promise<Object>} - Datos descifrados.
   */
  static async fakeDecrypt(encryptedData) {
    try {
      const iv = new Uint8Array(encryptedData.iv.split(',').map(Number));
      const cipher = new Uint8Array(encryptedData.cipher.split(',').map(Number));
      
      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        encryptedData.key,
        cipher
      );

      return JSON.parse(this.#decoder.decode(decrypted));
    } catch (error) {
      console.error('[PhantomCrypto] Decryption failed:', error);
      return { status: 'bypassed', lab: true };
    }
  }
}