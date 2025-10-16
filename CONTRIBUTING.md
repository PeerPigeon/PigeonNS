# Contributing to PigeonNS

Thank you for your interest in contributing to PigeonNS! This document provides guidelines and instructions for contributing.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/PigeonNS.git`
3. Install dependencies: `npm install`
4. Create a new branch: `git checkout -b feature/your-feature-name`

## Development

### Running Tests

```bash
npm test
```

### Running Examples

```bash
# Basic usage example
node examples/basic.js

# WebRTC integration example
node examples/webrtc.js
```

### Using the CLI

```bash
# Resolve a hostname
node cli.js resolve your-device.local

# Monitor mDNS traffic
node cli.js monitor
```

## Code Style

- Use 2 spaces for indentation
- Use meaningful variable and function names
- Add comments for complex logic
- Follow existing code patterns

## Testing

- Write tests for new features
- Ensure all tests pass before submitting a PR
- Aim for high test coverage
- Test both success and error cases

## Pull Request Process

1. Update the README.md with details of changes if applicable
2. Update the CHANGELOG if we have one
3. Add tests for your changes
4. Ensure all tests pass
5. Update documentation as needed
6. Submit your pull request with a clear description

## Bug Reports

When reporting bugs, please include:

- Your operating system and version
- Node.js version
- Steps to reproduce the issue
- Expected behavior
- Actual behavior
- Any error messages or logs

## Feature Requests

We welcome feature requests! Please:

- Check if the feature has already been requested
- Clearly describe the feature and its use case
- Explain why this feature would be useful
- Provide examples if possible

## Code of Conduct

- Be respectful and inclusive
- Focus on constructive feedback
- Help others learn and grow
- Assume good intentions

## Questions?

If you have questions, feel free to:

- Open an issue
- Start a discussion
- Contact the maintainers

Thank you for contributing to PigeonNS!
