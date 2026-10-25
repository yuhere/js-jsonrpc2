import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/debug/**',
        'src/**/*.d.ts',
      ],
      // 可选：强制门槛
      // thresholds: {
      //   statements: 90,
      //   branches: 85,
      //   functions: 90,
      //   lines: 90,
      // },
    },
  },
});