const MDNSResolver = require('../index');

// Create resolver with HTTP server enabled
const resolver = new MDNSResolver({
  server: true,           // Enable HTTP server for browsers
  serverPort: 5380,       // Port for HTTP server (default: 5380)
  serverHost: 'localhost', // Host for HTTP server (default: localhost)
  timeout: 5000,          // mDNS query timeout
  ttl: 120,               // Cache TTL
  cors: true              // Enable CORS (default: true)
});

// Listen for server events
resolver.on('server-started', ({ url }) => {
  console.log(`HTTP server started at ${url}`);
  console.log(`Browsers can now query: ${url}/resolve?name=<hostname>`);
});

resolver.on('resolved', ({ name, type, address, ttl }) => {
  console.log(`Resolved: ${name} (${type}) -> ${address} (TTL: ${ttl}s)`);
});

resolver.on('error', (err) => {
  console.error(`Resolver error: ${err.message}`);
});

resolver.on('server-error', (err) => {
  console.error(`Server error: ${err.message}`);
});

// Start the resolver and server
console.log('Starting mDNS resolver with HTTP server...');
resolver.start();

// Example: Resolve a hostname programmatically from Node.js
setTimeout(async () => {
  try {
    const address = await resolver.resolve('example.local');
    console.log(`Node.js resolved: ${address}`);
  } catch (err) {
    console.error(`Failed to resolve: ${err.message}`);
  }
}, 1000);

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nStopping resolver...');
  await resolver.stop();
  console.log('Stopped');
  process.exit(0);
});
