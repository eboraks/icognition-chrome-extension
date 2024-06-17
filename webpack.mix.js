let mix = require('laravel-mix');
const webpack = require('webpack')

require('mix-env-file');
require('laravel-mix-replace-in-file')

mix.env(process.env.ENV_FILE);

mix.setPublicPath('./')
    .css('assets/css/popup.css', 'dist/css')
    .css('assets/css/content-script.css', 'dist/css')
    .copy('assets/images', 'dist/images')
    .copy('assets/popup.html', 'dist')
    .copy('assets/manifest.json', 'dist')
    .js('assets/js/background.js', 'dist/js')
    .js('assets/js/content-script.js', 'dist/js')
    .js('assets/js/utils.js', 'dist/js')
    .js('assets/js/popup.js', 'dist/js').vue()
    .options({
        processCssUrls: false
    });

mix.replaceInFile( {
    files: 'dist/manifest.json',
    from: /CHROME_EXTENSION_ID/g,
    to: process.env.MIX_CHROME_EXTENSION_ID,
});
mix.webpackConfig ({
    plugins: [
    new webpack.DefinePlugin({
        __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false'
    }),
    ],
})