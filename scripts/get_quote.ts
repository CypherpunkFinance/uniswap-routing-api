/**
 * npx tsx scripts/get_quote.ts
 * or 
 * npx tsc scripts/get_quote.ts && node scripts/get_quote.js
 */
import axios, { AxiosResponse } from 'axios'
import * as dotenv from 'dotenv'
import { QuoteQueryParams } from '../lib/handlers/quote/schema/quote-schema'
import { QuoteResponse } from '../lib/handlers/schema'

dotenv.config()

;(async function () {
  const quoteParams: QuoteQueryParams = {
    tokenInAddress: '0xA0b86a33E6417058256Ce9DEd69BcF4C8C02AA9B', // MKR
    tokenInChainId: 1,
    tokenOutAddress: '0xc944E90C64B2c07662A292be6244BDf05Cda44a7', // GRT
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
