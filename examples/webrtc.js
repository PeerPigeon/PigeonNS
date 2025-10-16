/**
 * Example demonstrating how to use PigeonNS in a WebRTC application
 * to resolve mDNS ICE candidates
 */

const MDNSResolver = require('../index');

/**
 * Parse an ICE candidate string to extract the hostname and port
 */
function parseICECandidate(candidateString) {
  // Example candidate:
  // "candidate:842163049 1 udp 1686052607 abc123.local 54321 typ srflx raddr 0.0.0.0 rport 0"
  
  const parts = candidateString.split(' ');
  
  // Find the hostname (should end with .local for mDNS)
  const hostname = parts.find(part => part.endsWith('.local'));
  
  // Find the port (comes right after hostname in most cases)
  const hostnameIndex = parts.indexOf(hostname);
  const port = hostnameIndex >= 0 ? parts[hostnameIndex + 1] : null;
  
  return { hostname, port };
}

/**
 * Simulated WebRTC ICE candidate handler
 */
async function handleICECandidate(resolver, candidate) {
  console.log('\n--- New ICE Candidate ---');
  console.log('Raw candidate:', candidate);
  
  // Parse the candidate
  const { hostname, port } = parseICECandidate(candidate);
  
  if (hostname && hostname.endsWith('.local')) {
    console.log(`\nDetected mDNS hostname: ${hostname}`);
    
    try {
      // Resolve the mDNS hostname
      const ipAddress = await resolver.resolve(hostname);
      console.log(`✓ Resolved to: ${ipAddress}`);
      console.log(`Full address: ${ipAddress}:${port}`);
      
      // In a real application, you would:
      // 1. Replace the .local hostname with the IP in the candidate
      // 2. Send the modified candidate to the remote peer
      // 3. Or use the IP for your application logic
      
      return {
        originalHostname: hostname,
        resolvedIP: ipAddress,
        port: port,
        success: true
      };
    } catch (error) {
      console.error(`✗ Failed to resolve ${hostname}:`, error.message);
      return {
        originalHostname: hostname,
        error: error.message,
        success: false
      };
    }
  } else {
    console.log('Not an mDNS candidate (no .local hostname detected)');
    return { success: false, reason: 'Not mDNS' };
  }
}

/**
 * Main example
 */
async function webrtcExample() {
  console.log('=== WebRTC mDNS Resolution Example ===\n');
  
  // Create and start resolver
  const resolver = new MDNSResolver({ timeout: 3000 });
  resolver.start();
  console.log('Resolver started\n');
  
  // Example ICE candidates (these would come from RTCPeerConnection in a real app)
  const exampleCandidates = [
    // mDNS candidate (Chrome/Firefox format)
    'candidate:842163049 1 udp 1686052607 abc123-def456.local 54321 typ srflx raddr 0.0.0.0 rport 0',
    
    // Regular IP candidate (for comparison)
    'candidate:1234567890 1 udp 2122260223 192.168.1.100 52000 typ host',
    
    // Another mDNS candidate
    'candidate:987654321 1 udp 1686052607 xyz789.local 49152 typ host'
  ];
  
  console.log('Processing example ICE candidates...\n');
  
  // Process each candidate
  const results = [];
  for (const candidate of exampleCandidates) {
    const result = await handleICECandidate(resolver, candidate);
    results.push(result);
    
    // Wait a bit between candidates
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  // Summary
  console.log('\n=== Summary ===');
  console.log(`Total candidates processed: ${results.length}`);
  console.log(`mDNS candidates resolved: ${results.filter(r => r.success).length}`);
  console.log(`Failed resolutions: ${results.filter(r => r.success === false && r.error).length}`);
  
  // Cache info
  console.log(`\nCache entries: ${resolver.getCacheSize()}`);
  
  // Clean up
  resolver.stop();
  console.log('\nResolver stopped');
  
  setTimeout(() => process.exit(0), 1000);
}

// Run the example
console.log('Note: This example uses mock ICE candidates.');
console.log('In a real WebRTC application, these would come from RTCPeerConnection.');
console.log('The .local hostnames used here are examples and won\'t resolve unless');
console.log('devices with those names are actually on your local network.\n');

webrtcExample().catch(console.error);
