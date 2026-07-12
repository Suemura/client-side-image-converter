# 🔒 Client-Side Image Converter

[日本語版 README はこちら](./README-ja.md)

A completely privacy-focused image conversion web application built with Next.js App Router.
All image processing is performed within the browser, ensuring your images are never sent to any server.
Converts images to JPEG, PNG, WebP, and AVIF. HEIC/HEIF photos (such as those taken on iPhone) and TIFF images are also accepted as input on the convert page and decoded entirely in the browser.
Images can be added by drag & drop, file selection, clipboard paste (Ctrl/⌘+V), or by dropping a folder (subfolders included).
It is also a Progressive Web App (PWA): once loaded it works fully offline, and on supported browsers it can be installed to your home screen or desktop.

## 🔗 Live Demo

https://image-converter.suemura.app/

## ✨ Features

- **Format Conversion**: Convert images to JPEG, PNG, WebP, and AVIF with quality control and an optional target file size (JPEG / WebP). HEIC/HEIF and TIFF are accepted as input.
- **Optimize (keep format)**: Re-compress an image in its original format to shrink the file size without changing the format. PNG uses truly lossless optimization (pixels unchanged), while JPEG and WebP are re-encoded at high quality. If the result isn't smaller, the original file is kept. Supported formats: PNG / JPEG / WebP.
- **Image Cropping**: Visual cropping tool with live preview, aspect-ratio presets (Free / 1:1 / 16:9 / 4:3 / 3:2), 90° rotation and horizontal/vertical flip with automatic EXIF Orientation correction, and a choice between applying one setting to all images or cropping each image individually.
- **Image Editing (Light / Color / Detail / Effects adjustments + Auto enhance + Tone curve + LUT filters)**: Photo-app-style adjustments — Light (exposure, gamma, brightness, contrast, highlights, shadows, whites, blacks), Color (saturation, vibrance, temperature, tint, hue, monochrome), Detail (sharpness, clarity), and Effects (vignette, grain) — applied non-destructively with a real-time before/after preview and applied to multiple images at once. Monochrome is a one-touch toggle that, combined with temperature and tint, works like a color filter for black-and-white photography. Grain is deterministic noise that produces the exact same speckle in the preview and the exported file, and a negative vignette brightens the corners instead of darkening them. One-shot Auto Enhance buttons (Auto Levels / Auto White Balance) analyze the image and set the blacks/whites and temperature/tint sliders for you, giving you a starting point you can fine-tune by hand (pressing them again on the same image yields the same result). A WB eyedropper fixes color casts with a single click: pick a point in the preview that should be neutral gray, and the temperature/tint sliders are set from the clicked color (the eyedropper turns off automatically after applying; press Esc to cancel). A tone curve editor (RGB master / Luminance channels, with the pre-edit luminance histogram shown behind the curve) lets you click to add control points, drag to move them, and double-click to remove them, with a per-channel reset. You can also apply LUT (Look-Up Table) color filters: pick from 11 bundled presets or upload your own `.cube` (1D / 3D) or HALD CLUT PNG, and control the blend strength (applied in the order detail → adjustments → tone curve → LUT → vignette/grain). A live histogram (switchable between RGB and luminance) reflects the edited result (with adjustments, tone curve, and LUT applied) in real time as a guide for black/white level tuning. Rendering uses a WebGL2 shader with an automatic Canvas2D CPU fallback (the preview and the output share the same render path, so they match). Output keeps the original format or converts to JPEG / PNG / WebP / AVIF.
- **EXIF Metadata Management**: View EXIF data (JPEG / PNG / WebP), edit tags, and selectively remove sensitive metadata. GPS location can be removed or rounded to roughly city level (about 1 km precision, JPEG only).
- **EXIF Preservation**: Optionally carry over the original EXIF metadata when converting, cropping, or editing (JPEG / PNG / WebP output; AVIF is not supported).
- **Tool Chaining (send results to the next tool)**: Hand off conversion/optimization, cropping, editing, or metadata-cleaning results directly to another tool and keep processing without downloading them first (all four tools — Convert, Crop, Edit, and the Metadata editor — chain to each other; e.g. edit an image, then convert it to JPEG, then crop, then strip metadata). On the metadata page, selecting tags shows a "remove the selected metadata and send to the next tool" action that cleans the images and hands them off in one step. The handoff happens entirely in browser memory, and the send buttons only appear for tools that accept the resulting formats.
- **Batch Processing**: Process multiple images at once (up to 200 files at a time; files beyond the limit are not added and a warning is shown). On the convert page, batches run in parallel using Web Workers (up to your CPU's core count), keeping the UI responsive even with large or numerous images.
- **Installable PWA**: Install the app to your home screen or desktop and use every feature offline. A Service Worker precaches all assets on first load, and a theme-aware app icon and Web App Manifest are included.

## 🛡️ Privacy Features

### **Complete Local Processing**

- **No Server Transmission**: Images are never sent to any server
- **Offline Operation**: A Service Worker precaches the app on the first visit, so every feature keeps working with no internet connection

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
- **ISC License**: heic-decode (HEIC/HEIF decoding)
- **LGPL-3.0 License**: libheif-js (WASM build of libheif used for HEIC/HEIF decoding; used as an unmodified npm package and isolated in a separate dynamically imported chunk)
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
