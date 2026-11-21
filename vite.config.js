import {createGongolaMarketProxy} from './src/ict-machine/market-data-proxy.mjs';
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [createGongolaMarketProxy()],
  base: process.env.VERCEL === '1' ? '/' : '/gongola-terminal/',
})
