# 📝 @djomo05/wysiwyg-editor

A **fully-featured, modular WYSIWYG editor** built with TypeScript.
Zero runtime dependencies. Ships with full type declarations.
Docker-ready.

---

## ✨ Features

| Category         | Details                                                                                |
| ---------------- | -------------------------------------------------------------------------------------- |
| **Formatting**   | Bold, italic, underline, strikethrough, subscript, superscript, text/background colour |
| **Blocks**       | Headings (H1–H3), paragraph, blockquote, code block, horizontal rule                   |
| **Lists**        | Ordered, unordered, indent, outdent                                                    |
| **Alignment**    | Left, center, right, justify                                                           |
| **Links**        | Insert / edit / unlink with new-tab toggle                                             |
| **Images**       | URL, file upload, drag & drop, clipboard paste, custom upload handler                  |
| **Videos**       | YouTube, Vimeo, Dailymotion, direct .mp4/.webm/.ogg, preview in modal                  |
| **Tables**       | Configurable rows × columns with optional header row                                   |
| **Source view**  | Switch to raw HTML editing in a syntax-coloured `<textarea>`                           |
| **Preview**      | Read-only rendered preview mode                                                        |
| **Fullscreen**   | Expand to fill the viewport without breaking parent layouts                            |
| **Keyboard**     | Ctrl+B, Ctrl+I, Ctrl+U, Ctrl+Z/Y, Tab for indent                                       |
| **Status bar**   | Word count, character count, current mode indicator                                    |
| **Plug-in API**  | Register custom plug-ins; disable built-in ones                                        |
| **Sanitisation** | Strips `<script>`, `on*` attributes, `javascript:` URLs                                |
| **Print**        | Toolbar button hides chrome and prints the content                                     |

---

## 📦 Installation

```bash
# npm
npm install @djomo05/wysiwyg-editor

# yarn
yarn add @djomo05/wysiwyg-editor

# pnpm
pnpm add @djomo05/wysiwyg-editor
```

---

## 🚀 Quick Start

### ESM / TypeScript

```ts
import { createEditor } from "@djomo05/wysiwyg-editor";
import "@djomo05/wysiwyg-editor/styles"; // import the CSS

const editor = createEditor({
  container: "#editor",
  height: "400px",
  placeholder: "Start typing…",
});

// Listen for content changes
editor.on("change", () => {
  console.log(editor.getContent());
});
```

### UMD / Script Tag

```html
<link
  rel="stylesheet"
  href="node_modules/@djomo05/wysiwyg-editor/dist/styles/editor.css"
/>
<script src="node_modules/@djomo05/wysiwyg-editor/dist/umd/wysiwyg-editor.min.js"></script>

<div id="editor"></div>

<script>
  var editor = WysiwygEditor.createEditor({
    container: "#editor",
    content: "<p>Hello World!</p>",
  });
</script>
```

---

## ⚙️ Configuration

```ts
createEditor({
  // Required – CSS selector or HTMLElement
  container: "#editor",

  // Optional – all have sensible defaults
  content: "<p>Initial content</p>",
  height: "400px",
  width: "100%",
  placeholder: "Write something…",
  readOnly: false,
  className: "my-editor",

  // Toolbar: pass an array of ToolbarItems, or `false` to hide
  toolbar: undefined, // uses default layout

  // Plug-ins
  plugins: [],
  disablePlugins: [], // e.g. ["video", "table"]

  // Image handling
  maxImageSize: 5 * 1024 * 1024, // 5 MB
  acceptedImageTypes: ["image/jpeg", "image/png", "image/gif", "image/webp"],
  imageUploadHandler: async (file) => {
    const fd = new FormData();
    fd.append("image", file);
    const res = await fetch("/api/upload", { method: "POST", body: fd });
    const { url } = await res.json();
    return url;
  },

  // Security
  sanitizeEmbeds: true,

  // Custom CSS injected into the content area
  contentCSS: "body { font-size: 16px; }",
});
```

---

## 📖 API Reference

### Content

| Method             | Returns  | Description                      |
| ------------------ | -------- | -------------------------------- |
| `getContent()`     | `string` | Current HTML content             |
| `setContent(html)` | `void`   | Replace content (auto-sanitised) |
| `getTextContent()` | `string` | Plain-text content               |
| `clear()`          | `void`   | Clear the editor                 |
| `insertHTML(html)` | `void`   | Insert HTML at caret             |

### Commands

