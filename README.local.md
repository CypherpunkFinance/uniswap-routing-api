# Local Uniswap Routing API

This is a converted version of the Uniswap routing API that runs as a local Node.js Express server with SQLite instead of AWS services.

## Features

- ✅ **Express Server** - Replaces AWS Lambda + API Gateway
- ✅ **SQLite Database** - Replaces DynamoDB for caching
- ✅ **Local Development** - No AWS dependencies required
- ✅ **Full Routing Support** - All Uniswap V2, V3, and V4 protocols
- ✅ **Multi-chain Support** - Ethereum, Polygon, Arbitrum, Optimism, Base, and more
- ✅ **Caching** - Intelligent route and pool caching for performance

## Prerequisites

- Node.js 16+ and npm
- RPC endpoints for the chains you want to support (Alchemy, Infura, QuickNode, etc.)

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Copy the example configuration:

```bash
cp config.env.example .env
```

Edit `.env` and add your RPC endpoints. **At minimum, you need:**

```env
# Required: Ethereum Mainnet RPC
WEB3_RPC_1=https://eth-mainnet.alchemyapi.io/v2/YOUR_API_KEY

# Optional: Other chains
WEB3_RPC_137=https://polygon-mainnet.g.alchemy.com/v2/YOUR_API_KEY
WEB3_RPC_42161=https://arb-mainnet.g.alchemy.com/v2/YOUR_API_KEY
WEB3_RPC_10=https://opt-mainnet.g.alchemy.com/v2/YOUR_API_KEY
WEB3_RPC_8453=https://base-mainnet.g.alchemy.com/v2/YOUR_API_KEY
```

### 3. Build and Start

```bash
npm run build
npm start
```

Or for development with auto-rebuild:

```bash
npm run dev
```

The server will start on `http://localhost:3000`

## API Usage

### Health Check

```bash
curl http://localhost:3000/health
```

### Get Quote

```bash
curl "http://localhost:3000/quote?tokenInAddress=0xA0b86a33E6417058256Ce9DEd69BcF4C8C02AA9B&tokenOutAddress=0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174&amount=1000000000000000000&type=exactIn&chainId=1"
```

#### Required Parameters

- `tokenInAddress` - Address of input token
- `tokenOutAddress` - Address of output token  
- `amount` - Amount in token's smallest unit (wei for ETH)
- `type` - Either `exactIn` or `exactOut`

#### Optional Parameters

- `chainId` - Chain ID (defaults to 1 for Ethereum)
- `recipient` - Recipient address for the swap
- `slippageTolerance` - Slippage tolerance (e.g., `0.5` for 0.5%)
- `deadline` - Transaction deadline timestamp
- `protocols` - Comma-separated list: `v2,v3,v4,mixed`

### Example: USDC to ETH on Ethereum

```bash
curl "http://localhost:3000/quote?\
tokenInAddress=0xA0b86a33E6417058256Ce9DEd69BcF4C8C02AA9B&\
tokenOutAddress=0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174&\
amount=1000000&\
type=exactIn&\
chainId=1&\
slippageTolerance=0.5"
```

### Example: ETH to USDC on Polygon

```bash
curl "http://localhost:3000/quote?\
tokenInAddress=0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619&\
tokenOutAddress=0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174&\
amount=1000000000000000000&\
type=exactIn&\
chainId=137"
```

## Supported Chains

| Chain | Chain ID | Status |
|-------|----------|--------|
| Ethereum | 1 | ✅ Full Support |
| Polygon | 137 | ✅ Full Support |  
| Arbitrum One | 42161 | ✅ Full Support |
| Optimism | 10 | ✅ Full Support |
| Base | 8453 | ✅ Full Support |
| BNB Chain | 56 | ✅ V2/V3 Support |
| Avalanche | 43114 | ✅ V2/V3 Support |
| Celo | 42220 | ✅ V2/V3 Support |
| Blast | 81457 | ✅ V3 Support |
| zkSync Era | 324 | ✅ V3 Support |

## Configuration

### Database

The SQLite database is stored at `./routing-api.db` by default. You can change this:

```env
DATABASE_PATH=/path/to/your/database.db
```

### Performance Tuning

```env
# Cache TTL (seconds)
CACHE_TTL_SECONDS=300
POOL_CACHE_TTL_SECONDS=900
TOKEN_CACHE_TTL_SECONDS=3600

# Route limits
MAX_ROUTES=3
MAX_SPLIT_HOPS=3
MAX_SWAPS_PER_PATH=3
```

### Logging

```env
LOG_LEVEL=info  # debug, info, warn, error
```

## Development

### Project Structure

```
├── server.ts                           # Express server (entry point)
├── lib/
│   ├── database/
│   │   └── sqlite-database.ts          # SQLite adapter
│   ├── handlers/
│   │   ├── local-injector-sor.ts      # Local dependency injection
│   │   ├── quote/
│   │   │   ├── local-injector.ts       # Local quote handler injector
│   │   │   └── quote.ts                # Quote handler (unchanged)
│   │   └── router-entities/
│   │       └── local-cache-provider.ts # SQLite caching providers
│   └── util/                           # Utility functions
└── config.env.example                  # Configuration template
```

### Adding New Chains

1. Add RPC endpoint to `.env`:
   ```env
   WEB3_RPC_<CHAIN_ID>=https://your-rpc-endpoint
   ```

2. Add chain ID to `SUPPORTED_CHAINS` in `lib/handlers/local-injector-sor.ts`

3. Update chain-specific configurations if needed

### Testing

```bash
# Unit tests
npm run test:unit

# Integration tests (requires RPC endpoints)
npm run test:integ
```

## Differences from AWS Version

| Feature | AWS Version | Local Version |
|---------|-------------|---------------|
| **Compute** | Lambda | Express.js |
| **Database** | DynamoDB | SQLite |
| **Metrics** | CloudWatch | Local logging |
| **Scaling** | Auto-scaling | Single instance |
| **Caching** | DynamoDB + S3 | SQLite + Memory |
| **Deployment** | CDK | Manual |

## Performance Notes

- **First request** may be slow as pools/tokens are fetched and cached
- **Subsequent requests** should be much faster due to caching
- **Cache cleanup** runs automatically every hour
- **Database size** grows with usage but is cleaned up regularly

## Troubleshooting

### "No route found" Error

- Check that both tokens exist on the specified chain
- Ensure the amount is not too small or too large
- Verify RPC endpoint is working
- Try a different token pair to test

### High Memory Usage

- Reduce cache TTL values in configuration
- Limit supported chains to only what you need
- Monitor SQLite database size

### Slow Performance

- Check your RPC endpoint latency
- Increase cache TTL values
- Consider using paid RPC providers (Alchemy, Infura, QuickNode)

## Docker (Optional)

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

```bash
docker build -t uniswap-routing-api .
docker run -p 3000:3000 --env-file .env uniswap-routing-api
```

## License

GPL-3.0 (same as original Uniswap routing API)

## Support

This is a community conversion of the official Uniswap routing API. For issues:

1. Check that your RPC endpoints are working
2. Verify your configuration matches the examples
3. Check the logs for detailed error messages
4. Test with simple token pairs first (ETH/USDC)

For the original AWS version, see: https://github.com/Uniswap/routing-api 