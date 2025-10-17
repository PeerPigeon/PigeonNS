#!/usr/bin/env node

const MDNSResolver = require('../index');

const resolver = new MDNSResolver();

console.log('Starting mDNS monitor...');
console.log('Listening for mDNS responses on the local network...');
console.log('Press Ctrl+C to stop\n');

resolver.on('resolved', ({ name, type, address, ttl }) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${type} ${name} -> ${address} (TTL: ${ttl}s)`);
});

resolver.on('error', (err) => {
  console.error(`Error: ${err.message}`);
});

console.log('About to call start()...');
resolver.start();
console.log('Called start()');

console.log('Setting up SIGINT handler...');
// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\nStopping resolver...');
  resolver.stop();
  process.exit(0);
});
console.log('Setup complete');

// Add a simple check
setTimeout(() => {
  console.log('Still running after 2 seconds...');
}, 2000);
