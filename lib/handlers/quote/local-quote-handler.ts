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
      await injector.getRequestInjected(
        containerInjected,
        undefined,
        queryParams,
        mockEvent,
        mockContext,
        log,
        mockMetrics
      )

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
      log.error({ error }, 'Error processing quote')
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
    let chainId: ChainId = tokenInChainId || tokenOutChainId || ChainId.MAINNET

    if (!containerInjected.dependencies[chainId]) {
      // If the requested chain is not supported, fall back to mainnet
      log.warn({ requestedChainId: chainId }, 'Chain not supported, falling back to mainnet')
      chainId = ChainId.MAINNET
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