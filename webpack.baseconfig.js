const path = require('path');

const CopyPlugin = require('copy-webpack-plugin');

module.exports = {
  entry: {
    worker: './source/worker.js',
    intel: './source/intel.js',
  },
  module: {
    rules: [
      {
        test: /\.(js|ts)x?$/,
        use: ['ts-loader'],
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: ['.ts', '.js'],
  },
  output: {
    filename: '[name].js',
    path: path.resolve(__dirname, 'dist'),
    clean: true,
  },
  plugins: [
    new CopyPlugin({
      patterns: [{ from: 'static' }],
    }),
  ],
};
