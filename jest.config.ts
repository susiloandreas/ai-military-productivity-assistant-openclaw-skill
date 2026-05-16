import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/skills'],
  testMatch: ['**/__tests__/**/*.ts', '**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: { module: 'CommonJS' } }],
  },
  clearMocks: true,
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/db/**',
    '!src/repositories/**',
    '!src/server.ts',
    '!src/schedulers/**',
    '!src/utils/migrate.ts',
  ],
  coverageThreshold: {
    global: { lines: 70 },
  },
};

export default config;
