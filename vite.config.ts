import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { copyFileSync, mkdirSync, cpSync, existsSync, rmSync, readFileSync, writeFileSync } from 'fs'

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'chrome-extension-build',
      closeBundle() {
        const dist = resolve(__dirname, 'dist')

        // Fix HTML files: move from dist/src/X/ to dist/X/ and fix relative paths
        for (const entry of ['popup', 'sidepanel']) {
          const srcHtml = resolve(dist, 'src', entry, 'index.html')
          const destHtml = resolve(dist, entry, 'index.html')
          if (existsSync(srcHtml)) {
            let html = readFileSync(srcHtml, 'utf-8')
            html = html.replace(/\.\.\/\.\.\//g, '../')
            html = html.replace(new RegExp(`\\.\\.\/${entry}\\/`, 'g'), './')
            writeFileSync(destHtml, html)
          }
        }

        // Remove leftover dist/src/
        const srcLeftover = resolve(dist, 'src')
        if (existsSync(srcLeftover)) {
          rmSync(srcLeftover, { recursive: true })
        }

        // Copy manifest.json
        copyFileSync(
          resolve(__dirname, 'public/manifest.json'),
          resolve(dist, 'manifest.json')
        )
        // Copy _locales
        cpSync(
          resolve(__dirname, 'public/_locales'),
          resolve(dist, '_locales'),
          { recursive: true }
        )
        // Copy icons
        try {
          mkdirSync(resolve(dist, 'icons'), { recursive: true })
          cpSync(
            resolve(__dirname, 'public/icons'),
            resolve(dist, 'icons'),
            { recursive: true }
          )
        } catch {
          // icons may not exist yet
        }
      },
    },
  ],
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      '@ai': resolve(__dirname, 'src/ai'),
    },
  },
  base: './',
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'src/popup/index.html'),
        sidepanel: resolve(__dirname, 'src/sidepanel/index.html'),
        background: resolve(__dirname, 'src/background/index.ts'),
        content: resolve(__dirname, 'src/content/index.ts'),
      },
      output: {
        entryFileNames: (chunkInfo) => {
          // Content script and background must be self-contained
          return `${chunkInfo.name}/index.js`
        },
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
        // Prevent content script from being split into chunks
        manualChunks(id) {
          // Content script deps should be inlined, not chunked
          if (id.includes('src/content/') || id.includes('src/shared/types') || id.includes('src/shared/messages')) {
            return undefined // let rollup decide per entry
          }
          // React and UI deps go to a shared chunk for popup/sidepanel
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) {
            return 'globals'
          }
        },
      },
    },
    emptyOutDir: true,
  },
})
