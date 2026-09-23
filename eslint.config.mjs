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
];

export default eslintConfig;
