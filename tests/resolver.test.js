const MDNSResolver = require('../src/resolver');

describe('MDNSResolver', () => {
  let resolver;

  beforeEach(() => {
    resolver = new MDNSResolver({
      timeout: 1000,
      ttl: 60,
      cacheSize: 100
    });
  });

  afterEach(async () => {
    if (resolver && resolver.mdns) {
      await resolver.stop();
    }
  });

  describe('Constructor', () => {
    test('should create resolver with default options', () => {
      const defaultResolver = new MDNSResolver();
      expect(defaultResolver.options.ttl).toBe(120);
      expect(defaultResolver.options.cacheSize).toBe(1000);
      expect(defaultResolver.options.timeout).toBe(5000);
    });

    test('should create resolver with custom options', () => {
      expect(resolver.options.ttl).toBe(60);
      expect(resolver.options.cacheSize).toBe(100);
      expect(resolver.options.timeout).toBe(1000);
    });

    test('should initialize with empty cache', () => {
      expect(resolver.getCacheSize()).toBe(0);
    });
  });

  describe('start() and stop()', () => {
    test('should start the resolver', (done) => {
      resolver.on('started', () => {
        expect(resolver.mdns).toBeTruthy();
        done();
      });
      resolver.start();
    });

    test('should throw error if starting twice', () => {
      resolver.start();
      expect(() => resolver.start()).toThrow('Resolver is already running');
    });

    test('should stop the resolver', (done) => {
      resolver.start();
      resolver.on('stopped', () => {
        expect(resolver.mdns).toBeNull();
        done();
      });
      resolver.stop();
    });
  });

  describe('resolve()', () => {
    test('should throw error if resolver not started', async () => {
      await expect(resolver.resolve('test.local')).rejects.toThrow(
        'Resolver is not running'
      );
    });

    test('should append .local to hostname if missing', () => {
      resolver.start();
      
      const querySpy = jest.spyOn(resolver.mdns, 'query');
      resolver.resolve('testhost').catch(() => {}); // Ignore timeout error
      
      expect(querySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          questions: [{
            name: 'testhost.local',
            type: 'A'
          }]
        })
      );
    });

    test('should not double append .local', () => {
      resolver.start();
      
      const querySpy = jest.spyOn(resolver.mdns, 'query');
      resolver.resolve('testhost.local').catch(() => {}); // Ignore timeout error
      
      expect(querySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          questions: [{
            name: 'testhost.local',
            type: 'A'
          }]
        })
      );
    });

    test('should emit query event', (done) => {
      resolver.start();
      
      resolver.on('query', ({ name, type }) => {
        expect(name).toBe('test.local');
        expect(type).toBe('A');
        done();
      });
      
      resolver.resolve('test.local').catch(() => {}); // Ignore timeout error
    });

    test('should timeout if no response received', async () => {
      resolver = new MDNSResolver({ timeout: 100 });
      resolver.start();
      
      await expect(resolver.resolve('nonexistent.local')).rejects.toThrow(
        'Timeout resolving nonexistent.local'
      );
    });

    test('should resolve from cache if available', async () => {
      resolver.start();
      
      // Manually populate cache
      const cacheKey = 'test.local:A';
      resolver.cache.set(cacheKey, {
        address: '192.168.1.100',
        expires: Date.now() + 60000
      });
      
      const address = await resolver.resolve('test.local', 'A');
      expect(address).toBe('192.168.1.100');
    });

    test('should emit cache-hit event when using cache', (done) => {
      resolver.start();
      
      // Manually populate cache
      const cacheKey = 'test.local:A';
      resolver.cache.set(cacheKey, {
        address: '192.168.1.100',
        expires: Date.now() + 60000
      });
      
      resolver.on('cache-hit', ({ name, type, address }) => {
        expect(name).toBe('test.local');
        expect(type).toBe('A');
        expect(address).toBe('192.168.1.100');
        done();
      });
      
      resolver.resolve('test.local', 'A');
    });

    test('should not use expired cache entries', async () => {
      resolver = new MDNSResolver({ timeout: 100 });
      resolver.start();
      
      // Manually populate cache with expired entry
      const cacheKey = 'test.local:A';
      resolver.cache.set(cacheKey, {
        address: '192.168.1.100',
        expires: Date.now() - 1000 // Expired
      });
      
      // Should not use cache and will timeout
      await expect(resolver.resolve('test.local', 'A')).rejects.toThrow();
    });
  });

  describe('_handleResponse()', () => {
    beforeEach(() => {
      resolver.start();
    });

    test('should handle A record response', (done) => {
      resolver.on('resolved', ({ name, type, address, ttl }) => {
        expect(name).toBe('test.local');
        expect(type).toBe('A');
        expect(address).toBe('192.168.1.100');
        expect(ttl).toBe(120);
        done();
      });

      resolver._handleResponse({
        answers: [{
          name: 'test.local',
          type: 'A',
          data: '192.168.1.100',
          ttl: 120
        }]
      });
    });

    test('should handle AAAA record response', (done) => {
      resolver.on('resolved', ({ name, type, address }) => {
        expect(name).toBe('test.local');
        expect(type).toBe('AAAA');
        expect(address).toBe('fe80::1');
        done();
      });

      resolver._handleResponse({
        answers: [{
          name: 'test.local',
          type: 'AAAA',
          data: 'fe80::1',
          ttl: 120
        }]
      });
    });

    test('should add response to cache', () => {
      resolver._handleResponse({
        answers: [{
          name: 'test.local',
          type: 'A',
          data: '192.168.1.100',
          ttl: 120
        }]
      });

      const cached = resolver.cache.get('test.local:A');
      expect(cached).toBeTruthy();
      expect(cached.address).toBe('192.168.1.100');
      expect(cached.expires).toBeGreaterThan(Date.now());
    });

    test('should resolve pending queries', (done) => {
      resolver.resolve('test.local', 'A').then((address) => {
        expect(address).toBe('192.168.1.100');
        done();
      });

      // Simulate mDNS response
      setTimeout(() => {
        resolver._handleResponse({
          answers: [{
            name: 'test.local',
            type: 'A',
            data: '192.168.1.100',
            ttl: 120
          }]
        });
      }, 50);
    });

    test('should ignore responses without answers', () => {
      const initialSize = resolver.getCacheSize();
      resolver._handleResponse({ answers: [] });
      expect(resolver.getCacheSize()).toBe(initialSize);
    });

    test('should ignore non-A/AAAA records', () => {
      const initialSize = resolver.getCacheSize();
      resolver._handleResponse({
        answers: [{
          name: 'test.local',
          type: 'TXT',
          data: 'some text',
          ttl: 120
        }]
      });
      expect(resolver.getCacheSize()).toBe(initialSize);
    });

    test('should limit cache size', () => {
      resolver = new MDNSResolver({ cacheSize: 2 });
      resolver.start();

      // Add 3 entries
      resolver._handleResponse({
        answers: [
          { name: 'test1.local', type: 'A', data: '192.168.1.1', ttl: 120 },
          { name: 'test2.local', type: 'A', data: '192.168.1.2', ttl: 120 },
          { name: 'test3.local', type: 'A', data: '192.168.1.3', ttl: 120 }
        ]
      });

      expect(resolver.getCacheSize()).toBe(2);
    });
  });

  describe('Cache management', () => {
    beforeEach(() => {
      resolver.start();
    });

    test('should clear cache', () => {
      resolver.cache.set('test.local:A', {
        address: '192.168.1.100',
        expires: Date.now() + 60000
      });

      resolver.clearCache();
      expect(resolver.getCacheSize()).toBe(0);
    });

    test('should emit cache-cleared event', (done) => {
      resolver.on('cache-cleared', () => {
        done();
      });
      resolver.clearCache();
    });

    test('should get cache contents', () => {
      resolver.cache.set('test.local:A', {
        address: '192.168.1.100',
        expires: Date.now() + 60000
      });

      const cache = resolver.getCache();
      expect(cache['test.local:A']).toBeTruthy();
      expect(cache['test.local:A'].address).toBe('192.168.1.100');
      expect(cache['test.local:A'].expiresIn).toBeGreaterThan(0);
    });
  });

  describe('Error handling', () => {
    test('should emit error events', (done) => {
      resolver.start();
      
      resolver.on('error', (err) => {
        expect(err).toBeTruthy();
        done();
      });

      // Trigger an error by emitting it from the mdns instance
      resolver.mdns.emit('error', new Error('Test error'));
    });

    test('should reject pending queries on stop', (done) => {
      resolver.start();
      
      resolver.resolve('test.local').catch((err) => {
        expect(err.message).toBe('Resolver stopped');
        done();
      });

      // Stop resolver before query completes
      setTimeout(() => resolver.stop(), 50);
    });
  });

  describe('Multiple queries', () => {
    beforeEach(() => {
      resolver.start();
    });

    test('should handle multiple simultaneous queries for same host', async () => {
      const promise1 = resolver.resolve('test.local');
      const promise2 = resolver.resolve('test.local');

      // Simulate response
      setTimeout(() => {
        resolver._handleResponse({
          answers: [{
            name: 'test.local',
            type: 'A',
            data: '192.168.1.100',
            ttl: 120
          }]
        });
      }, 50);

      const [addr1, addr2] = await Promise.all([promise1, promise2]);
      expect(addr1).toBe('192.168.1.100');
      expect(addr2).toBe('192.168.1.100');
    });

    test('should handle queries for different record types', (done) => {
      let resolvedCount = 0;

      resolver.on('resolved', () => {
        resolvedCount++;
        if (resolvedCount === 2) {
          done();
        }
      });

      resolver._handleResponse({
        answers: [
          { name: 'test.local', type: 'A', data: '192.168.1.100', ttl: 120 },
          { name: 'test.local', type: 'AAAA', data: 'fe80::1', ttl: 120 }
        ]
      });
    });
  });
});
