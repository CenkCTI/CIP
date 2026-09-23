import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

const eslintConfig = [
  ...nextVitals,
  ...nextTypeScript,
  {
    ignores: [
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
    ],
  },
  {
    files: ["src/components/investigations/direction-workspace.tsx"],
    rules: {
      // Direction data is loaded from authenticated external endpoints and then
      // committed to local client state. This is synchronization with an
      // external system, which is a valid effect use case.
      "react-hooks/set-state-in-effect": "off",
    },
  },
  {
    files: [
      "src/app/projects/**/collection/page.tsx",
      "src/app/projects/**/sources/page.tsx",
      "src/app/projects/**/sources/**/page.tsx",
      "src/components/investigations/collection/**/*.tsx",
      "src/components/investigations/sources/**/*.tsx",
      "src/components/investigations/source-reader/**/*.tsx",
    ],
    rules: {
      // Turkish analyst-facing copy frequently uses apostrophes for suffixes.
      // Keep this exception scoped to the Stage 2 collection workspace rather
      // than weakening the rule for the rest of the application.
      "react/no-unescaped-entities": "off",
    },
  },
];

export default eslintConfig;
