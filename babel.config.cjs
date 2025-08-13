module.exports = {
  presets: [
    [
      '@babel/preset-env',
      {
        modules: 'auto', // Keeps ESM syntax unless Jest needs CommonJS
      },
    ],
  ],
};