/**
 * rollup.config.mjs
 * ------------------------------------------------------------------
 * Produces three bundle formats so consumers can use whichever they
 * prefer:
 *   • ESM  – tree-shakeable, modern bundlers (Vite, webpack 5, etc.)
 *   • CJS  – Node / older bundlers
 *   • UMD  – plain <script> tag in the browser
 * ------------------------------------------------------------------
 */
import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import typescript from "@rollup/plugin-typescript";
import terser from "@rollup/plugin-terser";

export default [
  /* ========================  ESM  ======================== */
  {
    input: "src/index.ts",
    output: {
      file: "dist/esm/index.js",
      format: "esm",
      sourcemap: true,
    },
    plugins: [
      resolve(),
      commonjs(),
      typescript({ tsconfig: "./tsconfig.json", outDir: "dist/esm" }),
    ],
  },

  /* ========================  CJS  ======================== */
  {
    input: "src/index.ts",
    output: {
      file: "dist/cjs/index.js",
      format: "cjs",
      sourcemap: true,
      exports: "named",
    },
    plugins: [
      resolve(),
      commonjs(),
      typescript({ tsconfig: "./tsconfig.json", outDir: "dist/cjs" }),
    ],
  },

  /* ========================  UMD  ======================== */
  {
    input: "src/index.ts",
    output: {
      file: "dist/umd/wysiwyg-editor.min.js",
      format: "umd",
      name: "WysiwygEditor",          // global variable name
      sourcemap: true,
      exports: "named",
    },
    plugins: [
      resolve(),
      commonjs(),
      typescript({ tsconfig: "./tsconfig.json", outDir: "dist/umd" }),
      terser(),                         // minify for production
    ],
  },
];