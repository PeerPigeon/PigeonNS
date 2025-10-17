const MDNSResolver = require('./index');

// Create resolver with HTTP server enabled
const resolver = new MDNSResolver({
  server: true,
  serverPort: 5380,
  serverHost: 'localhost',
  timeout: 5000,
  ttl: 120
});

resolver.on('server-started', ({ url }) => {
  console.log(`✓ HTTP server started at ${url}`);
  console.log(`Test: curl "${url}/resolve?name=iPhone.local"`);
});

resolver.on('resolved', ({ name, type, address }) => {
  console.log(`✓ Resolved: ${name} (${type}) -> ${address}`);
});

resolver.on('error', (err) => {
  console.error(`✗ Resolver error: ${err.message}`);
});

resolver.on('server-error', (err) => {
  console.error(`✗ Server error: ${err.message}`);
});

console.log('Starting resolver with HTTP server...');
resolver.start();

process.on('SIGINT', async () => {
  console.log('\nStopping...');
  await resolver.stop();
  process.exit(0);
});

// Keep process alive
setInterval(() => {}, 1000);
