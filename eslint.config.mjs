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

// Three or more arguments go one per line. Fewer are left alone so pairs like `params.append('q', query)` stay
// readable, which no core rule allows. Breaking before the first argument is what makes dprint keep the layout.
const argumentsPerLine = {
	meta: {
		type: 'layout',
		fixable: 'whitespace',
		schema: [],
		messages: { split: 'Put each argument on its own line when a call has three or more (see code-style.md).' }
	},
	create(context) {
		const { sourceCode } = context;
		const check = (node) => {
			if (node.arguments.length < 3) {
				return;
			}

			for (const argument of node.arguments) {
				const firstToken = sourceCode.getFirstToken(argument);

				if (sourceCode.getTokenBefore(firstToken).loc.end.line === firstToken.loc.start.line) {
					context.report({
						node: argument,
						messageId: 'split',
						fix: (fixer) => fixer.insertTextBefore(firstToken, '\n')
					});
				}
			}
		};

		return { CallExpression: check, NewExpression: check };
	}
};

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
				},
				{
					// Explicit types on every variable, destructuring included. Exempt: for...of/for...in variables
					// (TypeScript allows no annotation) and initializers that already name the type (`new X()`,
					// `x as T` including const-object enums, arrows with a declared return type).
					selector: 'VariableDeclarator'
						+ ':not([id.typeAnnotation])'
						+ ':not(:matches(ForOfStatement, ForInStatement) > VariableDeclaration > VariableDeclarator)'
						+ ':not([init.type="NewExpression"])'
						+ ':not([init.type="TSAsExpression"])'
						+ ':not([init.type="ArrowFunctionExpression"][init.returnType])',
					message: 'Declare the variable type explicitly (see code-style.md).'
				}
			],

			// --- Code style (code-style.md) -----------------------------------------

			'@typescript-eslint/naming-convention': [
				'error',
				{ selector: 'interface', format: ['PascalCase'], prefix: ['I'] },
				// fields only: private methods stay plain camelCase
				{
					selector: ['classProperty', 'parameterProperty', 'accessor'],
					modifiers: ['private'],
					format: ['camelCase'],
					leadingUnderscore: 'require'
				},
				// constants, private ones included: listing `private` makes this more specific than the field rule above
				{ selector: 'classProperty', modifiers: ['static', 'readonly'], format: ['UPPER_CASE'] },
				{ selector: 'classProperty', modifiers: ['private', 'static', 'readonly'], format: ['UPPER_CASE'] }
			],
			'@typescript-eslint/member-ordering': ['error', {
				default: [
					'public-static-field',
					'protected-static-field',
					'private-static-field',
					'public-instance-field',
					'protected-instance-field',
					'private-instance-field',
					'constructor',
					['public-static-get', 'public-static-set'],
					['protected-static-get', 'protected-static-set'],
					['private-static-get', 'private-static-set'],
					['public-instance-get', 'public-instance-set'],
					['protected-instance-get', 'protected-instance-set'],
					['private-instance-get', 'private-instance-set'],
					'public-static-method',
					'protected-static-method',
					'private-static-method',
					'public-instance-method',
					'protected-instance-method',
					'private-instance-method'
				]
			}],
			'@typescript-eslint/explicit-function-return-type': ['error', {
				allowExpressions: true,
				allowTypedFunctionExpressions: true
			}],

			// --- Quality / bug-class rules ----------------------------------------

			// Parameters an interface requires but an implementation ignores are prefixed with `_`.
			'@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],

			// Catch unawaited promises. Mark deliberate fire-and-forget calls with `void`.
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
	// Turns off any ESLint layout rules so they don't conflict with the formatter
	// (dprint owns layout). Despite its name, this config is a generic list of
	// formatting-related rule disables, not Prettier-specific. Only the block
	// below may follow it.
	eslintConfigPrettier,
	// One argument per line: dprint keeps this layout but can't require it.
	{
		files: ['src/**/*.ts'],
		plugins: { local: { rules: { 'arguments-per-line': argumentsPerLine } } },
		rules: { 'local/arguments-per-line': 'error' }
	}
);
