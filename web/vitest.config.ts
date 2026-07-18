import { defineConfig } from 'vitest/config'
import path from 'node:path'

// tsconfig.jsonの`@/*` → `./src/*`エイリアスと合わせておく（テストコード側でも同じimport書式を使えるように）
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
