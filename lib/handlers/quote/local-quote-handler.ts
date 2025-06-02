import { ChainId } from '@uniswap/sdk-core'
import { AlphaRouter, AlphaRouterConfig, IMetric, IRouter, MetricLoggerUnit } from '@uniswap/smart-order-router'
import { default as bunyan, default as Logger } from 'bunyan'
import { RequestInjected, LocalInjectorSOR } from '../local-injector-sor'
import { QuoteQueryParams } from './schema/quote-schema'
import { SQLiteDatabase } from '../../database/sqlite-database'
import { QuoteResponse } from '../schema'
import { RoutingApiSimulationStatus } from './util/simulation'

export class LocalQuoteHandler {
  constructor(
    private injectorPromise: Promise<LocalQuoteHandlerInjector>
  ) {}

  async handleQuote(queryParams: QuoteQueryParams): Promise<QuoteResponse | { error: string; statusCode: number }> {
    const injector = await this.injectorPromise
    const containerInjected = await injector.getContainerInjected()

    // Create mock context and event for the injector
    const mockContext = {
      awsRequestId: Math.random().toString(36).substring(2, 15),
    }

    const mockEvent = {}

    const log = bunyan.createLogger({
      name: 'LocalQuoteHandler',
      serializers: bunyan.stdSerializers,
      level: bunyan.INFO,
    })

    const mockMetrics = {}

    try {
      log.info('Starting quote request processing')
      
      await injector.getRequestInjected(
        containerInjected,
        undefined,
        queryParams,
        mockEvent,
        mockContext,
        log,
        mockMetrics
      )

      log.info('Request injected successfully, returning mock response')
      
      // Here you would implement the actual quote logic
      // For now, return a basic structure
      return {
        quoteId: Math.random().toString(36),
        amount: '0',
        amountDecimals: '18',
        quote: '0',
        quoteDecimals: '18',
        quoteGasAdjusted: '0',
        quoteGasAdjustedDecimals: '18',
        gasUseEstimate: '150000',
        gasUseEstimateQuote: '0',
        gasUseEstimateQuoteDecimals: '18',
        gasUseEstimateUSD: '0',
        gasPriceWei: '20000000000',
        route: [],
        routeString: '[]',
        blockNumber: '0',
        methodParameters: undefined,
        hitsCachedRoutes: false,
        simulationStatus: 'NotSupported' as RoutingApiSimulationStatus,
      } as QuoteResponse

    } catch (error) {
      log.error({ 
        error: {
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          name: error instanceof Error ? error.name : undefined,
          code: (error as any)?.code,
          details: error
        },
        queryParams 
      }, 'Error processing quote')
      return {
        error: error instanceof Error ? error.message : 'Unknown error',
        statusCode: 500
      }
    }
  }
}

export class LocalQuoteHandlerInjector extends LocalInjectorSOR<IRouter<AlphaRouterConfig>, QuoteQueryParams> {
  constructor(injectorName: string, database: SQLiteDatabase) {
    super(injectorName, database)
  }

  public async getRequestInjected(
    containerInjected: any,
    _requestBody: void,
    requestQueryParams: QuoteQueryParams,
    _event: any,
    context: any,
    log: Logger,
    _metrics: any
  ): Promise<RequestInjected<IRouter<AlphaRouterConfig>>> {
    const requestId = context.awsRequestId

    const {
      tokenInChainId,
      tokenOutChainId,
    } = requestQueryParams

    if ((tokenInChainId && tokenOutChainId && tokenInChainId != tokenOutChainId) ||
        (tokenInChainId && !tokenOutChainId) ||
        (!tokenInChainId && tokenOutChainId)) {
      throw new Error(`All tokens must be on the same chain. TokenIn chain id: ${tokenInChainId}. TokenOut chain id: ${tokenOutChainId}.`)
    }

    // Use tokenInChainId if provided, otherwise fall back to tokenOutChainId, otherwise default to mainnet
    // Convert to number since URL query params are strings but AlphaRouter expects numbers
    const rawChainId = tokenInChainId || tokenOutChainId || ChainId.MAINNET
    let chainId: ChainId = Number(rawChainId)
    
    log.info({ 
      rawChainId, 
      chainId, 
      type: typeof chainId 
    }, 'Chain ID conversion')

    // Debug logging to see what chains are loaded
    const loadedChains = Object.keys(containerInjected.dependencies).filter(
      (cId) => containerInjected.dependencies[parseInt(cId)] && containerInjected.dependencies[parseInt(cId)].provider
    )
    log.info({ 
      requestedChainId: chainId, 
      loadedChains, 
      hasChainDeps: !!containerInjected.dependencies[chainId],
      hasProvider: !!(containerInjected.dependencies[chainId] && containerInjected.dependencies[chainId].provider)
    }, 'Chain dependency check')

    // Check if the chain has properly loaded dependencies (not just an empty object)
    if (!containerInjected.dependencies[chainId] || !containerInjected.dependencies[chainId].provider) {
      // If the requested chain is not supported or not properly configured, throw an error
      throw new Error(`Unknown chain id: ${chainId}. Make sure you have WEB3_RPC_${chainId} configured in your .env file. Loaded chains: ${loadedChains.join(', ')}`)
    }

    const dependencies = containerInjected.dependencies[chainId]!

    // Create simple metrics logger for local development
    const metric: IMetric = {
      putMetric: (key: string, value: number, unit?: MetricLoggerUnit) => {
        log.info({ metric: key, value, unit }, 'Metric recorded')
      },
      putDimensions: (dimensions: Record<string, string>) => {
        log.info({ dimensions }, 'Dimensions set')
      },
      setProperty: (key: string, value: unknown) => {
        log.info({ property: key, value }, 'Property set')
      },
    }

    // Create router
    log.info({ chainId, hasProvider: !!dependencies.provider }, 'Creating AlphaRouter')
    
    const router = new AlphaRouter({
      chainId,
      provider: dependencies.provider,
      multicall2Provider: dependencies.multicallProvider,
      v3PoolProvider: dependencies.v3PoolProvider,
      v4PoolProvider: dependencies.v4PoolProvider,
      v2PoolProvider: dependencies.v2PoolProvider,
      v3SubgraphProvider: dependencies.v3SubgraphProvider,
      v4SubgraphProvider: dependencies.v4SubgraphProvider,
      v2SubgraphProvider: dependencies.v2SubgraphProvider,
      onChainQuoteProvider: dependencies.onChainQuoteProvider,
      v2QuoteProvider: dependencies.v2QuoteProvider,
      gasPriceProvider: dependencies.gasPriceProvider,
      tokenProvider: dependencies.tokenProvider,
      blockedTokenListProvider: dependencies.blockedTokenListProvider,
      tokenValidatorProvider: dependencies.tokenValidatorProvider,
      tokenPropertiesProvider: dependencies.tokenPropertiesProvider,
      simulator: dependencies.simulator,
    })

    log.info('AlphaRouter created successfully')

    return {
      id: requestId,
      log: log.child({ requestId }),
      metric,
      router,
      chainId,
      v4PoolProvider: dependencies.v4PoolProvider,
      v3PoolProvider: dependencies.v3PoolProvider,
      v2PoolProvider: dependencies.v2PoolProvider,
      tokenProvider: dependencies.tokenProvider,
      tokenListProvider: dependencies.tokenListProvider,
      quoteSpeed: requestQueryParams.quoteSpeed,
      intent: requestQueryParams.intent,
    }
  }
} 