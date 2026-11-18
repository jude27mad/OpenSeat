import { defineConfig } from 'vite'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { marked } from 'marked'

const evidence = fileURLToPath(new URL('./docs/prototype-evidence.md', import.meta.url))

function renderEvidence() {
  const source = readFileSync(evidence, 'utf8')
  // The source lives under docs/. Resolve its images from the public evidence page.
  const options = {
    walkTokens(token) {
      if (token.type === 'image' && token.href.startsWith('evidence/')) {
        token.href = '../docs/' + token.href
      }
    },
  }
  return source.split(/(?=^## )/m).map((section) => {
    const title = section.match(/^## (.+)/)?.[1]
    const id = title?.toLowerCase().replace(/[^a-z0-9]+/g, '-')
    const html = marked.parse(section, options)
    return id ? `<section id="${id}">${html}</section>` : html
  }).join('\n')
}

export default defineConfig({
  base: './',
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'prototype-evidence-page',
      buildStart() { this.addWatchFile(evidence) },
      transformIndexHtml: {
        order: 'pre',
        handler(html) {
          return html.replace('<!-- prototype-evidence -->', renderEvidence)
        },
      },
    },
  ],
  build: { rollupOptions: { input: ['index.html', 'evidence/index.html'] } },
  server: { host: '0.0.0.0', allowedHosts: ['terminal.local'] },
})
