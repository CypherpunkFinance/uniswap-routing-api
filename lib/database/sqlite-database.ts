import Database from 'better-sqlite3'
import { join } from 'path'
import bunyan from 'bunyan'

export interface CacheEntry {
  key: string
  value: any
  ttl: number
  createdAt: number
}

export interface RouteEntry {
  routeId: string
  chainId: number
  tokenInAddress: string
  tokenOutAddress: string
  amount: string
  type: string
  route: any
  createdAt: number
  ttl: number
}

export class SQLiteDatabase {
  private db: Database.Database | null = null
  private log = bunyan.createLogger({ name: 'SQLiteDatabase' })

  async initialize(): Promise<void> {
    try {
      const dbPath = process.env.DATABASE_PATH || join(process.cwd(), 'routing-api.db')
      this.db = new Database(dbPath)

      // Enable WAL mode for better performance
      this.db.exec('PRAGMA journal_mode = WAL')
      this.db.exec('PRAGMA synchronous = NORMAL')
      this.db.exec('PRAGMA cache_size = 1000')
      this.db.exec('PRAGMA foreign_keys = ON')

      // Create tables
      this.createTables()

      this.log.info(`SQLite database initialized at ${dbPath}`)
    } catch (error) {
      this.log.error({ error }, 'Failed to initialize SQLite database')
      throw error
    }
  }

