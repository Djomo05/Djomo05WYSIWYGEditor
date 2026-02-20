/**
 * src/demo/server.js
 * ------------------------------------------------------------------
 *  Demo server for the WYSIWYG Editor.
 *  Run with: node src/demo/server.js
 * ------------------------------------------------------------------
 */

const express = require("express");
const path = require("path");

const app = express();
const PORT = parseInt(process.env.PORT || "3000", 10);

/* Project root is two levels up from src/demo/ */
const PROJECT_ROOT = path.resolve(__dirname, "../..");

/* Serve the built library from /dist */
app.use("/dist", express.static(path.join(PROJECT_ROOT, "dist")));

/* Serve static demo files (index.html lives in this folder) */
app.use(express.static(__dirname));

/* Fallback to index.html */
app.get("/", function (_req, res) {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(PORT, function () {
  console.log("");
  console.log("  WYSIWYG Editor Demo");
  console.log("  ========================");
  console.log("  Running at http://localhost:" + PORT);
  console.log("");
});