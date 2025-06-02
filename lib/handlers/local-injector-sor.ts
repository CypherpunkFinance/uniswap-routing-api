import { ChainId, Token } from '@uniswap/sdk-core'
import {
  CachingGasStationProvider,
  CachingTokenListProvider,
  CachingTokenProviderWithFallback,
  CachingV2PoolProvider,
  CachingV3PoolProvider,
  CachingV4PoolProvider,
  EIP1559GasPriceProvider,
  EthEstimateGasSimulator,
  getApplicableV4FeesTickspacingsHooks,
  IGasPriceProvider,
  IMetric,
  IOnChainQuoteProvider,
  ITokenListProvider,
  ITokenPropertiesProvider,
  ITokenProvider,
  IV2PoolProvider,
  IV2SubgraphProvider,
  IV3PoolProvider,
  IV3SubgraphProvider,
  IV4PoolProvider,
  IV4SubgraphProvider,
  LegacyGasPriceProvider,
  MIXED_ROUTE_QUOTER_V1_ADDRESSES,
  MIXED_ROUTE_QUOTER_V2_ADDRESSES,
  NodeJSCache,
  OnChainGasPriceProvider,
  OnChainQuoteProvider,
  PROTOCOL_V4_QUOTER_ADDRESSES,
  QUOTER_V2_ADDRESSES,
  setGlobalLogger,
  Simulator,
  StaticV2SubgraphProvider,
  StaticV3SubgraphProvider,
  StaticV4SubgraphProvider,
  TokenPropertiesProvider,
  TokenProvider,
  TokenValidatorProvider,
  UniswapMulticallProvider,
  V2PoolProvider,
  V2QuoteProvider,
  V3PoolProvider,
  V4PoolProvider,
} from '@uniswap/smart-order-router'
import { TokenList } from '@uniswap/token-lists'
import { default as bunyan, default as Logger } from 'bunyan'
import _ from 'lodash'
import NodeCache from 'node-cache'
import UNSUPPORTED_TOKEN_LIST from './../config/unsupported.tokenlist.json'
import { BaseRInj, Injector } from './local-handler'
import { DefaultEVMClient } from './evm/EVMClient'
import { InstrumentedEVMProvider } from './evm/provider/InstrumentedEVMProvider'
import { deriveProviderName } from './evm/provider/ProviderName'
import { OnChainTokenFeeFetcher } from '@uniswap/smart-order-router/build/main/providers/token-fee-fetcher'
import { PortionProvider } from '@uniswap/smart-order-router/build/main/providers/portion-provider'
import { StaticJsonRpcProvider } from '@ethersproject/providers'
import {
  BLOCK_NUMBER_CONFIGS,
  GAS_ERROR_FAILURE_OVERRIDES,
  NON_OPTIMISTIC_CACHED_ROUTES_BATCH_PARAMS,
  OPTIMISTIC_CACHED_ROUTES_BATCH_PARAMS,
  RETRY_OPTIONS,
  SUCCESS_RATE_FAILURE_OVERRIDES,
} from '../util/onChainQuoteProviderConfigs'
import { v4 } from 'uuid'
import { Protocol } from '@uniswap/router-sdk'
import {
  emptyV4FeeTickSpacingsHookAddresses,
  EXTRA_V4_FEE_TICK_SPACINGS_HOOK_ADDRESSES,
} from '../util/extraV4FeeTiersTickSpacingsHookAddresses'
import { SQLiteDatabase } from '../database/sqlite-database'

export const SUPPORTED_CHAINS: ChainId[] = [
  ChainId.MAINNET,
  ChainId.OPTIMISM,
  ChainId.ARBITRUM_ONE,
  ChainId.POLYGON,
  ChainId.SEPOLIA,
  ChainId.CELO,
  ChainId.CELO_ALFAJORES,
  ChainId.BNB,
  ChainId.AVALANCHE,
  ChainId.BASE,
  ChainId.BLAST,
  ChainId.ZORA,
  ChainId.ZKSYNC,
  ChainId.WORLDCHAIN,
  ChainId.UNICHAIN_SEPOLIA,
  ChainId.MONAD_TESTNET,
  ChainId.BASE_SEPOLIA,
  ChainId.UNICHAIN,
  ChainId.SONEIUM,
]

