import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from 'node:fs'
import path from 'node:path'

// 本番ビルド時に dist/sw.js 内の __BUILD_ID__ を現在のタイムスタンプに置換。
// これにより毎回 sw.js の中身が変わり、ブラウザが新しい SW を検出 → クライアント
// が自動リロードする。
function injectSwBuildId() {
  const buildId = String(Date.now())
  return {
    name: 'inject-sw-build-id',
    apply: 'build',
    writeBundle(options) {
      const outDir = options.dir || path.resolve('dist')
      const swPath = path.join(outDir, 'sw.js')
      if (!fs.existsSync(swPath)) return
      const before = fs.readFileSync(swPath, 'utf-8')
      const after = before.replace(/__BUILD_ID__/g, buildId)
      fs.writeFileSync(swPath, after)
      console.log(`[pwa-sw] BUILD_ID = ${buildId}`)
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), injectSwBuildId()],
  base: './',
})
