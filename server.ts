import express, { Request, Response } from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import bunyan from 'bunyan'
import { QuoteHandler } from './lib/handlers/quote/quote'
import { SQLiteDatabase } from './lib/database/sqlite-database'
import { LocalQuoteHandlerInjector } from './lib/handlers/quote/local-injector'

// Load environment variables
dotenv.config()

const app = express()
const port = process.env.PORT || 3000

// Configure logging
const log = bunyan.createLogger({
  name: 'RoutingAPI',
  serializers: bunyan.stdSerializers,
  level: bunyan.INFO,
})

// Middleware
app.use(cors())
app.use(express.json())

// Initialize database
const database = new SQLiteDatabase()

// Initialize quote handler
let quoteHandler: QuoteHandler
async function initializeHandlers() {
  try {
    const quoteInjectorPromise = new LocalQuoteHandlerInjector('localQuoteInjector', database).build()
    quoteHandler = new QuoteHandler('quote', quoteInjectorPromise)
    log.info('Quote handler initialized successfully')
  } catch (error) {
    log.fatal({ error }, 'Fatal error initializing handlers')
    throw error
  }
}

// Simple metrics implementation for local development
class LocalMetricsLogger {
  putMetric(name: string, value: number, unit?: string): void {
    log.info({ metric: name, value, unit }, 'Metric logged')
  }

  putDimensions(dimensions: Record<string, string>): void {
    log.info({ dimensions }, 'Dimensions set')
  }

  setProperty(key: string, value: unknown): void {
    log.info({ property: key, value }, 'Property set')
  }

  flush(): void {
    // No-op for local development
  }
}

// Convert Express request to Lambda-like event format
function convertRequestToEvent(req: Request): any {
  return {
    httpMethod: req.method,
    path: req.path,
    pathParameters: req.params,
    queryStringParameters: req.query,
    headers: req.headers,
    body: req.body ? JSON.stringify(req.body) : null,
    requestContext: {
      requestId: generateRequestId(),
      requestTime: new Date().toISOString(),
      httpMethod: req.method,
    },
  }
}

// Convert Express request to Lambda-like context format
function convertRequestToContext(req: Request): any {
  return {
    awsRequestId: generateRequestId(),
    functionName: 'routing-api-local',
    getRemainingTimeInMillis: () => 30000, // 30 seconds
    logGroupName: '/aws/lambda/routing-api-local',
    logStreamName: `${new Date().toISOString().split('T')[0]}/[LATEST]${generateRequestId()}`,
  }
}

function generateRequestId(): string {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
}

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0'
  })
})

// Quote endpoint
app.get('/quote', async (req: Request, res: Response) => {
  try {
    const event = convertRequestToEvent(req)
    const context = convertRequestToContext(req)

    // Call the Lambda handler
    const result = await quoteHandler.handler(event, context)

    // Parse the result
    const parsedResult = JSON.parse(result.body)

    // Set status code and return response
    res.status(result.statusCode).json(parsedResult)
  } catch (error) {
    log.error({ error, req: req.query }, 'Error processing quote request')
    res.status(500).json({
      errorCode: 'INTERNAL_ERROR',
      detail: 'Unexpected error',
    })
  }
})

// Error handling middleware
app.use((error: any, req: Request, res: Response, next: any) => {
  log.error({ error, req: req.path }, 'Unhandled error')
  res.status(500).json({
    errorCode: 'INTERNAL_ERROR',
    detail: 'Unexpected error',
  })
})

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    errorCode: 'NOT_FOUND',
    detail: 'Endpoint not found',
  })
})

// Cleanup expired cache entries every hour
setInterval(async () => {
  try {
    await database.cleanup()
    log.info('Database cleanup completed')
  } catch (error) {
    log.error({ error }, 'Error during database cleanup')
  }
}, 60 * 60 * 1000) // 1 hour

// Start server
async function startServer() {
  try {
    await database.initialize()
    await initializeHandlers()

    app.listen(port, () => {
      log.info(`🚀 Routing API server running on port ${port}`)
      log.info('📋 Available endpoints:')
      log.info(`   GET /health - Health check`)
      log.info(`   GET /quote - Get swap quote`)
      log.info('🔧 Example quote request:')
      log.info(`   GET /quote?tokenInAddress=0xA0b86a33E6417058256Ce9DEd69BcF4C8C02AA9B&tokenOutAddress=0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174&amount=100000000&type=exactIn&chainId=1`)
    })
  } catch (error) {
    log.fatal({ error }, 'Failed to start server')
    process.exit(1)
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  log.info('Received SIGTERM, shutting down gracefully')
  await database.close()
  process.exit(0)
})

process.on('SIGINT', async () => {
  log.info('Received SIGINT, shutting down gracefully')
  await database.close()
  process.exit(0)
})

startServer() 