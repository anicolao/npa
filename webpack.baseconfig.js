import {fileURLToPath} from 'node:url';
import path from 'path';
import CopyPlugin from 'copy-webpack-plugin';
import { execaSync } from 'execa';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const common = {
  entry: {
    background: './src/background.js',
    intel: './src/intel.ts',
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
  watchOptions: {
    ignored: /version.js/,
  },
  resolve: {
    extensions: ['.ts', '.js'],
  },
  output: {
    filename: '[name].js',
    path: path.resolve(__dirname, 'dist'),
    clean: false,
  },
  plugins: [
    new CopyPlugin({
      patterns: [{ from: 'static' }],
    }),
    {
      apply: (compiler) => {
        compiler.hooks.watchRun.tap('VersionPlugin', (compilation) => {
					console.log("Run ./bin/version");
					execaSync('./bin/version');
        });
      }
    }
  ],
};
