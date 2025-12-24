// Jest setup file

// Mock environment variables for testing
process.env.SAFE_MODE = 'true';
process.env.MAX_TRADE_COST_USD = '200';
process.env.MAX_CONTRACTS_PER_LEG = '1';
process.env.MAX_SPREAD_PERCENT = '5';
process.env.LYRA_API_BASE_URL = 'https://api.lyra.finance';
process.env.ANTHROPIC_API_KEY = 'test-key';
process.env.LYRA_SESSION_PRIVATE_KEY = '0x' + '1'.repeat(64);
process.env.LYRA_WALLET_ADDRESS = '0x' + '2'.repeat(40);
process.env.LYRA_SUBACCOUNT_ID = '12345';

// Global fetch mock
global.fetch = jest.fn();

