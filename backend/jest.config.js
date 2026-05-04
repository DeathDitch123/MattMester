module.exports = {
    testEnvironment: 'node',
    // Frontend shared modulok unit tesztjei is futnak (frontend/__tests__/*.test.js).
    roots: ['<rootDir>', '<rootDir>/../frontend'],
    testMatch: ['**/__tests__/**/*.test.js', '**/*.test.js'],
    collectCoverageFrom: [
        'api/**/*.js',
        'sockets.js',
        'services.js',
        '!**/*.test.js',
        '!node_modules/**'
    ],
    coverageThreshold: {
        global: {
            branches: 50,
            functions: 50,
            lines: 50,
            statements: 50
        }
    },
    testTimeout: 10000,
    detectOpenHandles: true
};
