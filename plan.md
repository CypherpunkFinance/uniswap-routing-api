## Current State

The Uniswap routing-api repository deploys an API to AWS that uses @uniswap/smart-order-router to search for the most efficient way to swap token A for token B. The architecture is built around AWS services:

1. **AWS Lambda** - For serverless function execution
2. **API Gateway** - For HTTP endpoint routing
3. **DynamoDB** - For caching
4. **AWS CDK** - For infrastructure deployment

## Converting to Docker

While there isn't a ready-made Docker solution, you can create one by:

### 1. **Extract the Lambda Handler**
The routing API uses Lambda handlers that process HTTP requests. You'll need to wrap these handlers in an Express.js server for local deployment.

### 2. **Key Dependencies**
The core functionality relies on:
- `@uniswap/smart-order-router` - The main routing logic
- Environment variables for RPC providers for each chain
- DynamoDB (which you can replace with an in-memory cache or Redis)

### 3. **Required Environment Variables**
You'll need to set RPC providers for chains like MAINNET = 1, OPTIMISM = 10, ARBITRUM_ONE = 42161, POLYGON = 137, etc.

### 4. **Approach Options**

**Option A: Create an Express wrapper**
- Extract the Lambda handler functions from the routing-api
- Create an Express.js server that calls these handlers
- Replace DynamoDB with a local caching solution
- Package everything in a Dockerfile

**Option B: Use AWS Lambda Web Adapter**
AWS Lambda Adapters can help convert Lambda functions to run in containers with minimal changes. This approach would involve:
- Using the AWS Lambda Web Adapter to run the Lambda code locally
- Creating a Dockerfile that includes the adapter
- Running the container with proper environment variables

### 5. **Alternative: Use the Smart Order Router Directly**
If you only need the routing functionality and not the full API, you could:
- Use `@uniswap/smart-order-router` directly in your application
- Build a minimal Express API around it
- This would be simpler than converting the entire routing-api

## Recommendation

Since no one seems to have published a Docker version yet, I'd recommend:

1. **Start with the smart-order-router package directly** rather than trying to convert the entire AWS-based routing-api
2. Create a simple Express.js API that exposes the routing functionality
3. Containerize that simpler application

This would give you the core routing functionality without the complexity of converting all the AWS-specific code.

Would you like me to search for more specific information about implementing a solution using the smart-order-router directly, or would you prefer guidance on converting the Lambda functions to run locally?