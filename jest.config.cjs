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
  },
};

module.exports = {
  projects: [
    { ...baseConfig, displayName: 'unit', testMatch: ['<rootDir>/tests/unit/**/*.test.ts'] },
    { ...baseConfig, displayName: 'integration', testMatch: ['<rootDir>/tests/integration/**/*.test.ts'] },
    // bench/ is kept out of the public repo.
    ...(require('node:fs').existsSync(`${__dirname}/bench`)
      ? [{ ...baseConfig, displayName: 'bench', roots: ['<rootDir>/bench'], testMatch: ['<rootDir>/bench/visuals/*.test.ts'] }]
      : []),
  ],
};
