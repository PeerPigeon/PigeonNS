/**
 * Basic example demonstrating how to use PigeonNS to resolve mDNS hostnames
 */

const MDNSResolver = require('../index');

async function basicExample() {
  console.log('=== Basic PigeonNS Example ===\n');

  // Create a resolver with custom options
  const resolver = new MDNSResolver({
    timeout: 5000,  // Wait up to 5 seconds for responses
    ttl: 120,       // Cache entries for 120 seconds
    cacheSize: 100  // Keep up to 100 entries in cache
  });

  // Listen to events
  resolver.on('started', () => {
    console.log('✓ Resolver started\n');
  });

  resolver.on('query', ({ name, type }) => {
    console.log(`→ Querying: ${name} (${type})`);
  });

  resolver.on('resolved', ({ name, address, ttl }) => {
    console.log(`✓ Resolved: ${name} -> ${address} (TTL: ${ttl}s)`);
  });

  resolver.on('cache-hit', ({ name, address }) => {
    console.log(`⚡ Cache hit: ${name} -> ${address}`);
  });

  resolver.on('error', (err) => {
    console.error(`✗ Error: ${err.message}`);
  });

  // Start the resolver
  resolver.start();

  // Example 1: Try to resolve your local hostname
  // Replace 'your-computer.local' with an actual hostname on your network
  console.log('Example 1: Resolving a hostname');
  console.log('Note: Replace with an actual .local hostname on your network\n');

  try {
    const hostname = 'your-computer.local';
    const address = await resolver.resolve(hostname);
    console.log(`\nSuccess! ${hostname} resolves to ${address}\n`);
  } catch (error) {
    console.log(`\nNote: ${error.message}`);
    console.log('This is expected if the hostname doesn\'t exist on your network.\n');
  }

  // Example 2: Query both IPv4 and IPv6
  console.log('Example 2: Querying IPv4 and IPv6');
  const testHost = 'test.local';

  try {
    console.log(`Trying to resolve ${testHost}...`);
    const ipv4 = await resolver.resolve(testHost, 'A');
    console.log(`IPv4: ${ipv4}`);
  } catch (error) {
    console.log(`IPv4 not found: ${error.message}`);
  }

  try {
    const ipv6 = await resolver.resolve(testHost, 'AAAA');
    console.log(`IPv6: ${ipv6}`);
  } catch (error) {
    console.log(`IPv6 not found: ${error.message}`);
  }

  // Example 3: Show cache statistics
  console.log('\nExample 3: Cache statistics');
  console.log(`Cache size: ${resolver.getCacheSize()} entries`);
  console.log('Cache contents:', JSON.stringify(resolver.getCache(), null, 2));

  // Clean up
  console.log('\nStopping resolver...');
  resolver.stop();
  console.log('Done!');

  // Force exit (in case there are still open handles)
  setTimeout(() => process.exit(0), 1000);
}

// Run the example
basicExample().catch(console.error);
