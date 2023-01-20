module.exports = {
  env: {
    browser: true,
    es2021: true
  },
  extends: ['eslint:recommended', 'airbnb'],
  overrides: [
  ],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module'
  },
  rules: {
    'no-console': 'off',
    'no-await-in-loop': 'off',
    'no-restricted-globals': [1, 'parent']
  },
  globals: {
    logseq: true
  }
}
