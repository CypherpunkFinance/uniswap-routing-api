import { ChainId } from '@uniswap/sdk-core'
import { AlphaRouter, AlphaRouterConfig, IMetric, IRouter, MetricLoggerUnit } from '@uniswap/smart-order-router'
import { APIGatewayProxyEvent, Context } from 'aws-lambda'
import { default as bunyan, default as Logger } from 'bunyan'
import { MetricsLogger } from 'aws-embedded-metrics'
import { RequestInjected, LocalInjectorSOR } from '../local-injector-sor'
import { QuoteQueryParams } from './schema/quote-schema'
import { SQLiteDatabase } from '../../database/sqlite-database'

export class LocalQuoteHandlerInjector extends LocalInjectorSOR<IRouter<AlphaRouterConfig>, QuoteQueryParams> {
  constructor(injectorName: string, database: SQLiteDatabase) {
    super(injectorName, database)
  }

  public async getRequestInjected(
    containerInjected: any,
    _requestBody: void,
    requestQueryParams: QuoteQueryParams,
    _event: APIGatewayProxyEvent,
    context: Context,
    log: Logger,
    metrics: MetricsLogger
  ): Promise<RequestInjected<IRouter<AlphaRouterConfig>>> {
    const requestId = context.awsRequestId

    const {
      tokenInChainId,
      tokenOutChainId,
      tokenInAddress,
      tokenOutAddress,
      amount,
      type,
      recipient,
      slippageTolerance,
      deadline,
      algorithm,
      quoteSpeed,
      intent,
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
      tokenListProvider: dependencies.tokenListProvider,
      blockedTokenListProvider: dependencies.blockedTokenListProvider,
      tokenValidatorProvider: dependencies.tokenValidatorProvider,
      tokenPropertiesProvider: dependencies.tokenPropertiesProvider,
      simulator: dependencies.simulator,
      routeCachingProvider: dependencies.routeCachingProvider,
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
      quoteSpeed,
      intent,
    }
  }
} 