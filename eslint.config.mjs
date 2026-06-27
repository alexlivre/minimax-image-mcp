import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/", "node_modules/", "output/", "coverage/", "*.config.*"] },
  ...tseslint.configs.recommended,
);
