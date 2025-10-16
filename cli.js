#!/usr/bin/env node

const MDNSResolver = require('./index');

const args = process.argv.slice(2);

function printUsage() {
  console.log(`
PigeonNS - Local mDNS Resolver

Usage:
  pigeonns resolve <hostname>           Resolve a .local hostname
  pigeonns monitor                      Monitor all mDNS traffic
  pigeonns --help                       Show this help message

Options:
  --type <A|AAAA>                       Record type (default: A)
  --timeout <ms>                        Query timeout in milliseconds (default: 5000)
  --ttl <seconds>                       Cache TTL in seconds (default: 120)

Examples:
  pigeonns resolve abc123.local
  pigeonns resolve abc123 --type AAAA
  pigeonns monitor
  `);
}

async function resolveHostname(hostname, options) {
  const resolver = new MDNSResolver({
    timeout: options.timeout || 5000,
    ttl: options.ttl || 120
  });

  console.log(`Starting resolver...`);
  resolver.start();

  try {
    console.log(`Querying ${hostname}...`);
    const address = await resolver.resolve(hostname, options.type || 'A');
    console.log(`✓ Resolved: ${hostname} -> ${address}`);
    process.exit(0);
  } catch (error) {
    console.error(`✗ Error: ${error.message}`);
    process.exit(1);
  } finally {
    resolver.stop();
  }
}

function monitor() {
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

  resolver.start();

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\nStopping resolver...');
    resolver.stop();
    process.exit(0);
  });
}

function parseArgs(args) {
  const command = args[0];
  const options = {};
  let hostname = null;

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--type') {
      options.type = args[++i];
    } else if (arg === '--timeout') {
      options.timeout = parseInt(args[++i], 10);
    } else if (arg === '--ttl') {
      options.ttl = parseInt(args[++i], 10);
    } else if (!hostname) {
      hostname = arg;
    }
  }

  return { command, hostname, options };
}

// Main execution
if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
  printUsage();
  process.exit(0);
}

const { command, hostname, options } = parseArgs(args);

if (command === 'resolve') {
  if (!hostname) {
    console.error('Error: hostname is required for resolve command');
    printUsage();
    process.exit(1);
  }
  resolveHostname(hostname, options);
} else if (command === 'monitor') {
  monitor();
} else {
  console.error(`Error: Unknown command '${command}'`);
  printUsage();
  process.exit(1);
}
