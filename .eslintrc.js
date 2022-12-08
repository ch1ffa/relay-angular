module.exports = {
    extends: [
        'plugin:@typescript-eslint/recommended', // Uses the recommended rules from the @typescript-eslint/eslint-plugin
        'prettier', // Uses eslint-config-prettier to disable ESLint rules from @typescript-eslint/eslint-plugin that would conflict with prettier
    ],
    ignorePatterns: ['*.js', 'examples/', 'node_modules', '*.d.ts'],
    parserOptions: {
        ecmaVersion: 2018, // Allows for the parsing of modern ECMAScript features
        sourceType: 'module', // Allows for the use of imports
    },
    parser: '@typescript-eslint/parser',
    plugins: ['@typescript-eslint', 'prettier', 'eslint-plugin-import'],
    settings: {
        'import/parsers': {
            '@typescript-eslint/parser': ['.ts', '.tsx'],
        },
        'import/resolver': {
            typescript: {},
        },
    },
    rules: {
        'import/no-extraneous-dependencies': [2, { devDependencies: ['**/test.tsx', '**/test.ts'] }],
        indent: [2, 4, { SwitchCase: 1 }],
        'lines-between-class-members': ['error', 'always', { exceptAfterSingleLine: true }],
        'space-before-function-paren': ['error', { anonymous: 'always', named: 'never', asyncArrow: 'ignore' }],
        'max-len': [
            2,
            {
                code: 140,
                ignorePattern: '^import [^,]+ from |^export | implements',
            },
        ],
        '@typescript-eslint/no-unused-vars': [2, { argsIgnorePattern: '^_' }],
        'object-curly-newline': ['error', { consistent: true }],
        '@typescript-eslint/no-explicit-any': [0],
        'no-plusplus': ['error', { allowForLoopAfterthoughts: true }],
        'linebreak-style': [0],
        '@typescript-eslint/no-use-before-define': [0],
        'import/order': [
            'error',
            {
                groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
                alphabetize: {
                    order: 'asc',
                    caseInsensitive: true,
                },
            },
        ],
    },
};
