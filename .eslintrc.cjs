module.exports = {
  root: true,
  env: {
    browser: true,
    es2020: true,
    node: true,
  },
  extends: [
    'eslint:recommended',
    '@typescript-eslint/recommended',
  ],
  ignorePatterns: ['dist', '.eslintrc.cjs', 'vite.config.ts'],
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  rules: {
    // TypeScript specific rules
    '@typescript-eslint/no-unused-vars': ['error', { 
      argsIgnorePattern: '^_',
      varsIgnorePattern: '^_'
    }],
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-non-null-assertion': 'warn',

    // General code quality
    'no-console': 'off', // Allow console for debugging
    'no-debugger': 'warn',
    'no-unused-vars': 'off', // Use TypeScript version instead
    
    // WebGL/Performance specific  
    'no-magic-numbers': ['warn', { 
      ignore: [-1, 0, 0.5, 1, 2, 3, 4, 8, 16, 32, 60, 64, 120, 256, 512, 1024, 2048, 4096, 8192] 
    }],
    
    // Code style (relaxed for fractal math)
    'prefer-const': 'error',
    'no-var': 'error',
    'eqeqeq': ['error', 'always'],
    'curly': ['error', 'multi-line'],
  },
  overrides: [
    {
      // Shader files are just strings, relax rules
      files: ['**/*.glsl'],
      rules: {
        '@typescript-eslint/no-unused-vars': 'off',
      },
    },
    {
      // Test files can be more relaxed
      files: ['**/*.test.ts', '**/*.spec.ts'],
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
        'no-magic-numbers': 'off',
      },
    },
  ],
};