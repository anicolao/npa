import {fileURLToPath} from 'node:url';
import path from 'path';
import CopyPlugin from 'copy-webpack-plugin';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const common = {
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
