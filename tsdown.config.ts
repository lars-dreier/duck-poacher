import { defineConfig } from 'tsdown';

export default defineConfig({
	entry: ['src/index.ts'],
	format: ['esm', 'cjs'],
	unbundle: true,
	dts: true,
	sourcemap: false,
	clean: true,
	target: 'node18',
	outDir: 'dist'
});
