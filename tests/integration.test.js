/**
 * Integration tests for the mDNS resolver
 * These tests simulate real-world scenarios
 */

const MDNSResolver = require('../src/resolver');

describe('MDNSResolver Integration', () => {
  let resolver;

  beforeEach(() => {
    resolver = new MDNSResolver({
      timeout: 2000,
      ttl: 60
    });
  });

  afterEach(() => {
    if (resolver.mdns) {
      resolver.stop();
    }
  });

  describe('End-to-end resolution flow', () => {
    test('should complete full resolution cycle', (done) => {
      const hostname = 'integration-test.local';
      const expectedIP = '192.168.1.123';
      
      resolver.start();

      // Track events
      let queryEmitted = false;
      let resolvedEmitted = false;

      resolver.on('query', ({ name }) => {
        expect(name).toBe(hostname);
        queryEmitted = true;
      });

      resolver.on('resolved', ({ name, address }) => {
        expect(name).toBe(hostname);
        expect(address).toBe(expectedIP);
        resolvedEmitted = true;
      });

      // Start resolution
      const resolutionPromise = resolver.resolve(hostname);

      // Simulate mDNS response
      setTimeout(() => {
        resolver._handleResponse({
          answers: [{
            name: hostname,
            type: 'A',
            data: expectedIP,
            ttl: 60
          }]
        });
      }, 100);

      // Verify resolution
      resolutionPromise.then((address) => {
        expect(address).toBe(expectedIP);
        expect(queryEmitted).toBe(true);
        expect(resolvedEmitted).toBe(true);
        
        // Verify it's in cache
        expect(resolver.getCacheSize()).toBe(1);
        
        done();
      }).catch(done);
    });

    test('should handle cache hit on second resolution', async () => {
      const hostname = 'cache-test.local';
      const expectedIP = '192.168.1.234';
      
      resolver.start();

      let cacheHits = 0;
      resolver.on('cache-hit', () => {
        cacheHits++;
      });

      // First resolution
      const firstPromise = resolver.resolve(hostname);
      
      setTimeout(() => {
        resolver._handleResponse({
          answers: [{
            name: hostname,
            type: 'A',
            data: expectedIP,
            ttl: 60
          }]
        });
      }, 50);

      const firstResult = await firstPromise;
      expect(firstResult).toBe(expectedIP);
      expect(cacheHits).toBe(0);

      // Second resolution (should hit cache)
      const secondResult = await resolver.resolve(hostname);
      expect(secondResult).toBe(expectedIP);
      expect(cacheHits).toBe(1);
    });

    test('should handle multiple concurrent resolutions', async () => {
      const hostnames = [
        'host1.local',
        'host2.local',
        'host3.local'
      ];
      
      const ips = [
        '192.168.1.101',
        '192.168.1.102',
        '192.168.1.103'
      ];

      resolver.start();

      // Start all resolutions
      const promises = hostnames.map(host => resolver.resolve(host));

      // Simulate responses
      setTimeout(() => {
        hostnames.forEach((hostname, index) => {
          resolver._handleResponse({
            answers: [{
              name: hostname,
              type: 'A',
              data: ips[index],
              ttl: 60
            }]
          });
        });
      }, 100);

      // Wait for all resolutions
      const results = await Promise.all(promises);

      // Verify all resolved correctly
      results.forEach((result, index) => {
        expect(result).toBe(ips[index]);
      });

      // Verify cache
      expect(resolver.getCacheSize()).toBe(3);
    });
  });

  describe('Real-world mDNS patterns', () => {
    test('should handle multiple A records in single response', (done) => {
      resolver.start();

      let resolvedCount = 0;
      resolver.on('resolved', () => {
        resolvedCount++;
        if (resolvedCount === 3) {
          expect(resolver.getCacheSize()).toBe(3);
          done();
        }
      });

      resolver._handleResponse({
        answers: [
          { name: 'device1.local', type: 'A', data: '192.168.1.10', ttl: 120 },
          { name: 'device2.local', type: 'A', data: '192.168.1.11', ttl: 120 },
          { name: 'device3.local', type: 'A', data: '192.168.1.12', ttl: 120 }
        ]
      });
    });

    test('should handle both A and AAAA records', async () => {
      const hostname = 'dual-stack.local';
      resolver.start();

      // Add both IPv4 and IPv6 records
      resolver._handleResponse({
        answers: [
          { name: hostname, type: 'A', data: '192.168.1.50', ttl: 120 },
          { name: hostname, type: 'AAAA', data: 'fe80::1234', ttl: 120 }
        ]
      });

      // Both should be in cache
      expect(resolver.getCacheSize()).toBe(2);

      // Both should be retrievable
      const ipv4 = await resolver.resolve(hostname, 'A');
      const ipv6 = await resolver.resolve(hostname, 'AAAA');

      expect(ipv4).toBe('192.168.1.50');
      expect(ipv6).toBe('fe80::1234');
    });

    test('should handle TTL expiration correctly', async () => {
      // Create resolver with very short TTL for testing
      resolver = new MDNSResolver({ timeout: 1000, ttl: 1 });
      resolver.start();

      const hostname = 'ttl-test.local';
      const ip = '192.168.1.99';

      // Add to cache
      resolver._handleResponse({
        answers: [{ name: hostname, type: 'A', data: ip, ttl: 1 }]
      });

      // Should be in cache
      let result = await resolver.resolve(hostname);
      expect(result).toBe(ip);

      // Wait for TTL to expire
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Should not hit cache anymore
      let cacheHit = false;
      resolver.on('cache-hit', () => {
        cacheHit = true;
      });

      // This will timeout since no new response is provided
      try {
        await resolver.resolve(hostname);
        // Shouldn't reach here
        expect(true).toBe(false);
      } catch (error) {
        // Expected to timeout
        expect(error.message).toContain('Timeout');
        expect(cacheHit).toBe(false);
      }
    });

    test('should gracefully handle malformed responses', () => {
      resolver.start();
      const initialSize = resolver.getCacheSize();

      // Response with no answers
      resolver._handleResponse({});

      // Response with null answers
      resolver._handleResponse({ answers: null });

      // Response with empty answers
      resolver._handleResponse({ answers: [] });

      // Cache should be unchanged
      expect(resolver.getCacheSize()).toBe(initialSize);
    });
  });

  describe('Error scenarios', () => {
    test('should handle network errors gracefully', (done) => {
      resolver.start();
      
      resolver.on('error', (err) => {
        expect(err).toBeTruthy();
        done();
      });

      // Simulate network error
      resolver.mdns.emit('error', new Error('Network error'));
    });

    test('should clean up on stop', async () => {
      resolver.start();

      // Add some cache entries
      resolver._handleResponse({
        answers: [
          { name: 'test1.local', type: 'A', data: '192.168.1.1', ttl: 120 },
          { name: 'test2.local', type: 'A', data: '192.168.1.2', ttl: 120 }
        ]
      });

      expect(resolver.getCacheSize()).toBe(2);
      expect(resolver.mdns).toBeTruthy();

      // Start a pending query
      const queryPromise = resolver.resolve('pending.local');

      // Stop resolver
      resolver.stop();

      // mdns should be null
      expect(resolver.mdns).toBeNull();

      // Pending query should reject
      await expect(queryPromise).rejects.toThrow('Resolver stopped');
    });
  });
});
