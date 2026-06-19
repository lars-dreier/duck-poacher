// ESLint flat config.
//
// Roles (see .claude/documentation/code-style.md):
//   - eslint            : the linting engine + core JS rules
//   - typescript-eslint : TypeScript parser + TS-aware rules
//   - eslint-config-prettier : disables ESLint's layout rules so they never fight the formatter (dprint)
//
// dprint owns layout. ESLint owns correctness and project conventions.

import js from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
	// Files ESLint should never look at.
	{
		ignores: ['dist/', 'build/', 'out/', 'node_modules/', 'coverage/', 'tsdown.config.ts']
	},
	// Base JavaScript recommendations.
	js.configs.recommended,
	// Type-aware TypeScript recommendations (uses the TS compiler for type info).
	...tseslint.configs.recommendedTypeChecked,
	{
		files: ['**/*.ts', '**/*.tsx'],
		languageOptions: {
			parserOptions: {
				// Resolve the nearest tsconfig.json automatically for type-aware rules.
				projectService: true,
				tsconfigRootDir: import.meta.dirname
			},
			globals: {
				...globals.node
			}
		},
		rules: {
			// --- Project architectural invariants ---------------------------------

			// OOP: one primary class per file. Expression classes are ignored so
			// small inline/anonymous classes do not trip the rule.
			'max-classes-per-file': ['error', { ignoreExpressions: true, max: 1 }],

			// Always declare access modifiers (public/private/protected) explicitly.
			'@typescript-eslint/explicit-member-accessibility': ['error', { accessibility: 'explicit' }],

			// Enforce the const-object enum pattern: ban TypeScript `enum`.
			'no-restricted-syntax': [
				'error',
				{
					selector: 'TSEnumDeclaration',
					message: 'Use the const-object enum pattern instead of `enum` (see code-style.md).'
				}
			],

			// --- Quality / bug-class rules ----------------------------------------

			// Catch unawaited promises — a common defect in async tool loops.
			'@typescript-eslint/no-floating-promises': 'error'
		}
	},
	// Test tree: not part of the build tsconfig (rootDir: ./src). Resolve its type
	// information from the dedicated tsconfig.test.json instead of the project
	// service so type-aware rules (e.g. no-floating-promises) still apply.
	{
		files: ['test/**/*.ts'],
		languageOptions: {
			parserOptions: {
				projectService: false,
				project: './tsconfig.test.json',
				tsconfigRootDir: import.meta.dirname
			}
		},
		rules: {
			// node:test's describe/it return a Promise that must NOT be awaited at
			// the call site; the rule would flag every block as a false positive.
			// Stays strict in src/, where unawaited promises are real defects.
			'@typescript-eslint/no-floating-promises': 'off'
		}
	},
	// Plain JS / config files are not part of the TS program: disable type-aware
	// rules for them so ESLint does not try to load type information it lacks.
	{
		files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
		...tseslint.configs.disableTypeChecked
	},
	// Must come last: turns off any ESLint layout rules so they don't conflict
	// with the formatter (dprint owns layout). Despite its name, this config is
	// a generic list of formatting-related rule disables, not Prettier-specific.
	eslintConfigPrettier
);
