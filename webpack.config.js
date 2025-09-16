const path = require('path');

module.exports = [
    // Frontend bundle (existing behavior)
    {
        entry: {
            app: ['./src/index.ts'],
        },
        module: {
            rules: [
                {
                    test: /\.ts$/,
                    use: 'ts-loader',
                    exclude: /node_modules/
                }
            ]
        },
        resolve: {
            extensions: ['.ts', '.js']
        },
        devtool: "source-map",
        output: {
            filename: '[name].bundle.js',
            path: path.resolve(__dirname, 'dist')
        },
        optimization: {
            splitChunks: {
                cacheGroups: {
                    vendor: {
                        test: /[\\/]node_modules[\\/]/,
                        name: 'vendor',
                        chunks: 'all'
                    }
                }
            }
        },
        cache: {
            type: 'filesystem',
            buildDependencies: {
                config: [__filename]
            }
        }
    },
    // Server bundle
    {
        entry: path.resolve(__dirname, './server/server.ts'),
        target: 'node',
        module: {
            rules: [
                {
                    test: /\.ts$/,
                    use: 'ts-loader',
                    exclude: /node_modules/
                }
            ]
        },
        resolve: {
            extensions: ['.ts', '.js']
        },
        output: {
            filename: 'index.js',
            path: path.resolve(__dirname, 'dist-server')
        },
        devtool: 'source-map',
        cache: {
            type: 'filesystem',
            buildDependencies: {
                config: [__filename]
            }
        }
    }
];