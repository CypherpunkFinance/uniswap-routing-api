import { ChainId } from '@uniswap/sdk-core'
import { IRouteCachingProvider, CachedRoute, CachedRoutes } from '@uniswap/smart-order-router'
import { SQLiteDatabase } from '../../database/sqlite-database'
import bunyan from 'bunyan'

export class LocalRouteCachingProvider implements IRouteCachingProvider {
  private log = bunyan.createLogger({ name: 'LocalRouteCachingProvider' })

  constructor(private database: SQLiteDatabase) {}

  async getCachedRoute(
    chainId: ChainId,
    amount: string,
    quoteToken: string,
    tradeType: string,
    protocols: string[],
    blockNumber?: number,
    optimistic?: boolean
  ): Promise<CachedRoute | undefined> {
    try {
      const key = this.buildCacheKey(chainId, amount, quoteToken, tradeType, protocols, blockNumber, optimistic)
      const cached = await this.database.get(key)

      if (!cached) {
        return undefined
      }

      return cached as CachedRoute
    } catch (error) {
      this.log.error({ error, chainId, amount, quoteToken }, 'Error getting cached route')
      return undefined
    }
  }

  async setCachedRoute(
    cachedRoute: CachedRoute,
    amount: string,
    chainId: ChainId,
    quoteToken: string,
    tradeType: string,
    protocols: string[],
    blockNumber?: number,
    optimistic?: boolean
  ): Promise<void> {
    try {
      const key = this.buildCacheKey(chainId, amount, quoteToken, tradeType, protocols, blockNumber, optimistic)
      // Cache for 5 minutes
      await this.database.set(key, cachedRoute, 300)
    } catch (error) {
      this.log.error({ error, chainId, amount, quoteToken }, 'Error setting cached route')
    }
  }

  async getCachedRoutes(
    chainId: ChainId,
    amount: string,
    quoteToken: string,
    tradeType: string,
    protocols: string[],
    blockNumber?: number,
    optimistic?: boolean
  ): Promise<CachedRoutes | undefined> {
    try {
      const key = this.buildCacheKey(chainId, amount, quoteToken, tradeType, protocols, blockNumber, optimistic) + '_routes'
      const cached = await this.database.get(key)

      if (!cached) {
        return undefined
      }

      return cached as CachedRoutes
    } catch (error) {
      this.log.error({ error, chainId, amount, quoteToken }, 'Error getting cached routes')
      return undefined
    }
  }

  async setCachedRoutes(
    cachedRoutes: CachedRoutes,
    amount: string,
    chainId: ChainId,
    quoteToken: string,
    tradeType: string,
    protocols: string[],
    blockNumber?: number,
    optimistic?: boolean
  ): Promise<void> {
    try {
      const key = this.buildCacheKey(chainId, amount, quoteToken, tradeType, protocols, blockNumber, optimistic) + '_routes'
      // Cache for 5 minutes
      await this.database.set(key, cachedRoutes, 300)
    } catch (error) {
      this.log.error({ error, chainId, amount, quoteToken }, 'Error setting cached routes')
    }
  }

  private buildCacheKey(
    chainId: ChainId,
    amount: string,
    quoteToken: string,
    tradeType: string,
    protocols: string[],
    blockNumber?: number,
    optimistic?: boolean
  ): string {
    const protocolsKey = protocols.sort().join(',')
    return `route:${chainId}:${amount}:${quoteToken}:${tradeType}:${protocolsKey}:${blockNumber || 'latest'}:${
      optimistic || false
    }`
  }
}

export class LocalV3PoolCacheProvider {
  private log = bunyan.createLogger({ name: 'LocalV3PoolCacheProvider' })

  constructor(private database: SQLiteDatabase) {}

  async getPool(chainId: ChainId, poolAddress: string): Promise<any | undefined> {
    try {
      const key = `v3pool:${chainId}:${poolAddress.toLowerCase()}`
      return await this.database.get(key)
    } catch (error) {
      this.log.error({ error, chainId, poolAddress }, 'Error getting V3 pool from cache')
      return undefined
    }
  }

  async setPool(chainId: ChainId, poolAddress: string, pool: any): Promise<void> {
    try {
      const key = `v3pool:${chainId}:${poolAddress.toLowerCase()}`
      // Cache pools for 15 minutes
      await this.database.set(key, pool, 900)
    } catch (error) {
      this.log.error({ error, chainId, poolAddress }, 'Error setting V3 pool in cache')
    }
  }
}

export class LocalV2PairCacheProvider {
  private log = bunyan.createLogger({ name: 'LocalV2PairCacheProvider' })

  constructor(private database: SQLiteDatabase) {}

  async getPair(chainId: ChainId, pairAddress: string): Promise<any | undefined> {
    try {
      const key = `v2pair:${chainId}:${pairAddress.toLowerCase()}`
      return await this.database.get(key)
    } catch (error) {
      this.log.error({ error, chainId, pairAddress }, 'Error getting V2 pair from cache')
      return undefined
    }
  }

  async setPair(chainId: ChainId, pairAddress: string, pair: any): Promise<void> {
    try {
      const key = `v2pair:${chainId}:${pairAddress.toLowerCase()}`
      // Cache pairs for 15 minutes
      await this.database.set(key, pair, 900)
    } catch (error) {
      this.log.error({ error, chainId, pairAddress }, 'Error setting V2 pair in cache')
    }
  }
}

export class LocalTokenPropertiesCacheProvider {
  private log = bunyan.createLogger({ name: 'LocalTokenPropertiesCacheProvider' })

  constructor(private database: SQLiteDatabase) {}

  async getTokenProperties(chainId: ChainId, tokenAddress: string): Promise<any | undefined> {
    try {
      const key = `tokenprops:${chainId}:${tokenAddress.toLowerCase()}`
      return await this.database.get(key)
    } catch (error) {
      this.log.error({ error, chainId, tokenAddress }, 'Error getting token properties from cache')
      return undefined
    }
  }

  async setTokenProperties(chainId: ChainId, tokenAddress: string, properties: any): Promise<void> {
    try {
      const key = `tokenprops:${chainId}:${tokenAddress.toLowerCase()}`
      // Cache token properties for 1 hour
      await this.database.set(key, properties, 3600)
    } catch (error) {
      this.log.error({ error, chainId, tokenAddress }, 'Error setting token properties in cache')
    }
  }
} 