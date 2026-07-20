# 🔒 Client-Side Image Converter

[日本語版 README はこちら](./README-ja.md)

A completely privacy-focused image conversion web application built with Next.js App Router.
All image processing is performed within the browser, ensuring your images are never sent to any server.
Converts images to JPEG, PNG, WebP, AVIF, and JPEG XL. HEIC/HEIF photos (such as those taken on iPhone), TIFF images, and camera RAW files (CR2 / NEF / ARW / DNG, etc.) are also accepted as input on the convert page and decoded entirely in the browser.
Images can be added by drag & drop, file selection, clipboard paste (Ctrl/⌘+V), or by dropping a folder (subfolders included).
It is also a Progressive Web App (PWA): once loaded it works fully offline, and on supported browsers it can be installed to your home screen or desktop.

## 🔗 Live Demo

https://image-converter.suemura.app/

## ✨ Features

- **Format Conversion**: Convert images to JPEG, PNG, WebP, AVIF, and JPEG XL with quality control and an optional target file size (JPEG / WebP). HEIC/HEIF, TIFF, and camera RAW files (.dng, .cr2, .cr3, .nef, .nrw, .arw, .raf, .orf, .rw2, .pef, .srw) are accepted as input — RAW files are developed entirely in the browser by LibRaw (WASM) using the camera's recorded settings, with optional adjustment of exposure compensation, white balance, and highlight recovery settings.
- **Optimize (keep format)**: Re-compress an image in its original format to shrink the file size without changing the format. PNG uses truly lossless optimization (pixels unchanged), while JPEG and WebP are re-encoded at high quality. If the result isn't smaller, the original file is kept. Supported formats: PNG / JPEG / WebP.
- **Image Cropping**: Visual cropping tool with live preview, aspect-ratio presets (Free / 1:1 / 16:9 / 4:3 / 3:2), 90° rotation and horizontal/vertical flip with automatic EXIF Orientation correction, and a choice between applying one setting to all images or cropping each image individually.
- **Image Editing (Light / Color / Detail / Effects adjustments + Auto enhance + Tone curve + LUT filters)**: Photo-app-style adjustments — Light (exposure, gamma, brightness, contrast, highlights, shadows, whites, blacks), Color (saturation, vibrance, temperature, tint, hue, monochrome), Detail (sharpness, clarity), and Effects (vignette, grain) — applied non-destructively with a real-time before/after preview and applied to multiple images at once. Monochrome is a one-touch toggle that, combined with temperature and tint, works like a color filter for black-and-white photography. Grain is deterministic noise that produces the exact same speckle in the preview and the exported file, and a negative vignette brightens the corners instead of darkening them. One-shot Auto Enhance buttons (Auto Levels / Auto White Balance) analyze the image and set the blacks/whites and temperature/tint sliders for you, giving you a starting point you can fine-tune by hand (pressing them again on the same image yields the same result). A WB eyedropper fixes color casts with a single click: pick a point in the preview that should be neutral gray, and the temperature/tint sliders are set from the clicked color (the eyedropper turns off automatically after applying; press Esc to cancel). A tone curve editor (RGB master / Luminance channels, with the pre-edit luminance histogram shown behind the curve) lets you click to add control points, drag to move them, and double-click to remove them, with a per-channel reset. You can also apply LUT (Look-Up Table) color filters: pick from 11 bundled presets or upload your own `.cube` (1D / 3D) or HALD CLUT PNG, and control the blend strength (applied in the order detail → adjustments → tone curve → LUT → vignette/grain). A live histogram (switchable between RGB and luminance) reflects the edited result (with adjustments, tone curve, and LUT applied) in real time as a guide for black/white level tuning. Rendering uses a WebGL2 shader with an automatic Canvas2D CPU fallback (the preview and the output share the same render path, so they match). Output keeps the original format or converts to JPEG / PNG / WebP / AVIF.
- **Redact (Mosaic / Blur / Fill)**: Hide faces, bystanders, or anything else you don't want to show by dragging rectangles on the preview — add as many regions as you need, move and resize them with 8-direction handles, or delete them individually — and bake in a mosaic (block size), blur (strength), or solid color fill. Mosaic is the default because weak blur can be reversed, and for large regions the mosaic/blur strength is raised automatically so the content stays unreadable. Regions are kept per image (switch with ←/→), and the output keeps the original format with a `_redacted` file name suffix.
- **AI Super-Resolution (Upscaling)**: Enlarge images by 2x or 4x using Real-ESRGAN (a lightweight AI model, ~5MB) running entirely in the browser with ONNX Runtime. The model is cached locally after first use, enabling offline upscaling on repeat visits. Maximum input dimension is 4096px (long side) to balance quality and resource usage. Output keeps the original format with an `_upscaled` suffix, and EXIF metadata can be preserved (JPEG / PNG / WebP only).
- **Background Removal (AI Segmentation)**: Remove image backgrounds using U²-Net (a lightweight AI segmentation model, ~4.6MB) running entirely in the browser with ONNX Runtime. The model is cached locally after first use. Output as transparent PNG or WebP (`_nobg` suffix). Maximum input dimension is 8192px (long side). Runs offline on subsequent visits.
- **EXIF Metadata Management**: View EXIF data (JPEG / PNG / WebP), edit tags, and selectively remove sensitive metadata. GPS location can be removed or rounded to roughly city level (about 1 km precision, JPEG only).
- **EXIF Preservation**: Optionally carry over the original EXIF metadata when converting, cropping, editing, or redacting (JPEG / PNG / WebP output; AVIF is not supported).
- **Tool Chaining (send results to the next tool)**: Hand off conversion/optimization, cropping, editing, redaction, or metadata-cleaning results directly to another tool and keep processing without downloading them first (all five tools — Convert, Crop, Edit, Redact, and the Metadata editor — chain to each other; e.g. edit an image, then convert it to JPEG, then blur out faces, then strip metadata). On the metadata page, selecting tags shows a "remove the selected metadata and send to the next tool" action that cleans the images and hands them off in one step. The handoff happens entirely in browser memory, and the send buttons only appear for tools that accept the resulting formats.
- **Batch Processing**: Process multiple images at once (up to 200 files at a time; files beyond the limit are not added and a warning is shown). On the convert page, batches run in parallel using Web Workers (up to your CPU's core count), keeping the UI responsive even with large or numerous images. Results can be downloaded as a ZIP or (on Chromium-based browsers) directly saved to a local folder without compression.
- **Installable PWA**: Install the app to your home screen or desktop and use every feature offline. A Service Worker precaches all assets on first load, and a theme-aware app icon and Web App Manifest are included.
- **Receive Images from the Share Sheet (Web Share Target)**: Once installed as a PWA (Chromium-based browsers), the app appears in your phone's share sheet — share photos straight from your gallery or camera roll and pick the tool to process them with (convert, crop, edit, redact, or clean metadata). Shared images are handled entirely on your device and are discarded as soon as they are read, so nothing is left behind after a reload.
- **Integrated Workspace ("Image Studio", `/studio`)**: A unified Photoshop-like workspace where you can use all six editing tools (crop, edit, redact, upscale, background removal, metadata) and export directly, all on the same canvas. No need to switch between separate pages — compose your edits in a linear pipeline where each tool's output feeds into the next. Full undo/redo history with up to 20 commits lets you experiment freely: a history panel (desktop: the "History" button on the tool rail / mobile: a bottom sheet) lists every operation across tools in chronological order, and you can click any row to return to that point, redo forward again, or clear the history back to the original images after confirmation (AI results are cached, so restoring never re-runs inference). The built-in export dialog supports JPEG / PNG / WebP / AVIF with quality and optional resizing control.

## 🛡️ Privacy Features

### **Complete Local Processing**

- **No Server Transmission**: Images are never sent to any server
- **Offline Operation**: A Service Worker precaches the app on the first visit, so every feature keeps working with no internet connection
- **Strict Security Headers**: The production site is served with a hash-based Content-Security-Policy (no `unsafe-inline` / `unsafe-eval` scripts), `X-Frame-Options: DENY`, HSTS, and other security headers

## Development Setup

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Run code quality checks
npm run lint

# Format code
npx biome format src/ --write
```

## 🌐 Multi-language Support

This application supports the following languages:

- 🇺🇸 English
- 🇯🇵 Japanese (Default)

You can switch languages in real-time using the language toggle button in the header.

## 📱 Mobile Support

The app is fully responsive and optimized for mobile devices. On screens under 768px, the header navigation collapses into a slide-out menu (accessed via a hamburger button) for a cleaner mobile experience, while all tools maintain their full functionality across all device sizes.

## 🚀 Deployment

### Deploy to Cloudflare Pages

This application can be deployed as a static site to Cloudflare Pages.

#### Deployment Steps

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Build as static site**

   ```bash
   npm run build
   ```

3. **Login to Cloudflare**

   ```bash
   npx wrangler login
   ```

4. **Deploy**

   ```bash
   npm run deploy
   ```

   Or directly:

   ```bash
   npx wrangler pages deploy out --project-name client-side-image-converter
   ```

5. **Local preview (optional)**
   ```bash
   npm run preview
   ```

## 📄 License

This project is published under the [MIT License](LICENSE).

### Dependency Licenses

This project uses open-source libraries with the following licenses:

- **MIT License**: Major libraries including Next.js and React
- **Apache-2.0 License**: Some libraries including TypeScript
- **ISC License**: heic-decode (HEIC/HEIF decoding), libraw-wasm (WASM wrapper of LibRaw used for camera RAW decoding)
- **LGPL-3.0 License**: libheif-js (WASM build of libheif used for HEIC/HEIF decoding; used as an unmodified npm package and isolated in a separate dynamically imported chunk)
- **LGPL-2.1 / CDDL-1.0 (dual license)**: LibRaw (the RAW processing engine bundled in libraw-wasm; used as an unmodified npm package and isolated in a separate dynamically imported chunk)
- **MPL-2.0 License**: Axe Core (accessibility validation)

All dependencies are commercially usable. Please refer to each library's license file for details.

### Bundled Asset Licenses

The preset LUTs bundled in `public/luts/` are provided under **CC0 1.0**. Some are original LUTs generated by `scripts/generate-luts.ts`; others are sourced from freshluts.com under their stated CC0 dedication and renamed to neutral names for the UI. See [`public/luts/CREDITS.md`](public/luts/CREDITS.md) for the full list and provenance.

## 🤝 Contributing

Pull requests and issue reports are welcome!

1. Fork this repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Create a Pull Request

UI / style changes must follow the design guidelines in [DESIGN.md](DESIGN.md): reference the CSS design tokens defined in `src/app/globals.css` instead of hard-coding colors.

## 📞 Support

For questions or support needs, please feel free to contact us at [GitHub Issues](https://github.com/Suemura/client-side-image-converter/issues).

## 📋 Available Scripts

```bash
# Start development server
npm run dev

# Production build
npm run build

# Start production server (after build)
npm start

# Linting
npm run lint

# Deploy to Cloudflare Pages
npm run deploy

# Preview deployed version locally
npm run preview
```
