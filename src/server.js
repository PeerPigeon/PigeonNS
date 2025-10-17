const http = require('http');
const MDNSResolver = require('./resolver');

/**
 * HTTP API server for mDNS resolution
 * Allows browsers and other HTTP clients to resolve .local hostnames
 */
class MDNSServer {
  constructor(options = {}) {
    this.options = {
      port: options.port || 5380,
      host: options.host || 'localhost',
      cors: options.cors !== false, // Enable CORS by default
      ...options
    };
    
    this.resolver = new MDNSResolver(options);
    this.server = null;
  }

  /**
   * Start the HTTP server and mDNS resolver
   */
  start() {
    return new Promise((resolve, reject) => {
      this.resolver.start();

      this.server = http.createServer((req, res) => {
        this._handleRequest(req, res);
      });

      this.server.on('error', (err) => {
        reject(err);
      });

      this.server.listen(this.options.port, this.options.host, () => {
        resolve({
          host: this.options.host,
          port: this.options.port,
          url: `http://${this.options.host}:${this.options.port}`
        });
      });
    });
  }

  /**
   * Stop the server and resolver
   */
  async stop() {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          this.resolver.stop().then(resolve);
        });
      } else {
        this.resolver.stop().then(resolve);
      }
    });
  }

  /**
   * Handle HTTP request
   * @private
   */
  _handleRequest(req, res) {
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
          size: this.resolver.getCacheSize(),
          entries: this.resolver.getCache()
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
      this.resolver.resolve(hostname, type)
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
}

module.exports = MDNSServer;
