import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 3000 },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      // The code this exercise asks us to write. Provided files are not ours.
      include: [
        'src/lib/runState.ts',
        'src/lib/state/**',
        'src/lib/retry.ts',
        'src/hooks/**',
        'src/components/failures/**',
      ],
      thresholds: { lines: 100, branches: 100, functions: 100, statements: 100 },
    },
  },
})
