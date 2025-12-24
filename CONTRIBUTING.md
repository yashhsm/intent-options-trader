# Contributing to Intent Options Trader

Thank you for your interest in contributing! This document provides guidelines and instructions for contributing to the project.

## Code of Conduct

By participating in this project, you agree to maintain a respectful and inclusive environment for all contributors.

## How to Contribute

### Reporting Bugs

1. Check if the bug has already been reported in [Issues](https://github.com/yashhsm/intent-options-trader/issues)
2. If not, create a new issue with:
   - A clear, descriptive title
   - Steps to reproduce the bug
   - Expected vs actual behavior
   - Environment details (OS, Node version, etc.)
   - Relevant logs or error messages

### Suggesting Features

1. Check existing [Issues](https://github.com/yashhsm/intent-options-trader/issues) to see if your idea has been discussed
2. Create a new issue with:
   - A clear description of the feature
   - Use cases and examples
   - Potential implementation approach (if you have ideas)

### Pull Requests

1. **Fork the repository** and create a new branch from `main`
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes**
   - Follow the existing code style
   - Add tests for new functionality
   - Update documentation as needed
   - Ensure all tests pass: `npm test`

3. **Commit your changes**
   - Use clear, descriptive commit messages
   - Follow conventional commits format when possible:
     - `feat:` for new features
     - `fix:` for bug fixes
     - `docs:` for documentation
     - `refactor:` for code refactoring
     - `test:` for tests
     - `chore:` for maintenance

4. **Push and create a Pull Request**
   - Push your branch to your fork
   - Create a PR with a clear title and description
   - Reference any related issues
   - Wait for review and address feedback

## Development Setup

1. **Fork and clone the repository**
   ```bash
   git clone https://github.com/YOUR_USERNAME/intent-options-trader.git
   cd intent-options-trader
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   - Copy `.env.example` to `.env.local` (if it exists)
   - Add your API keys (see README.md for details)

4. **Run the development server**
   ```bash
   npm run dev
   ```

5. **Run tests**
   ```bash
   npm test
   ```

## Code Style

- **TypeScript**: Use TypeScript for all new code
- **Formatting**: Follow existing code style (we use ESLint)
- **Naming**: Use descriptive names, follow existing conventions
- **Comments**: Add comments for complex logic, not obvious code

## Project Structure

```
lib/              # Core business logic
├── schemas.ts    # Zod schemas
├── agent-parser.ts  # Claude Agent integration
├── lyra-tools.ts    # Lyra API tools
├── lyra-client.ts   # Lyra API client
├── lyra-auth.ts     # Authentication & signing
├── safety.ts        # Safety checks
├── payoff.ts        # Payoff calculations
└── debug-logger.ts  # Debug logging

app/api/          # API routes
components/       # React components
```

## Testing

- Write tests for new features and bug fixes
- Aim for good test coverage
- Run tests before submitting PRs: `npm test`

## Areas for Contribution

We welcome contributions in these areas:

- **Bug fixes**: Any issues you encounter
- **Features**: New trading strategies, UI improvements, better error handling
- **Documentation**: Improving README, adding examples, code comments
- **Testing**: Adding test coverage, improving test utilities
- **Performance**: Optimizing API calls, reducing token usage
- **Security**: Security improvements, better error handling

## Questions?

Feel free to open an issue with the `question` label if you need help or clarification.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

