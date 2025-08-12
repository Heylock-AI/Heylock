module.exports = {
  presets: [
    [
      '@babel/preset-env',
      {
        targets: { node: 'current' }, // Ensures compatibility with your Node version
        modules: 'auto', // Keeps ESM syntax unless Jest needs CommonJS
      },
    ],
  ],
};