export interface RequestInjected<Router> extends BaseRInj {
  chainId: ChainId
  metric: IMetric
  v4PoolProvider: IV4PoolProvider
  v3PoolProvider: IV3PoolProvider
  v2PoolProvider: IV2PoolProvider
  tokenProvider: ITokenProvider
  tokenListProvider: ITokenListProvider
  router: Router
  quoteSpeed?: string
  intent?: string
}

export type ContainerDependencies = {
  provider: StaticJsonRpcProvider
  v4SubgraphProvider: IV4SubgraphProvider
  v3SubgraphProvider: IV3SubgraphProvider
  v2SubgraphProvider: IV2SubgraphProvider
  tokenListProvider: ITokenListProvider
  gasPriceProvider: IGasPriceProvider
  tokenProviderFromTokenList: ITokenProvider
  blockedTokenListProvider: ITokenListProvider
  v4PoolProvider: IV4PoolProvider
  v3PoolProvider: IV3PoolProvider
  v2PoolProvider: IV2PoolProvider
  tokenProvider: ITokenProvider
  multicallProvider: UniswapMulticallProvider
  onChainQuoteProvider?: IOnChainQuoteProvider
  v2QuoteProvider: V2QuoteProvider
  simulator: Simulator
  tokenValidatorProvider: TokenValidatorProvider
  tokenPropertiesProvider: ITokenPropertiesProvider
  v2Supported: ChainId[]
  v4Supported?: ChainId[]
  mixedSupported?: ChainId[]
  v4PoolParams?: Array<[number, number, string]>
}

export interface ContainerInjected {
  dependencies: {
    [chainId in ChainId]?: ContainerDependencies
  }
  activityId?: string
}

export abstract class LocalInjectorSOR<Router, QueryParams> extends Injector<
  ContainerInjected,
  RequestInjected<Router>,
  void,
  QueryParams
