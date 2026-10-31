/** @type {import('ts-jest').JestConfigWithTsJest} */
const baseConfig = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: { module: 'CommonJS', isolatedModules: true } }],
  },
  roots: ['<rootDir>/tests'],
  setupFilesAfterEnv: ['<rootDir>/tests/setupWindow.ts', '<rootDir>/tests/setupDom.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^figure-worker$': '<rootDir>/tests/figureWorker.js',
  },
};

module.exports = {
  globalSetup: '<rootDir>/tests/globalSetup.js',
  projects: [
    { ...baseConfig, displayName: 'unit', testMatch: ['<rootDir>/tests/unit/**/*.test.ts'] },
    { ...baseConfig, displayName: 'integration', testMatch: ['<rootDir>/tests/integration/**/*.test.ts'] },
    { ...baseConfig, displayName: 'bench', roots: ['<rootDir>/bench'], testMatch: ['<rootDir>/bench/figure/*.test.ts'] },
  ],
};
