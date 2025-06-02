import express, { Request, Response } from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import bunyan from 'bunyan'
import { SQLiteDatabase } from './lib/database/sqlite-database'
import { LocalQuoteHandler, LocalQuoteHandlerInjector } from './lib/handlers/quote/local-quote-handler'

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
let quoteHandler: LocalQuoteHandler
async function initializeHandlers() {
  try {
    const quoteInjectorPromise = new LocalQuoteHandlerInjector('localQuoteInjector', database).build()
    quoteHandler = new LocalQuoteHandler('quote', quoteInjectorPromise)
    log.info('Quote handler initialized successfully')
  } catch (error) {
    log.fatal({ error }, 'Fatal error initializing handlers')
    throw error
  }
}

// Health check endpoint
app.get('/health', (_req: Request, res: Response) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0'
  })
})

// Quote endpoint
app.get('/quote', async (req: Request, res: Response) => {
  try {
    const result = await quoteHandler.handleQuote(req.query as any)

    if ('error' in result) {
      res.status(result.statusCode).json({
        errorCode: 'QUOTE_ERROR',
        detail: result.error,
      })
    } else {
      res.status(200).json(result)
    }
  } catch (error) {
    log.error({ error, req: req.query }, 'Error processing quote request')
    res.status(500).json({
      errorCode: 'INTERNAL_ERROR',
      detail: 'Unexpected error',
    })
  }
})

// Error handling middleware
app.use((error: any, req: Request, res: Response, _next: any) => {
  log.error({ error, req: req.path }, 'Unhandled error')
  res.status(500).json({
    errorCode: 'INTERNAL_ERROR',
    detail: 'Unexpected error',
  })
})

// 404 handler
app.use((_req: Request, res: Response) => {
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