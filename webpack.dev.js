const { merge } = require('webpack-merge');
const common = require('./webpack.baseconfig.js');

module.exports = merge(common, {
  mode: 'development',
  devtool: 'inline-source-map',
  devServer: {
    static: './dist',
  },
});
