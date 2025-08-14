const path = require("path");

module.exports = [
  // date-fns UMD bundle
  {
    entry: "./src/date-fns-bundle.js",
    output: {
      path: path.resolve(__dirname, "vendor"),
      filename: "date-fns.umd.js",
      library: {
        name: "dateFns",
        type: "umd",
        export: "default",
      },
      globalObject: "window",
    },
    mode: "production",
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
  },
  // date-fns-tz UMD bundle
  {
    entry: "./src/date-fns-tz-bundle.js",
    output: {
      path: path.resolve(__dirname, "vendor"),
      filename: "date-fns-tz.umd.js",
      library: {
        name: "dateFnsTz",
        type: "umd",
        export: "default",
      },
      globalObject: "window",
    },
    mode: "production",
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
  },
];
