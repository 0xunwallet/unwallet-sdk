module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: __dirname + '/tsconfig.json',
    tsconfigRootDir: __dirname,
    sourceType: 'module',
  },
  env: { node: true, es2021: true },
  plugins: ['@typescript-eslint', 'prettier'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:prettier/recommended',
  ],
  rules: {
    'prettier/prettier': 'error',
  },
  ignorePatterns: ['dist', 'node_modules'],
};
