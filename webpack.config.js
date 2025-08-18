const path = require("path");
const TerserPlugin = require("terser-webpack-plugin");

// 개발 환경 감지
const isDevelopment = process.env.NODE_ENV === "development";

module.exports = {
  mode: isDevelopment ? "development" : "production",
  entry: {
    popup: "./popup.js",
    stats: "./stats.js",
    background: "./background.js",
    content: "./content.js",
  },
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "[name].js",
    clean: true,
  },
  target: "web",
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: "babel-loader",
          options: {
            presets: [
              [
                "@babel/preset-env",
                {
                  targets: {
                    browsers: ["> 1%", "last 2 versions", "not ie <= 8"],
                  },
                  modules: false, // 트리셰이킹을 위해 ES6 모듈 유지
                },
              ],
            ],
          },
        },
      },
    ],
  },
  resolve: {
    extensions: [".js"],
  },
  optimization: {
    minimize: !isDevelopment,
    minimizer: isDevelopment
      ? []
      : [
          new TerserPlugin({
            terserOptions: {
              compress: {
                drop_console: true, // console.log 제거
                drop_debugger: true,
              },
              mangle: true,
            },
            extractComments: false,
          }),
        ],
    splitChunks: {
      chunks: "all",
      cacheGroups: {
        vendor: {
          test: /[\\/]node_modules[\\/]/,
          name: "vendors",
          chunks: "all",
          priority: 10,
        },
        common: {
          name: "common",
          minChunks: 2,
          chunks: "all",
          priority: 5,
        },
      },
    },
  },
  performance: {
    hints: "warning",
    maxEntrypointSize: 512000,
    maxAssetSize: 512000,
  },
};
