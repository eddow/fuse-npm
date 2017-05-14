const {FuseBox, JSONPlugin, TypeScriptHelpers, UglifyJSPlugin, CSSPlugin, EnvPlugin, VuePlugin, HTMLPlugin} = require("fuse-box");
const fuse = FuseBox.init({
	homeDir: "src",
	output: "dist/$name.js",
	cache: false,
	sourceMaps: true,
	plugins: [
		TypeScriptHelpers(),
		//EnvPlugin({NODE_ENV: production ? "production" : "development"}),
		CSSPlugin(),
		//production && UglifyJSPlugin(),
		VuePlugin(),
		HTMLPlugin(),
		JSONPlugin()
	],
	package: 'fuse-npm',
	globals: {'fuse-npm': '*'}
});
fuse.bundle("fuse-npm")
	.watch()
	.instructions('> [index.ts]');

fuse.run();