| Method                     | Returns   | Description                |
| -------------------------- | --------- | -------------------------- |
| `execCommand(cmd, value?)` | `void`    | Execute a document command |
| `queryCommandState(cmd)`   | `boolean` | Is the command active?     |

### Selection

| Method               | Returns | Description                  |
| -------------------- | ------- | ---------------------------- |
| `saveSelection()`    | `void`  | Save the current caret range |
| `restoreSelection()` | `void`  | Restore the saved range      |

### Modes

| Method               | Returns   | Description              |
| -------------------- | --------- | ------------------------ |
| `toggleSource()`     | `void`    | Toggle HTML source view  |
| `togglePreview()`    | `void`    | Toggle read-only preview |
| `toggleFullscreen()` | `void`    | Toggle fullscreen        |
| `isSourceMode()`     | `boolean` | Source mode active?      |
| `isPreviewMode()`    | `boolean` | Preview mode active?     |
| `isFullscreen()`     | `boolean` | Fullscreen active?       |

### Events

| Method                | Description           |
| --------------------- | --------------------- |
| `on(event, handler)`  | Subscribe to an event |
| `off(event, handler)` | Unsubscribe           |
| `emit(event, data?)`  | Emit an event         |

#### Event Names

| Event              | Payload              | When                      |
| ------------------ | -------------------- | ------------------------- |
| `change`           | `{ html }`           | Content changes           |
| `focus`            | –                    | Editor gains focus        |
| `blur`             | –                    | Editor loses focus        |
| `ready`            | –                    | Editor initialised        |
| `destroy`          | –                    | Editor destroyed          |
| `modeChange`       | `{ mode }`           | Source/preview/wysiwyg    |
| `fullscreenChange` | `{ fullscreen }`     | Fullscreen toggled        |
| `selectionChange`  | –                    | Caret or selection moved  |
| `beforeCommand`    | `{ action/command }` | Before a command executes |
| `afterCommand`     | `{ action/command }` | After a command executes  |

### Lifecycle

| Method      | Description                    |
| ----------- | ------------------------------ |
| `destroy()` | Remove editor, clean up events |

---

## 🔌 Custom Plug-in Guide

```ts
import { EditorPlugin, EditorAPI, createEditor } from "@djomo05/wysiwyg-editor";

const myPlugin: EditorPlugin = {
  name: "emoji-picker",

  init(editor: EditorAPI): void {
    // Listen for a custom toolbar action
    editor.on("afterCommand", (data: any) => {
      if (data?.action === "emoji") {
        editor.saveSelection();
        // … show a picker UI …
        editor.restoreSelection();
        editor.insertHTML("😊");
      }
    });
  },

  destroy(): void {
    // Clean up any DOM or listeners you created
  },
};

const editor = createEditor({
  container: "#editor",
  plugins: [myPlugin],
  // Add a matching toolbar button:
  toolbar: [
    // ... spread default items ...,
    { action: "emoji", label: "Emoji", icon: "😊" },
  ],
});
```

---

## 🎨 Theming

Override CSS custom properties on `:root` or a parent selector:

```css
.my-theme {
  --we-primary: #8b5cf6;
  --we-primary-hover: #7c3aed;
  --we-toolbar-bg: #faf5ff;
  --we-border: #e9d5ff;
  --we-bg-secondary: #faf5ff;
  --we-radius: 12px;
}
```

```html
<div id="editor" class="my-theme"></div>
```

---

## 🐳 Docker

### Build and run

```bash
# Build the image
docker build -t wysiwyg-editor .

# Run the container
docker run -p 3000:3000 wysiwyg-editor

# Or use docker-compose
docker-compose up --build
```

Then open **http://localhost:3000** to see the demo.

### Development with live-reload

The `docker-compose.yml` mounts `./src` as a read-only volume so you
can rebuild inside the container during development:

```bash
docker-compose up --build
# In another terminal:
docker exec -it wysiwyg-editor npm run build
```

---

## 🧪 Testing

```bash
# Run unit tests
npm test

# Run with coverage
npm test -- --coverage
```

---

## 🏗️ Building

```bash
# Full build (ESM + CJS + UMD + types + CSS)
npm run build

# Clean build artifacts
npm run clean
```

### Output structure

```
dist/
├── esm/          # ES Module build
│   └── index.js
├── cjs/          # CommonJS build
│   └── index.js
├── umd/          # UMD build (browser <script> tag)
│   └── wysiwyg-editor.min.js
├── types/        # TypeScript declarations
│   └── index.d.ts
└── styles/
    └── editor.css
```

---

## 📄 License

MIT © Djomo05
