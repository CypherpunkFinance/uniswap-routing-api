import { ChainId } from '@uniswap/sdk-core'
import { AlphaRouter, AlphaRouterConfig, IMetric, IRouter, MetricLoggerUnit, SwapType } from '@uniswap/smart-order-router'
import { default as bunyan, default as Logger } from 'bunyan'
import { RequestInjected, LocalInjectorSOR } from '../local-injector-sor'
import { QuoteQueryParams } from './schema/quote-schema'
import { SQLiteDatabase } from '../../database/sqlite-database'
import { QuoteResponse } from '../schema'
import { RoutingApiSimulationStatus } from './util/simulation'
import { UniversalRouterVersion } from '@uniswap/universal-router-sdk'

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
      
      const requestInjected = await injector.getRequestInjected(
        containerInjected,
        undefined,
        queryParams,
        mockEvent,
        mockContext,
        log,
        mockMetrics
      )

      log.info('Request injected successfully, calling AlphaRouter')
      
      const { router, chainId, tokenProvider } = requestInjected
      const { 
        tokenInAddress, 
        tokenOutAddress, 
        amount, 
        type,
        recipient,
        slippageTolerance,
        deadline
      } = queryParams

      // Get tokens from the token provider
      log.info({ tokenInAddress, tokenOutAddress }, 'Fetching tokens')
      const [tokenIn, tokenOut] = await Promise.all([
        tokenProvider.getTokens([tokenInAddress]),
        tokenProvider.getTokens([tokenOutAddress])
      ])

      const tokenInResult = tokenIn.getTokenByAddress(tokenInAddress)
      const tokenOutResult = tokenOut.getTokenByAddress(tokenOutAddress)

      if (!tokenInResult || !tokenOutResult) {
        throw new Error(`Could not fetch token info. TokenIn: ${!!tokenInResult}, TokenOut: ${!!tokenOutResult}`)
      }

      log.info({ 
        tokenIn: { symbol: tokenInResult.symbol, decimals: tokenInResult.decimals },
        tokenOut: { symbol: tokenOutResult.symbol, decimals: tokenOutResult.decimals }
      }, 'Tokens fetched successfully')

      // Parse amount and trade type
      const { CurrencyAmount, TradeType, Percent } = await import('@uniswap/sdk-core')
      const parsedAmount = CurrencyAmount.fromRawAmount(
        type === 'exactIn' ? tokenInResult : tokenOutResult,
        amount
      )
      const tradeType = type === 'exactIn' ? TradeType.EXACT_INPUT : TradeType.EXACT_OUTPUT

      log.info({ 
        amount: parsedAmount.toExact(),
        tradeType: type,
        chainId 
      }, 'Calling router.route()')

      // Call the router with swap options
      const swapOptions = {
        type: SwapType.UNIVERSAL_ROUTER,
        version: UniversalRouterVersion.V1_2,
        recipient: recipient || '0x0000000000000000000000000000000000000000',
        slippageTolerance: slippageTolerance ? new Percent(parseInt(slippageTolerance), 10000) : new Percent(50, 10000), // 0.5% default
        deadline: deadline ? Math.floor(Date.now() / 1000) + parseInt(deadline) : Math.floor(Date.now() / 1000) + 1800, // 30 min default
      }

      console.log('DEBUG: About to call router.route() with chainId:', chainId, 'type:', typeof chainId)

      // WORKAROUND: Override AlphaRouter's chainId property to ensure it's numeric
      // The Universal Router SDK expects a numeric chainId, but somehow this.chainId 
      // in AlphaRouter can become a string, causing UNIVERSAL_ROUTER_ADDRESS lookup to fail
      if (typeof (router as any).chainId !== 'number') {
        const originalChainId = (router as any).chainId
        ;(router as any).chainId = typeof originalChainId === 'string' ? parseInt(originalChainId) : chainId
        log.info({ 
          originalChainId, 
          originalType: typeof originalChainId,
          fixedChainId: (router as any).chainId,
          fixedType: typeof (router as any).chainId 
        }, 'Fixed AlphaRouter chainId type for Universal Router SDK compatibility')
      }

      // Additional safety check: ensure all chainId properties are consistent
      console.log('DEBUG: Final chainId check before routing:', {
        localChainId: chainId,
        localChainIdType: typeof chainId,
        routerChainId: (router as any).chainId,
        routerChainIdType: typeof (router as any).chainId,
        swapOptionsType: swapOptions.type
      })

      // Ensure chainId is numeric and available
      const numericChainId = typeof chainId === 'string' ? parseInt(chainId) : chainId
      if (typeof numericChainId !== 'number' || isNaN(numericChainId)) {
        throw new Error(`Invalid chainId for routing: ${chainId}`)
      }

      const routeResult = await router.route(
        parsedAmount,
        type === 'exactIn' ? tokenOutResult : tokenInResult,
        tradeType,
        swapOptions
      )

      if (!routeResult) {
        throw new Error('No route found')
      }

      log.info({ 
        quote: routeResult.quote.toExact(),
        gasEstimate: routeResult.estimatedGasUsed?.toString()
      }, 'Route found successfully')

      // Convert route information to the proper format
      const convertRouteToResponse = (route: any[]): any[] => {
        return route.map(routeWithValidQuote => {
          return routeWithValidQuote.route.pools.map((pool: any) => {
            const poolType = pool.fee ? 'v3-pool' : 'v2-pool'
            
            if (poolType === 'v3-pool') {
              return {
                type: 'v3-pool',
                address: pool.address || '',
                tokenIn: {
                  address: pool.token0.address,
                  chainId: pool.token0.chainId,
                  symbol: pool.token0.symbol || '',
                  decimals: pool.token0.decimals.toString(),
                },
                tokenOut: {
                  address: pool.token1.address,
                  chainId: pool.token1.chainId,
                  symbol: pool.token1.symbol || '',
                  decimals: pool.token1.decimals.toString(),
                },
                sqrtRatioX96: pool.sqrtRatioX96?.toString() || '0',
                liquidity: pool.liquidity?.toString() || '0',
                tickCurrent: pool.tickCurrent?.toString() || '0',
                fee: pool.fee?.toString() || '0',
              }
            } else {
              return {
                type: 'v2-pool',
                address: pool.address || '',
                tokenIn: {
                  address: pool.token0.address,
                  chainId: pool.token0.chainId,
                  symbol: pool.token0.symbol || '',
                  decimals: pool.token0.decimals.toString(),
                },
                tokenOut: {
                  address: pool.token1.address,
                  chainId: pool.token1.chainId,
                  symbol: pool.token1.symbol || '',
                  decimals: pool.token1.decimals.toString(),
                },
                reserve0: {
                  token: {
                    address: pool.token0.address,
                    chainId: pool.token0.chainId,
                    symbol: pool.token0.symbol || '',
                    decimals: pool.token0.decimals.toString(),
                  },
                  quotient: pool.reserve0?.toString() || '0'
                },
                reserve1: {
                  token: {
                    address: pool.token1.address,
                    chainId: pool.token1.chainId,
                    symbol: pool.token1.symbol || '',
                    decimals: pool.token1.decimals.toString(),
                  },
                  quotient: pool.reserve1?.toString() || '0'
                }
              }
            }
          })
        })
      }

      // Format the response
      const response: QuoteResponse = {
        quoteId: Math.random().toString(36),
        amount: parsedAmount.quotient.toString(),
        amountDecimals: parsedAmount.currency.decimals.toString(),
        quote: routeResult.quote.quotient.toString(),
        quoteDecimals: routeResult.quote.currency.decimals.toString(),
        quoteGasAdjusted: routeResult.quoteGasAdjusted.quotient.toString(),
        quoteGasAdjustedDecimals: routeResult.quoteGasAdjusted.currency.decimals.toString(),
        gasUseEstimate: routeResult.estimatedGasUsed?.toString() || '150000',
        gasUseEstimateQuote: routeResult.estimatedGasUsedQuoteToken?.quotient.toString() || '0',
        gasUseEstimateQuoteDecimals: routeResult.estimatedGasUsedQuoteToken?.currency.decimals.toString() || '18',
        gasUseEstimateUSD: routeResult.estimatedGasUsedUSD?.toExact() || '0',
        gasPriceWei: routeResult.gasPriceWei?.toString() || '20000000000',
        route: convertRouteToResponse(routeResult.route),
        routeString: JSON.stringify(routeResult.route.map(r => ({ 
          protocol: r.protocol, 
          input: r.route.input.isToken ? r.route.input.address : 'ETH',
          output: r.route.output.isToken ? r.route.output.address : 'ETH'
        }))),
        blockNumber: '0', // We'd need to fetch this from provider
        methodParameters: routeResult.methodParameters ? {
          calldata: routeResult.methodParameters.calldata,
          value: routeResult.methodParameters.value,
          to: routeResult.methodParameters.to,
        } : undefined,
        hitsCachedRoutes: false,
        simulationStatus: RoutingApiSimulationStatus.NOT_SUPPORTED,
      }

      return response

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
    let chainId: ChainId = typeof rawChainId === 'string' ? parseInt(rawChainId) : Number(rawChainId)
    
    // Ensure chainId is always a number to prevent Universal Router address lookup issues
    if (typeof chainId !== 'number' || isNaN(chainId)) {
      throw new Error(`Invalid chainId: ${rawChainId}. Must be a valid number.`)
    }
    
    log.info({ 
      rawChainId, 
      chainId, 
      type: typeof chainId 
    }, 'Chain ID conversion - ensured numeric')

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
    
    // Ensure chainId is numeric before passing to AlphaRouter
    const numericChainId = typeof chainId === 'string' ? parseInt(chainId) : chainId
    if (typeof numericChainId !== 'number' || isNaN(numericChainId)) {
      throw new Error(`Invalid chainId for AlphaRouter creation: ${chainId}`)
    }
    
    log.info({ 
      originalChainId: chainId, 
      numericChainId, 
      chainIdType: typeof numericChainId 
    }, 'ChainId conversion for AlphaRouter')
    
    const router = new AlphaRouter({
      chainId: numericChainId,
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
      chainId: numericChainId, // Return the numeric chainId
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