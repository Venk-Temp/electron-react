# Amdital Desktop

Desktop application built with Electron and React.

## Quick Start

```bash
# Install dependencies
npm install

# Development
npm run dev
npm run electron-d

# Build for Windows
npm run dist:win

# Build for Mac (for Mac users)
npm run dist:mac
```

## Environment and URLs

- Development login URL: `https://app-amdital.dev.diginnovators.site/login`
- Production login URL: `https://app.amdital.com/login`

The app automatically uses the production URL for production builds and the development URL when running in development.

## For Mac Teammate

To build DMG file on Mac:
```bash
npm install
npm run dist:mac
```
Find the DMG file in `release/` folder.

## Output Files

- **Windows**: `Amdital-POC-1.0.0-win-x64.exe`
- **Mac**: `Amdital-POC-1.0.0-mac-universal.dmg`