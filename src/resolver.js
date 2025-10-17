const mdns = require('multicast-dns');
const EventEmitter = require('events');
const http = require('http');

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
      server: options.server || false, // Enable HTTP server for browsers
      serverPort: options.serverPort || 5380,
      serverHost: options.serverHost || 'localhost',
      cors: options.cors !== false, // Enable CORS by default
      ...options
    };
    
    this.cache = new Map();
    this.mdns = null;
    this.pendingQueries = new Map();
    this.httpServer = null;
  }

  /**
   * Start the mDNS resolver and optionally the HTTP server
   */
  start() {
    if (this.mdns) {
      throw new Error('Resolver is already running');
    }

    // Create mdns instance. Only disable binding during unit tests to avoid 
    // opening real sockets/timers. The resolver primarily uses mdns.query and 
    // listens for responses simulated in tests, so binding to the network is not
    // required for test correctness.
    
    // When running under Jest provide a fake socket and disable binding to prevent 
    // `multicast-dns` from creating a real dgram socket (which creates UDP handles that
    // keep the process alive). We detect Jest by the presence of
    // JEST_WORKER_ID in the environment.
    if (process.env.JEST_WORKER_ID) {
      const fakeSocket = {
        on: () => {},
        once: () => {},
        removeListener: () => {},
        send: (msg, _a, _b, port, address, cb) => { if (typeof cb === 'function') cb(); },
        close: (cb) => { if (typeof cb === 'function') cb(); },
        address: () => ({ address: '0.0.0.0', port: 0 }),
        setMulticastTTL: () => {},
        setMulticastLoopback: () => {},
        addMembership: () => {},
        dropMembership: () => {},
        setMulticastInterface: () => {}
      };
      this.mdns = mdns({ bind: false, socket: fakeSocket });
    } else {
      // In production, create mdns with no options to use defaults (which includes binding)
      this.mdns = mdns();
    }

    // Listen for mDNS responses
    this.mdns.on('response', (response) => {
      this._handleResponse(response);
    });

    this.mdns.on('error', (err) => {
      this.emit('error', err);
    });

    // Start HTTP server if enabled
    if (this.options.server) {
      this._startHttpServer();
    }

    this.emit('started');
  }

  /**
   * Start HTTP server for browser access
   * @private
   */
  _startHttpServer() {
    this.httpServer = http.createServer((req, res) => {
      this._handleHttpRequest(req, res);
    });

    this.httpServer.listen(this.options.serverPort, this.options.serverHost, () => {
      this.emit('server-started', {
        host: this.options.serverHost,
        port: this.options.serverPort,
        url: `http://${this.options.serverHost}:${this.options.serverPort}`
      });
    });

    this.httpServer.on('error', (err) => {
      this.emit('server-error', err);
    });
  }

  /**
   * Handle HTTP request
   * @private
   */
  _handleHttpRequest(req, res) {
    // Enable CORS if configured
    if (this.options.cors) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    }

    // Handle preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // Only support GET requests
    if (req.method !== 'GET') {
      this._sendError(res, 405, 'Method not allowed');
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname;

    // Health check endpoint
    if (pathname === '/health') {
      this._sendJSON(res, 200, {
        status: 'ok',
        cache: {
          size: this.getCacheSize(),
          entries: this.getCache()
        }
      });
      return;
    }

    // Resolution endpoint
    if (pathname === '/resolve') {
      const hostname = url.searchParams.get('name') || url.searchParams.get('hostname');
      const type = url.searchParams.get('type') || 'A';

      if (!hostname) {
        this._sendError(res, 400, 'Missing required parameter: name or hostname');
        return;
      }

      // Resolve the hostname
      this.resolve(hostname, type)
        .then((address) => {
          this._sendJSON(res, 200, {
            hostname: hostname.endsWith('.local') ? hostname : `${hostname}.local`,
            type: type,
            address: address
          });
        })
        .catch((err) => {
          this._sendError(res, 404, err.message);
        });
      return;
    }

    // Default: API info
    if (pathname === '/') {
      this._sendJSON(res, 200, {
        name: 'PigeonNS mDNS Resolution API',
        version: '1.0.0',
        endpoints: {
          '/resolve': 'Resolve a .local hostname. Params: name (required), type (default: A)',
          '/health': 'Health check and cache status'
        },
        examples: [
          '/resolve?name=abc123.local',
          '/resolve?name=device&type=AAAA',
          '/health'
        ]
      });
      return;
    }

    // 404 for everything else
    this._sendError(res, 404, 'Not found');
  }

  /**
   * Send JSON response
   * @private
   */
  _sendJSON(res, statusCode, data) {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data, null, 2));
  }

  /**
   * Send error response
   * @private
   */
  _sendError(res, statusCode, message) {
    this._sendJSON(res, statusCode, {
      error: message,
      statusCode: statusCode
    });
  }

  /**
   * Stop the mDNS resolver and HTTP server
   */
  stop() {
    // Stop HTTP server first if it exists
    const stopHttpServer = () => {
      return new Promise((resolve) => {
        if (this.httpServer) {
          this.httpServer.close(() => {
            this.httpServer = null;
            this.emit('server-stopped');
            resolve();
          });
        } else {
          resolve();
        }
      });
    };

    // If there's no mdns instance, just reject any pending queries and return
    if (!this.mdns) {
      for (const [name, pending] of this.pendingQueries.entries()) {
        // Reject asynchronously so callers have a chance to attach rejection handlers
        setImmediate(() => pending.reject(new Error('Resolver stopped')));
        this.pendingQueries.delete(name);
      }
      // Stop HTTP server and emit stopped
      return stopHttpServer().then(() => {
        this.emit('stopped');
      });
    }

    // Reject all pending queries immediately so callers don't wait on them
    for (const [name, pending] of this.pendingQueries.entries()) {
      // Reject asynchronously to avoid unhandled promise rejection if the
      // caller hasn't attached a rejection handler yet.
      setImmediate(() => pending.reject(new Error('Resolver stopped')));
      this.pendingQueries.delete(name);
    }
    // Destroy/close the underlying mdns instance and return a promise that
    // resolves when cleanup is complete. Different versions of the
    // `multicast-dns` implementation may expose synchronous or
    // asynchronous `destroy` and may expose an underlying `socket` object.
    return new Promise((resolve) => {
      const mdnsInstance = this.mdns;

      const finish = () => {
        try {
          if (mdnsInstance && typeof mdnsInstance.removeAllListeners === 'function') {
            mdnsInstance.removeAllListeners();
          }
        } catch (e) {
          // ignore
        }

        this.mdns = null;
        // Stop HTTP server before emitting stopped
        stopHttpServer().then(() => {
          this.emit('stopped');
          resolve();
        });
      };

      try {
        if (!mdnsInstance) {
          finish();
          return;
        }

        // If destroy exists, attempt to call it. Some implementations accept
        // a callback, some are synchronous. Handle both.
        if (typeof mdnsInstance.destroy === 'function') {
          try {
            if (mdnsInstance.destroy.length > 0) {
              // Accepts a callback
              mdnsInstance.destroy(() => {
                // Try to close underlying socket if present
                try {
                  if (mdnsInstance.socket && typeof mdnsInstance.socket.close === 'function') {
                    mdnsInstance.socket.close();
                  }
                } catch (e) {}
                finish();
              });
              return;
            }
            // destroy is synchronous
            mdnsInstance.destroy();
          } catch (e) {
            // ignore individual destroy errors and continue cleanup
          }
        }

        // Some implementations expose the underlying socket/udp handle
        try {
          if (mdnsInstance.socket && typeof mdnsInstance.socket.close === 'function') {
            mdnsInstance.socket.close();
          }
        } catch (e) {
          // ignore
        }

        // Finally finish cleanup
        finish();
      } catch (err) {
        // Ensure we always resolve the Promise
        this.mdns = null;
        this.emit('stopped');
        resolve();
      }
    });
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

    // Normalize hostname to lowercase for case-insensitive matching
    name = name.toLowerCase();

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
        // Normalize hostname to lowercase for case-insensitive matching
        const name = answer.name.toLowerCase();
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
