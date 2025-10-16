const mdns = require('multicast-dns');
const EventEmitter = require('events');

/**
 * PigeonNS - A local-only mDNS resolver
 * 
 * Resolves mDNS .local domain names to IP addresses.
 * This is particularly useful for WebRTC applications where browsers
 * obfuscate local IP addresses using mDNS for privacy.
 */
class MDNSResolver extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = {
      ttl: options.ttl || 120, // Default TTL of 120 seconds
      cacheSize: options.cacheSize || 1000,
      timeout: options.timeout || 5000, // Query timeout in ms
      ...options
    };
    
    this.cache = new Map();
    this.mdns = null;
    this.pendingQueries = new Map();
  }

  /**
   * Start the mDNS resolver
   */
  start() {
    if (this.mdns) {
      throw new Error('Resolver is already running');
    }

    this.mdns = mdns();

    // Listen for mDNS responses
    this.mdns.on('response', (response) => {
      this._handleResponse(response);
    });

    this.mdns.on('error', (err) => {
      this.emit('error', err);
    });

    this.emit('started');
  }

  /**
   * Stop the mDNS resolver
   */
  stop() {
    if (this.mdns) {
      this.mdns.destroy();
      this.mdns = null;
    }
    
    // Reject all pending queries
    for (const [name, pending] of this.pendingQueries.entries()) {
      pending.reject(new Error('Resolver stopped'));
      this.pendingQueries.delete(name);
    }
    
    this.emit('stopped');
  }

  /**
   * Resolve a .local domain name to an IP address
   * @param {string} name - The domain name to resolve (e.g., "abc123.local")
   * @param {string} type - Record type ('A' for IPv4, 'AAAA' for IPv6)
   * @returns {Promise<string>} The resolved IP address
   */
  async resolve(name, type = 'A') {
    if (!this.mdns) {
      throw new Error('Resolver is not running. Call start() first.');
    }

    // Ensure name ends with .local
    if (!name.endsWith('.local')) {
      name = `${name}.local`;
    }

    // Check cache first
    const cacheKey = `${name}:${type}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached && cached.expires > Date.now()) {
      this.emit('cache-hit', { name, type, address: cached.address });
      return cached.address;
    }

    // Check if we already have a pending query for this name
    if (this.pendingQueries.has(cacheKey)) {
      return this.pendingQueries.get(cacheKey).promise;
    }

    // Create new query promise
    let promiseResolve, promiseReject;
    const queryPromise = new Promise((resolve, reject) => {
      promiseResolve = resolve;
      promiseReject = reject;
    });

    const timeout = setTimeout(() => {
      this.pendingQueries.delete(cacheKey);
      promiseReject(new Error(`Timeout resolving ${name}`));
    }, this.options.timeout);

    this.pendingQueries.set(cacheKey, {
      resolve: (address) => {
        clearTimeout(timeout);
        this.pendingQueries.delete(cacheKey);
        promiseResolve(address);
      },
      reject: (err) => {
        clearTimeout(timeout);
        this.pendingQueries.delete(cacheKey);
        promiseReject(err);
      },
      promise: queryPromise
    });

    // Send mDNS query
    this.mdns.query({
      questions: [{
        name: name,
        type: type
      }]
    });

    this.emit('query', { name, type });

    return queryPromise;
  }

  /**
   * Handle mDNS response
   * @private
   */
  _handleResponse(response) {
    if (!response.answers || response.answers.length === 0) {
      return;
    }

    for (const answer of response.answers) {
      if (answer.type === 'A' || answer.type === 'AAAA') {
        const name = answer.name;
        const address = answer.data;
        const ttl = answer.ttl || this.options.ttl;
        
        // Add to cache
        const cacheKey = `${name}:${answer.type}`;
        this.cache.set(cacheKey, {
          address: address,
          expires: Date.now() + (ttl * 1000)
        });

        // Manage cache size
        if (this.cache.size > this.options.cacheSize) {
          const firstKey = this.cache.keys().next().value;
          this.cache.delete(firstKey);
        }

        // Resolve pending query if exists
        const pending = this.pendingQueries.get(cacheKey);
        if (pending) {
          pending.resolve(address);
        }

        this.emit('resolved', { name, type: answer.type, address, ttl });
      }
    }
  }

  /**
   * Clear the resolver cache
   */
  clearCache() {
    this.cache.clear();
    this.emit('cache-cleared');
  }

  /**
   * Get current cache size
   */
  getCacheSize() {
    return this.cache.size;
  }

  /**
   * Get cache contents (for debugging)
   */
  getCache() {
    const result = {};
    for (const [key, value] of this.cache.entries()) {
      result[key] = {
        address: value.address,
        expiresIn: Math.max(0, Math.floor((value.expires - Date.now()) / 1000))
      };
    }
    return result;
  }
}

module.exports = MDNSResolver;
