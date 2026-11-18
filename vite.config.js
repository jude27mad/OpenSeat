import { defineConfig, loadEnv } from 'vite'
import { readSettings } from './backend/firebase/settings.js'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { marked } from 'marked'

const evidence = fileURLToPath(new URL('./docs/prototype-evidence.md', import.meta.url))

const detailRenderer = new marked.Renderer()
detailRenderer.table = function ({ header, rows }) {
  const renderInline = (cell) => this.parser.parseInline(cell.tokens)
  const headings = header.map((cell) =>
    `<th scope="col" role="columnheader">${renderInline(cell)}</th>`,
  ).join('')
  const body = rows.map(([title, ...cells]) => {
    const details = cells.map((cell, index) => {
      const text = renderInline(cell)
      if (header[index + 1].text === 'Result') {
        const passed = cell.text === 'Pass' ? ' passed' : ''
        return `<td role="cell"><span class="test-result${passed}">${text}</span></td>`
      }
      return `<td role="cell">${text}</td>`
    }).join('')
    return `<tr role="row"><th scope="row" role="rowheader">${renderInline(title)}</th>${details}</tr>`
  }).join('\n')
  return `<table class="detail-table" role="table">
    <thead role="rowgroup"><tr role="row">${headings}</tr></thead>
    <tbody role="rowgroup">${body}</tbody>
  </table>`
}

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
    const stackedOnMobile = id === 'build-plan-and-materials' || id === 'verification'
    const html = marked.parse(section, stackedOnMobile ? { ...options, renderer: detailRenderer } : options)
    return id ? `<section id="${id}">${html}</section>` : html
  }).join('\n')
}

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const emulator = env.VITE_OPENSEAT_EMULATORS === '1'
  const config = env.VITE_OPENSEAT_FIREBASE_CONFIG || readFileSync(
    new URL('./backend/firebase/web.json', import.meta.url), 'utf8',
  )
  if (!emulator && (command === 'build' || command === 'serve' && mode === 'development')) {
    readSettings(config)
  }
  return {
    define: { 'import.meta.env.VITE_OPENSEAT_FIREBASE_CONFIG': JSON.stringify(config) },
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
  }
})
