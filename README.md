# Uniswap Routing API - Local Fork

A local development fork of the Uniswap V3/V4 routing API that runs as a standalone Express.js server. This API uses `@uniswap/smart-order-router` to find the most efficient routes for token swaps across multiple protocols and chains.

## Features

- 🚀 **Local Development Server** - Run the routing API locally without any cloud dependencies
- 🔗 **Multi-chain Support** - Support for Ethereum, Polygon, Optimism, Arbitrum, Base, and more
- 🔄 **Smart Order Routing** - Uses Uniswap's smart-order-router for optimal swap routes
- 💾 **SQLite Caching** - Local SQLite database for route caching and performance
- 🛡️ **Error Handling** - Comprehensive error handling and logging
- 📊 **Health Monitoring** - Built-in health check endpoints

## Quick Start

### Prerequisites

- Node.js 16+ 
- npm or yarn
- RPC access to supported blockchain networks

### Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd uniswap-routing-api
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create environment configuration:
   ```bash
   cp config.env.example .env
   ```

4. Configure your `.env` file with RPC endpoints:
   ```bash
   # Required: At least one RPC endpoint
   WEB3_RPC_1=https://eth-mainnet.alchemyapi.io/v2/your-api-key
   WEB3_RPC_137=https://polygon-mainnet.g.alchemy.com/v2/your-api-key
   
   # Optional: Server configuration
   PORT=3000
   DATABASE_PATH=./routing-api.db
   ```

5. Build and start the server:
   ```bash
   npm run build
   npm start
   ```

   Or for development with auto-rebuild:
   ```bash
   npm run dev
   ```

The server will start on `http://localhost:3000`

## API Endpoints

### Health Check
```
GET /health
```

Returns server status and version information.

**Example Response:**
```json
{
  "status": "ok",
  "timestamp": "2023-12-01T10:00:00.000Z",
  "version": "1.0.0"
}
```

### Get Quote
```
GET /quote
```

Get the best route and quote for a token swap.

**Required Parameters:**
- `tokenInAddress` - Contract address of the input token
- `tokenOutAddress` - Contract address of the output token  
- `amount` - Amount in smallest unit (e.g., wei for ETH)
- `type` - Either `exactIn` or `exactOut`

**Optional Parameters:**
- `tokenInChainId` - Chain ID for input token (default: 1)
- `tokenOutChainId` - Chain ID for output token (default: 1)
- `recipient` - Address to receive the output tokens
- `slippageTolerance` - Slippage tolerance in basis points (default: 50 = 0.5%)
- `deadline` - Transaction deadline in seconds from now (default: 1800 = 30 min)

**Example Request:**
```bash
curl "http://localhost:3000/quote?tokenInAddress=0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2&tokenOutAddress=0x6B175474E89094C44Da98b954EedeAC495271d0F&amount=1000000000000000000&type=exactIn&tokenInChainId=1&tokenOutChainId=1&slippageTolerance=50"
```

**Example Response:**
```json
{
  "quoteId": "abc123",
  "amount": "1000000000000000000",
  "quote": "2950000000000000000000",
  "quoteGasAdjusted": "2940000000000000000000",
  "gasUseEstimate": "150000",
  "gasUseEstimateUSD": "12.50",
  "methodParameters": {
    "calldata": "0x...",
    "value": "0x00",
    "to": "0x..."
  },
  "route": [...],
  "hitsCachedRoutes": false
}
```

## Environment Configuration

### Required Variables

**RPC Endpoints** - At least one is required:
```bash
WEB3_RPC_1=<ethereum-mainnet-rpc>        # Ethereum
WEB3_RPC_137=<polygon-rpc>               # Polygon
WEB3_RPC_10=<optimism-rpc>               # Optimism
WEB3_RPC_42161=<arbitrum-rpc>            # Arbitrum One
WEB3_RPC_8453=<base-rpc>                 # Base
WEB3_RPC_56=<bsc-rpc>                    # BNB Smart Chain
WEB3_RPC_43114=<avalanche-rpc>           # Avalanche
WEB3_RPC_42220=<celo-rpc>                # Celo
```

### Optional Variables

**Server Configuration:**
```bash
PORT=3000                                # Server port
DATABASE_PATH=./routing-api.db           # SQLite database path
NODE_ENV=development                     # Environment mode
```

**External Services:**
```bash
GQL_URL=https://api.uniswap.org/v1/graphql  # Uniswap GraphQL API
TENDERLY_USER=<user>                        # Tenderly simulation
TENDERLY_PROJECT=<project>                  # Tenderly simulation
TENDERLY_ACCESS_KEY=<key>                   # Tenderly simulation
```

## Supported Chains

| Network | Chain ID | Environment Variable |
|---------|----------|---------------------|
| Ethereum Mainnet | 1 | `WEB3_RPC_1` |
| Ethereum Sepolia | 11155111 | `WEB3_RPC_11155111` |
| Polygon | 137 | `WEB3_RPC_137` |
| Optimism | 10 | `WEB3_RPC_10` |
| Arbitrum One | 42161 | `WEB3_RPC_42161` |
| Base | 8453 | `WEB3_RPC_8453` |
| BNB Smart Chain | 56 | `WEB3_RPC_56` |
| Avalanche | 43114 | `WEB3_RPC_43114` |
| Celo | 42220 | `WEB3_RPC_42220` |

## Development

### Scripts

```bash
npm run build         # Build the project
npm start            # Start the server
npm run dev          # Build and start with auto-reload
npm run watch        # Watch for changes and rebuild
npm run clean        # Clean build directory
```

### Testing

```bash
npm run test:unit     # Run unit tests
npm run test:integ    # Run integration tests
npm run test:e2e      # Run end-to-end tests
```

### Code Quality

```bash
npm run fix           # Fix linting and formatting issues
npm run fix:prettier  # Fix formatting with Prettier
npm run fix:lint      # Fix linting with ESLint
```

## Architecture

- **Express.js Server** - RESTful API server with CORS support
- **SQLite Database** - Local caching for routes and token data
- **Smart Order Router** - Uniswap's routing algorithm for optimal paths
- **Multi-chain Support** - Configurable RPC providers for different networks

## Error Handling

The API returns structured error responses:

```json
{
  "errorCode": "QUOTE_ERROR",
  "detail": "No route found for the given parameters"
}
```

Common error codes:
- `QUOTE_ERROR` - Quote generation failed
- `INTERNAL_ERROR` - Server error
- `NOT_FOUND` - Endpoint not found

## Performance

- **Route Caching** - Routes are cached in SQLite for faster responses
- **Connection Pooling** - Efficient RPC connection management
- **Gas Optimization** - Smart gas estimation and optimization

## Common Token Addresses

### Ethereum Mainnet
- **WETH**: `0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2`
- **USDC**: `0xA0b86a33E6417058256Ce9DEd69BcF4C8C02AA9B`
- **USDT**: `0xdAC17F958D2ee523a2206206994597C13D831ec7`
- **DAI**: `0x6B175474E89094C44Da98b954EedeAC495271d0F`
- **UNI**: `0x1f9840a85d5af5bf1d1762f925bdaddc4201f984`

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Run `npm run fix` to ensure code quality
6. Submit a pull request

## License

GPL - See LICENSE file for details
