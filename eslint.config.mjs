import next from 'eslint-config-next/core-web-vitals';
import ts from 'eslint-config-next/typescript';

export default [
  ...next,
  ...ts,
  { ignores: ['.next/**', 'node_modules/**', 'src/server/db/migrations/**', 'next-env.d.ts'] },
  { rules: { 'react/no-unescaped-entities': 'off', '@typescript-eslint/no-explicit-any': 'error' } },
];
