# PigeonNS

A local-only mDNS resolver for WebRTC and local network discovery.

## Overview

Modern browsers (Chrome, Firefox, and others) now obfuscate local IP addresses in WebRTC ICE candidates using mDNS (Multicast DNS) for privacy protection. Instead of exposing actual local IP addresses like `192.168.1.100`, browsers generate mDNS names like `abc123.local`.

PigeonNS provides a lightweight, easy-to-use mDNS resolver that translates these `.local` domain names back to IP addresses, enabling peer-to-peer connections in WebRTC applications.

## Features

- 🚀 Simple API for resolving `.local` domain names
- 💾 Built-in caching with configurable TTL
- 🔍 Support for both IPv4 (A) and IPv6 (AAAA) records
- 📡 Real-time mDNS monitoring
- 🛠️ CLI tool for testing and debugging
- ⚡ Event-driven architecture
- 🧪 Comprehensive test coverage

## Installation

```bash
npm install pigeonns
```

Or install globally for CLI usage:

```bash
npm install -g pigeonns
```

## Usage

### Programmatic API

```javascript
const MDNSResolver = require('pigeonns');

// Create a resolver instance
const resolver = new MDNSResolver({
  timeout: 5000,  // Query timeout in ms (default: 5000)
  ttl: 120,       // Cache TTL in seconds (default: 120)
  cacheSize: 1000 // Maximum cache entries (default: 1000)
});

// Start the resolver
resolver.start();

// Resolve a hostname
try {
  const ipv4Address = await resolver.resolve('abc123.local');
  console.log(`IPv4: ${ipv4Address}`);
  
  const ipv6Address = await resolver.resolve('abc123.local', 'AAAA');
  console.log(`IPv6: ${ipv6Address}`);
} catch (error) {
  console.error(`Failed to resolve: ${error.message}`);
}

// Stop when done
resolver.stop();
```

### Events

The resolver emits several events you can listen to:

```javascript
// Emitted when resolver starts
resolver.on('started', () => {
  console.log('Resolver started');
});

// Emitted when a query is sent
resolver.on('query', ({ name, type }) => {
  console.log(`Querying ${name} (${type})`);
});

// Emitted when a name is resolved
resolver.on('resolved', ({ name, type, address, ttl }) => {
  console.log(`Resolved ${name} -> ${address} (TTL: ${ttl}s)`);
});

// Emitted when cache is hit
resolver.on('cache-hit', ({ name, type, address }) => {
  console.log(`Cache hit: ${name} -> ${address}`);
});

// Emitted when cache is cleared
resolver.on('cache-cleared', () => {
  console.log('Cache cleared');
});

// Emitted on errors
resolver.on('error', (err) => {
  console.error('Error:', err);
});

// Emitted when resolver stops
resolver.on('stopped', () => {
  console.log('Resolver stopped');
});
```

### CLI Usage

Resolve a hostname:

```bash
pigeonns resolve abc123.local
```

Resolve with specific record type:

```bash
pigeonns resolve abc123.local --type AAAA
```

Monitor all mDNS traffic on your network:

```bash
pigeonns monitor
```

Set custom timeout:

```bash
pigeonns resolve abc123.local --timeout 10000
```

### Cache Management

```javascript
// Get current cache size
const size = resolver.getCacheSize();

// Get cache contents (for debugging)
const cache = resolver.getCache();
console.log(cache);
// {
//   'example.local:A': {
//     address: '192.168.1.100',
//     expiresIn: 115
//   }
// }

// Clear the cache
resolver.clearCache();
```

## WebRTC Integration Example

```javascript
const MDNSResolver = require('pigeonns');

// Create resolver
const resolver = new MDNSResolver();
resolver.start();

// Handle ICE candidates in your WebRTC application
peerConnection.onicecandidate = async (event) => {
  if (event.candidate) {
    const candidate = event.candidate.candidate;
    
    // Check if this is an mDNS candidate
    const mdnsMatch = candidate.match(/([a-f0-9-]+\.local)/);
    
    if (mdnsMatch) {
      const hostname = mdnsMatch[1];
      
      try {
        // Resolve the mDNS name
        const ipAddress = await resolver.resolve(hostname);
        console.log(`Resolved ICE candidate: ${hostname} -> ${ipAddress}`);
        
        // Now you can use the resolved IP address
        // for your application logic
      } catch (error) {
        console.error(`Failed to resolve ${hostname}:`, error);
      }
    }
    
    // Send candidate to remote peer
    sendToRemotePeer(event.candidate);
  }
};

// Clean up when done
window.addEventListener('beforeunload', () => {
  resolver.stop();
});
```

## API Reference

### Constructor

```javascript
new MDNSResolver(options)
```

**Options:**
- `timeout` (number): Query timeout in milliseconds. Default: 5000
- `ttl` (number): Cache TTL in seconds. Default: 120
- `cacheSize` (number): Maximum number of cache entries. Default: 1000

### Methods

#### `start()`
Start the mDNS resolver. Must be called before resolving names.

#### `stop()`
Stop the mDNS resolver and clean up resources.

#### `resolve(name, type = 'A')`
Resolve a `.local` domain name to an IP address.

**Parameters:**
- `name` (string): The hostname to resolve (e.g., "abc123.local")
- `type` (string): Record type - 'A' for IPv4 or 'AAAA' for IPv6. Default: 'A'

**Returns:** Promise<string> - The resolved IP address

**Throws:** Error if resolver is not started or resolution times out

#### `clearCache()`
Clear all cached entries.

#### `getCacheSize()`
Get the current number of cached entries.

**Returns:** number

#### `getCache()`
Get the cache contents for debugging.

**Returns:** Object with cache entries

## How mDNS Works

mDNS (Multicast DNS) operates on the local network using:
- **Multicast address:** 224.0.0.251 (IPv4) or ff02::fb (IPv6)
- **Port:** 5353
- **Protocol:** UDP

When a device needs to resolve a `.local` name:
1. It sends a multicast query to all devices on the local network
2. The device with that hostname responds with its IP address
3. Other devices can cache this response for future use

PigeonNS listens for these multicast responses and maintains a cache of hostname-to-IP mappings.

## Security Considerations

- PigeonNS only operates on the local network and does not make any external requests
- mDNS responses are not authenticated - any device on the local network can respond
- Use PigeonNS only in trusted network environments
- Consider implementing additional verification if security is critical

## Browser Compatibility

Modern browsers that use mDNS for WebRTC ICE candidates:
- ✅ Chrome 70+
- ✅ Firefox 70+
- ✅ Edge (Chromium-based)
- ✅ Safari (various versions)

## Troubleshooting

### "Timeout resolving hostname"

This usually means:
- The device with that hostname is not on the network
- The device is not responding to mDNS queries
- Firewall is blocking mDNS traffic (port 5353 UDP)
- The hostname doesn't exist

### "Resolver is not running"

Make sure to call `resolver.start()` before calling `resolve()`.

### "EADDRINUSE" or socket errors

Another mDNS service might be using port 5353. Make sure you're not running multiple mDNS resolvers simultaneously.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

ISC

## Related Resources

- [mDNS and Local ICE Candidates in WebRTC](https://bloggeek.me/psa-mdns-and-local-ice-candidates-are-coming/)
- [RFC 6762 - Multicast DNS](https://tools.ietf.org/html/rfc6762)
- [WebRTC ICE Candidate Privacy](https://datatracker.ietf.org/doc/html/draft-ietf-rtcweb-mdns-ice-candidates)
 
A local-only mDNS name server 