  private createTables(): void {
    if (!this.db) throw new Error('Database not initialized')

    // Cache table (replaces DynamoDB caching)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS cache (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        ttl INTEGER NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (unixepoch())
      )
    `)

    // Routes table (replaces DynamoDB routes)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS routes (
        route_id TEXT PRIMARY KEY,
        chain_id INTEGER NOT NULL,
        token_in_address TEXT NOT NULL,
        token_out_address TEXT NOT NULL,
        amount TEXT NOT NULL,
        type TEXT NOT NULL,
        route TEXT NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        ttl INTEGER NOT NULL
      )
    `)

    // Cached routes table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS cached_routes (
        id TEXT PRIMARY KEY,
        chain_id INTEGER NOT NULL,
        token_in TEXT NOT NULL,
        token_out TEXT NOT NULL,
        amount TEXT NOT NULL,
        type TEXT NOT NULL,
        route_data TEXT NOT NULL,
        block_number INTEGER,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        ttl INTEGER NOT NULL
      )
    `)

    // Pool cache table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS pool_cache (
        id TEXT PRIMARY KEY,
        chain_id INTEGER NOT NULL,
        pool_address TEXT NOT NULL,
        token0 TEXT NOT NULL,
        token1 TEXT NOT NULL,
        fee INTEGER,
        pool_data TEXT NOT NULL,
        block_number INTEGER,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        ttl INTEGER NOT NULL
      )
    `)

    // V3 pools table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS cached_v3_pools (
        pool_address TEXT PRIMARY KEY,
        chain_id INTEGER NOT NULL,
        token0_address TEXT NOT NULL,
        token1_address TEXT NOT NULL,
        fee INTEGER NOT NULL,
        liquidity TEXT,
        sqrt_price_x96 TEXT,
        tick INTEGER,
        block_number INTEGER,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        ttl INTEGER NOT NULL
      )
    `)

    // V2 pairs table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS cached_v2_pairs (
        pair_address TEXT PRIMARY KEY,
        chain_id INTEGER NOT NULL,
        token0_address TEXT NOT NULL,
        token1_address TEXT NOT NULL,
        reserve0 TEXT,
        reserve1 TEXT,
        block_number INTEGER,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        ttl INTEGER NOT NULL
      )
    `)

    // Token properties cache
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS token_properties_cache (
        token_address TEXT PRIMARY KEY,
        chain_id INTEGER NOT NULL,
        symbol TEXT,
        name TEXT,
        decimals INTEGER,
        fee_bps TEXT,
        properties TEXT,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        ttl INTEGER NOT NULL
      )
    `)

    // RPC provider health state
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS rpc_provider_health_state (
        provider_name TEXT PRIMARY KEY,
        chain_id INTEGER NOT NULL,
        is_healthy INTEGER NOT NULL DEFAULT 1,
        last_check INTEGER NOT NULL DEFAULT (unixepoch()),
        error_count INTEGER NOT NULL DEFAULT 0,
        last_error TEXT
      )
    `)

    // Create indexes for better performance
    this.createIndexes()
  }

  private createIndexes(): void {
    if (!this.db) throw new Error('Database not initialized')

    // Cache indexes
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_cache_ttl ON cache(ttl)')

    // Routes indexes
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_routes_chain_tokens ON routes(chain_id, token_in_address, token_out_address)')
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_routes_ttl ON routes(ttl)')

    // Cached routes indexes
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_cached_routes_chain_tokens ON cached_routes(chain_id, token_in, token_out)')
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_cached_routes_ttl ON cached_routes(ttl)')

    // Pool cache indexes
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_pool_cache_chain ON pool_cache(chain_id)')
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_pool_cache_ttl ON pool_cache(ttl)')

    // V3 pools indexes
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_v3_pools_chain ON cached_v3_pools(chain_id)')
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_v3_pools_tokens ON cached_v3_pools(token0_address, token1_address)')

    // V2 pairs indexes
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_v2_pairs_chain ON cached_v2_pairs(chain_id)')
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_v2_pairs_tokens ON cached_v2_pairs(token0_address, token1_address)')

    // Token properties indexes
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_token_properties_chain ON token_properties_cache(chain_id)')

    // RPC health indexes
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_rpc_health_chain ON rpc_provider_health_state(chain_id)')
  }

  // Cache operations
  async get(key: string): Promise<any | null> {
    if (!this.db) throw new Error('Database not initialized')

    const stmt = this.db.prepare('SELECT value, ttl FROM cache WHERE key = ? AND (ttl = 0 OR ttl > unixepoch())')
    const row = stmt.get(key) as any

    if (!row) return null

    try {
      return JSON.parse(row.value)
    } catch (error) {
      this.log.warn({ error, key }, 'Failed to parse cached value')
      return null
    }
  }

  async set(key: string, value: any, ttlSeconds: number = 0): Promise<void> {
    if (!this.db) throw new Error('Database not initialized')

    const ttl = ttlSeconds > 0 ? Math.floor(Date.now() / 1000) + ttlSeconds : 0
    const stmt = this.db.prepare('INSERT OR REPLACE INTO cache (key, value, ttl) VALUES (?, ?, ?)')
    stmt.run(key, JSON.stringify(value), ttl)
  }

  async delete(key: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized')

    const stmt = this.db.prepare('DELETE FROM cache WHERE key = ?')
    stmt.run(key)
  }

  // Route operations
  async getRoute(routeId: string): Promise<RouteEntry | null> {
    if (!this.db) throw new Error('Database not initialized')

    const stmt = this.db.prepare('SELECT * FROM routes WHERE route_id = ? AND (ttl = 0 OR ttl > unixepoch())')
    const row = stmt.get(routeId) as any

    if (!row) return null

    return {
      routeId: row.route_id,
      chainId: row.chain_id,
      tokenInAddress: row.token_in_address,
      tokenOutAddress: row.token_out_address,
      amount: row.amount,
      type: row.type,
      route: JSON.parse(row.route),
      createdAt: row.created_at,
      ttl: row.ttl,
    }
  }

  async setRoute(entry: RouteEntry, ttlSeconds: number = 300): Promise<void> {
    if (!this.db) throw new Error('Database not initialized')

    const ttl = Math.floor(Date.now() / 1000) + ttlSeconds
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO routes 
      (route_id, chain_id, token_in_address, token_out_address, amount, type, route, ttl) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    stmt.run(
      entry.routeId,
      entry.chainId,
      entry.tokenInAddress,
      entry.tokenOutAddress,
      entry.amount,
      entry.type,
      JSON.stringify(entry.route),
      ttl
    )
  }

  // Cleanup expired entries
  async cleanup(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized')

    const currentTime = Math.floor(Date.now() / 1000)

    // Clean up expired cache entries
    this.db.prepare('DELETE FROM cache WHERE ttl > 0 AND ttl < ?').run(currentTime)
    this.db.prepare('DELETE FROM routes WHERE ttl > 0 AND ttl < ?').run(currentTime)
    this.db.prepare('DELETE FROM cached_routes WHERE ttl > 0 AND ttl < ?').run(currentTime)
    this.db.prepare('DELETE FROM pool_cache WHERE ttl > 0 AND ttl < ?').run(currentTime)

    // Run VACUUM occasionally to reclaim space
    if (Math.random() < 0.01) {
      // 1% chance
      this.db.exec('VACUUM')
    }
  }

  // Health check operations
  async setProviderHealth(providerName: string, chainId: number, isHealthy: boolean, error?: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized')

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO rpc_provider_health_state 
      (provider_name, chain_id, is_healthy, last_check, error_count, last_error) 
      VALUES (?, ?, ?, unixepoch(), 
        COALESCE((SELECT error_count FROM rpc_provider_health_state WHERE provider_name = ? AND chain_id = ?), 0) + CASE WHEN ? THEN 0 ELSE 1 END,
        ?)
    `)
    stmt.run(providerName, chainId, isHealthy ? 1 : 0, providerName, chainId, isHealthy, error || null)
  }

  async getProviderHealth(providerName: string, chainId: number): Promise<boolean> {
    if (!this.db) throw new Error('Database not initialized')

    const stmt = this.db.prepare('SELECT is_healthy FROM rpc_provider_health_state WHERE provider_name = ? AND chain_id = ?')
    const row = stmt.get(providerName, chainId) as any

    return row ? Boolean(row.is_healthy) : true // Default to healthy if no record
  }

  async close(): Promise<void> {
    if (this.db) {
      this.db.close()
      this.db = null
      this.log.info('SQLite database closed')
    }
  }
} 