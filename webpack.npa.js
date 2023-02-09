import { merge } from 'webpack-merge';
import { common } from './webpack.baseconfig.js';

export default merge(common, {
  mode: 'production',
  devServer: {
    static: './dist',
  },
});