> {
  protected database: SQLiteDatabase

  constructor(injectorName: string, database: SQLiteDatabase) {
    super(injectorName)
    this.database = database
  }

  public async buildContainerInjected(): Promise<ContainerInjected> {
    const activityId = v4()
    const log: Logger = bunyan.createLogger({
      name: this.injectorName,
      serializers: bunyan.stdSerializers,
      level: bunyan.INFO,
      activityId: activityId,
    })
    setGlobalLogger(log)

    try {
      const dependenciesByChain: {
        [chainId in ChainId]?: ContainerDependencies
      } = {}

      const dependenciesByChainArray = await Promise.all(
        _.map(SUPPORTED_CHAINS, async (chainId: ChainId) => {
          const rpcUrl = process.env[`WEB3_RPC_${chainId.toString()}`]
          if (!rpcUrl) {
            log.warn({ chainId }, `No Web3 RPC endpoint set for chain, skipping`)
            return { chainId, dependencies: {} as ContainerDependencies }
          }

          let timeout: number
          switch (chainId) {
            case ChainId.ARBITRUM_ONE:
              timeout = 8000
              break
            default:
              timeout = 5000
              break
          }

          const provider = new DefaultEVMClient({
            allProviders: [
              new InstrumentedEVMProvider({
                url: {
                  url: rpcUrl,
                  timeout,
                },
                network: chainId,
                name: deriveProviderName(rpcUrl),
              }),
            ],
          }).getProvider()

          const tokenCache = new NodeJSCache<Token>(new NodeCache({ stdTTL: 3600, useClones: false }))
          const blockedTokenCache = new NodeJSCache<Token>(new NodeCache({ stdTTL: 3600, useClones: false }))
          const multicall2Provider = new UniswapMulticallProvider(chainId, provider, 375_000)

          // Use in-memory caching for all pools in local mode
          const v4PoolProvider = new CachingV4PoolProvider(
            chainId,
            new V4PoolProvider(chainId, multicall2Provider),
            new NodeJSCache(new NodeCache({ stdTTL: 180, useClones: false }))
          )

          const v3PoolProvider = new CachingV3PoolProvider(
            chainId,
            new V3PoolProvider(chainId, multicall2Provider),
            new NodeJSCache(new NodeCache({ stdTTL: 180, useClones: false }))
          )

          const tokenValidatorProvider = new TokenValidatorProvider(
            chainId,
            multicall2Provider,
            new NodeJSCache(new NodeCache({ stdTTL: 30000, useClones: false }))
          )

          // Use simple on-chain token fee fetcher
          const onChainTokenFeeFetcher = new OnChainTokenFeeFetcher(chainId, provider)
          
          const tokenPropertiesProvider = new TokenPropertiesProvider(
            chainId,
            new NodeJSCache(new NodeCache({ stdTTL: 30000, useClones: false })),
            onChainTokenFeeFetcher
          )

          const v2PoolProvider = new CachingV2PoolProvider(
            chainId,
            new V2PoolProvider(chainId, multicall2Provider, tokenPropertiesProvider),
            new NodeJSCache(new NodeCache({ stdTTL: 180, useClones: false }))
          )

          const v4PoolParams = getApplicableV4FeesTickspacingsHooks(chainId).concat(
            EXTRA_V4_FEE_TICK_SPACINGS_HOOK_ADDRESSES[chainId] ?? emptyV4FeeTickSpacingsHookAddresses
          )

          // Use static providers instead of AWS-based ones for local development
          const [
            tokenListProvider,
            blockedTokenListProvider,
            v4SubgraphProvider,
            v3SubgraphProvider,
            v2SubgraphProvider,
          ] = await Promise.all([
            this.createTokenListProvider(chainId, tokenCache),
            CachingTokenListProvider.fromTokenList(chainId, UNSUPPORTED_TOKEN_LIST as TokenList, blockedTokenCache),
            this.createV4SubgraphProvider(chainId, v4PoolProvider, v4PoolParams),
            this.createV3SubgraphProvider(chainId, v3PoolProvider),
            this.createV2SubgraphProvider(chainId, v2PoolProvider),
          ])

          const tokenProvider = new CachingTokenProviderWithFallback(
            chainId,
            tokenCache,
            new TokenProvider(chainId, multicall2Provider)
          )

          // Create quote provider
          const quoteProvider = new OnChainQuoteProvider(
            chainId,
            provider,
            multicall2Provider,
            RETRY_OPTIONS[chainId],
            (optimisticCachedRoutes, protocol) => {
              return optimisticCachedRoutes
                ? OPTIMISTIC_CACHED_ROUTES_BATCH_PARAMS[protocol][chainId]
                : NON_OPTIMISTIC_CACHED_ROUTES_BATCH_PARAMS[protocol][chainId]
            },
            (_protocol) => GAS_ERROR_FAILURE_OVERRIDES[chainId],
            (_protocol) => SUCCESS_RATE_FAILURE_OVERRIDES[chainId],
            (_protocol) => BLOCK_NUMBER_CONFIGS[chainId],
            (useMixedRouteQuoter: boolean, mixedRouteContainsV4Pool: boolean, protocol: Protocol) =>
              useMixedRouteQuoter
                ? mixedRouteContainsV4Pool
                  ? MIXED_ROUTE_QUOTER_V2_ADDRESSES[chainId]
                  : MIXED_ROUTE_QUOTER_V1_ADDRESSES[chainId]
                : protocol === Protocol.V3
                ? QUOTER_V2_ADDRESSES[chainId]
                : PROTOCOL_V4_QUOTER_ADDRESSES[chainId]
          )

          const portionProvider = new PortionProvider()

          // Create simplified simulator for local development
          const simulator = new EthEstimateGasSimulator(
            chainId,
            provider,
            v2PoolProvider,
            v3PoolProvider,
            v4PoolProvider,
            portionProvider
          )

          const v2QuoteProvider = new V2QuoteProvider()

          // Create gas price provider
          const gasPriceProvider = this.createGasPriceProvider(chainId, provider)

          const dependencies: ContainerDependencies = {
            provider,
            v4SubgraphProvider,
            v3SubgraphProvider,
            v2SubgraphProvider,
            tokenListProvider,
            gasPriceProvider,
            tokenProviderFromTokenList: tokenProvider,
            blockedTokenListProvider,
            v4PoolProvider,
            v3PoolProvider,
            v2PoolProvider,
            tokenProvider,
            multicallProvider: multicall2Provider,
            onChainQuoteProvider: quoteProvider,
            v2QuoteProvider,
            simulator,
            tokenValidatorProvider,
            tokenPropertiesProvider,
            v2Supported: [ChainId.MAINNET, ChainId.POLYGON, ChainId.BNB],
            v4Supported: [ChainId.MAINNET, ChainId.SEPOLIA], // Limited V4 support for now
            mixedSupported: [ChainId.MAINNET, ChainId.BASE, ChainId.ARBITRUM_ONE, ChainId.OPTIMISM],
            v4PoolParams,
          }

          return { chainId, dependencies }
        })
      )

      for (const { chainId, dependencies } of dependenciesByChainArray) {
        dependenciesByChain[chainId] = dependencies
      }

      return {
        dependencies: dependenciesByChain,
        activityId,
      }
    } catch (error) {
      log.fatal({ error }, 'Fatal error building container')
      throw error
    }
  }

  private async createTokenListProvider(chainId: ChainId, tokenCache: NodeJSCache<Token>): Promise<ITokenListProvider> {
    try {
      // Use a simple built-in token list instead of fetching
      const basicTokenList: TokenList = {
        name: 'Local Token List',
        timestamp: new Date().toISOString(),
        version: { major: 1, minor: 0, patch: 0 },
        tokens: [],
        keywords: [],
        logoURI: '',
      }
      return CachingTokenListProvider.fromTokenList(chainId, basicTokenList, tokenCache)
    } catch (error) {
      console.warn(`Failed to create token list for chain ${chainId}, using empty list`)
      const emptyTokenList: TokenList = {
        name: 'Empty Token List',
        timestamp: new Date().toISOString(),
        version: { major: 1, minor: 0, patch: 0 },
        tokens: [],
        keywords: [],
        logoURI: '',
      }
      return CachingTokenListProvider.fromTokenList(chainId, emptyTokenList, tokenCache)
    }
  }

  private async createV4SubgraphProvider(
    chainId: ChainId,
    poolProvider: IV4PoolProvider,
    _poolParams: Array<[number, number, string]>
  ): Promise<IV4SubgraphProvider> {
    return new StaticV4SubgraphProvider(chainId, poolProvider)
  }

  private async createV3SubgraphProvider(chainId: ChainId, poolProvider: IV3PoolProvider): Promise<IV3SubgraphProvider> {
    return new StaticV3SubgraphProvider(chainId, poolProvider)
  }

  private async createV2SubgraphProvider(chainId: ChainId, _poolProvider: IV2PoolProvider): Promise<IV2SubgraphProvider> {
    return new StaticV2SubgraphProvider(chainId)
  }

  private createGasPriceProvider(chainId: ChainId, provider: StaticJsonRpcProvider): IGasPriceProvider {
    switch (chainId) {
      case ChainId.OPTIMISM:
      case ChainId.BASE:
      case ChainId.BLAST:
        return new EIP1559GasPriceProvider(provider)
      case ChainId.ARBITRUM_ONE:
        return new CachingGasStationProvider(
          chainId,
          new OnChainGasPriceProvider(chainId, new EIP1559GasPriceProvider(provider), new LegacyGasPriceProvider(provider)),
          new NodeJSCache(new NodeCache({ stdTTL: 15, useClones: false }))
        )
      default:
        return new CachingGasStationProvider(
          chainId,
          new OnChainGasPriceProvider(chainId, new EIP1559GasPriceProvider(provider), new LegacyGasPriceProvider(provider)),
          new NodeJSCache(new NodeCache({ stdTTL: 15, useClones: false }))
        )
    }
  }
} 