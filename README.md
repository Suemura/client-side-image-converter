# 🔒 Client-Side Image Converter

[日本語版 README はこちら](./README-ja.md)

A completely privacy-focused image conversion web application built with Next.js App Router.
All image processing is performed within the browser, ensuring your images are never sent to any server.

## 🔗 Live Demo

https://image-converter.suemura.app/

## 🛡️ Privacy Features

### **Complete Local Processing**

- **No Server Transmission**: Images are never sent to any server
- **Offline Operation**: Works without internet connection once loaded

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

- **MIT License**: Major libraries including Next.js, React, TypeScript
- **Apache-2.0 License**: Some utility libraries
- **LGPL-3.0 License**: Sharp image processing library (used as a library)
- **MPL-2.0 License**: Axe Core (accessibility validation)

All dependencies are commercially usable. Please refer to each library's license file for details.

## 🤝 Contributing

Pull requests and issue reports are welcome!

1. Fork this repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Create a Pull Request

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
