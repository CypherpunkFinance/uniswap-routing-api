/**
 * Simple quote script that works with both tsx and tsc
 * npx tsx scripts/get_quote_simple.ts
 * or 
 * npx tsc scripts/get_quote_simple.ts && node scripts/get_quote_simple.js
 */
import axios, { AxiosResponse } from 'axios'
import * as dotenv from 'dotenv'

dotenv.config()

// Define the types inline to avoid import issues
interface QuoteParams {
  tokenInAddress: string
  tokenInChainId: number
  tokenOutAddress: string
  tokenOutChainId: number
  amount: string
  type: 'exactIn' | 'exactOut'
  recipient?: string
  slippageTolerance?: string
  deadline?: string
  algorithm?: string
}

interface QuoteResponse {
  quoteId: string
  amount: string
  amountDecimals: string
  quote: string
  quoteDecimals: string
  quoteGasAdjusted: string
  quoteGasAdjustedDecimals: string
  gasUseEstimate: string
  gasUseEstimateQuote: string
  gasUseEstimateQuoteDecimals: string
  gasUseEstimateUSD: string
  gasPriceWei: string
  route: any[]
  routeString: string
  blockNumber: string
  methodParameters?: any
  hitsCachedRoutes?: boolean
  simulationStatus: string
}

;(async function () {
  const quoteParams: QuoteParams = {
    tokenInAddress: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // MKR
    tokenInChainId: 1,
    tokenOutAddress: '0x6B175474E89094C44Da98b954EedeAC495271d0F', // GRT  
    tokenOutChainId: 1,
    amount: '50000000000000000000', // 50 tokens in wei (18 decimals)
    type: 'exactIn',
    recipient: '0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B',
    slippageTolerance: '5',
    deadline: '360',
    algorithm: 'alpha',
  }

  // Build query string from parameters
  const queryString = new URLSearchParams(quoteParams as any).toString()
  
  // Use local server URL or environment variable
  const baseUrl = process.env.UNISWAP_ROUTING_API || 'http://localhost:3000/'
  const url = `${baseUrl}quote?${queryString}`

  console.log('Making request to:', url)

  try {
    const response: AxiosResponse<QuoteResponse> = await axios.get<QuoteResponse>(url)
    
    console.log('Quote Response:')
    console.log(JSON.stringify(response.data, null, 2))
  } catch (error: any) {
    console.error('Error getting quote:')
    if (error.response) {
      console.error('Status:', error.response.status)
      console.error('Data:', error.response.data)
    } else {
      console.error(error.message)
    }
  }
})() 