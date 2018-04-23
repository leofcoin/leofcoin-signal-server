import asyncPlugin from 'rollup-plugin-async';

export default [{
	input: ['src/server.js'],
	output: {
		dir: './',
		format: 'cjs',
		sourcemap: false
	},
  plugins: [
    asyncPlugin()
  ],
	experimentalCodeSplitting: true,
	experimentalDynamicImport: true
}]
