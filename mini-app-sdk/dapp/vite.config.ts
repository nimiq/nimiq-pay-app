import type { Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

// Sample data for the Nimiq Pay home widget declared in public/nimiq-pay-widget.json. Cycles through
// the staking states every minute, so the card, its countdown and the attention tone can be checked
// without a real Mini App server.
function widgetData(): Plugin {
  return {
    name: 'nimiq-pay-widget-data',
    configureServer(server) {
      server.middlewares.use('/api/widget', (req, res) => {
        const now = Math.floor(Date.now() / 1000)
        const minuteStart = now - (now % 60)
        const network = new URL(req.url ?? '', 'http://localhost').searchParams.get('network')
        const states = [
          {
            value: { label: 'Staked', luna: '1245021000' },
            rows: [{ label: 'Earned so far', luna: '21240000' }, { label: 'Pool', text: `Demo pool · ${network ?? '?'}` }],
          },
          {
            value: { label: 'Unstaking', luna: '60000000' },
            rows: [{ label: 'Still staked', luna: '1185021000' }],
            countdown: { label: 'Ready to withdraw', until: minuteStart + 60 },
          },
          {
            value: { label: 'Ready to withdraw', luna: '60000000' },
            message: 'Open the demo to confirm the withdrawal.',
            tone: 'attention',
          },
        ]
        res.setHeader('Content-Type', 'application/json')
        res.setHeader('Access-Control-Allow-Origin', '*')
        res.end(JSON.stringify({ v: 1, title: 'Staking', refresh: 60, ...states[(minuteStart / 60) % states.length] }))
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), widgetData()],
})
