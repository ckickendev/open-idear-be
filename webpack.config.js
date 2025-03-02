module.exports =
{
    // The configuration for the server-side rendering
    name: 'server',
    target: 'node',
    entry: './app/server/serverEntryPrototype.js',
    output: {
        path: './bin/',
        publicPath: 'bin/',
        filename: 'serverEntryPoint.js'
    },
    externals: nodeModules,
    module: {
        loaders: [
            { test: /\.js$/,

                loaders: [
                    // 'imports?document=this',

                    // 'react-hot',
                    'babel-loader'
                    //,'jsx-loader'
                ]
            },
            { test:  /\.json$/, loader: 'json-loader' },
        ]
    },
    plugins: [
    // new webpack.NormalModuleReplacementPlugin("^(react-bootstrap-modal)$", "^(react)$")
    // new webpack.IgnorePlugin(new RegExp("^(react-bootstrap-modal)$"))
    // new webpack.IgnorePlugin(/^\.\/locale$/, /moment$/)
  ]
};