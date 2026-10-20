<div align="center">

# ⚡ Ultra Downloader (UDM)

**High-performance, multi-threaded dynamic download manager and media grabber.**  
*A modern, open-source, cyberpunk brutalist alternative to Internet Download Manager (IDM).*

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-green.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-blue.svg)](#cross-platform)
[![Rust](https://img.shields.io/badge/Rust-1.76+-orange.svg)](https://www.rust-lang.org/)
[![Tauri](https://img.shields.io/badge/Tauri-v2-24C8D8.svg)](https://tauri.app/)
[![SolidJS](https://img.shields.io/badge/SolidJS-v1.8-446b9e.svg)](https://www.solidjs.com/)

[Downloads](#-downloads) • [Features](#-features) • [Browser Extension](#-browser-extension) • [Building from Source](#-building-from-source) • [Architecture](#-architecture)

</div>

---

## ⚡ Highlights

- **Dynamic Connection Segmentation**: Splits large files into up to 32 concurrent HTTP range connections, dynamically reallocating segments as connections complete to saturate your bandwidth.
- **Embedded Browser Media Grabber**: Floating video & audio grabber button on YouTube and HTML5 media players supporting stream selection (1080p, 4K, 8K 60fps, Opus/MP4 audio).
- **Embedded Browser Extension**: The executable packages the browser extension internally. Extract it with one click directly from Settings.
- **Native Cross-Platform Tray**: Full tray minimization with a custom rectilinear quick-action menu.
- **Zero Heavy Runtimes**: Pure Rust backend (Tauri v2 + Tokio) with lightweight native WebView frontend (Solid.js). Memory footprint under ~45MB.
- **Strict Brutalist Rectilinear Design**: High-contrast, sharp 90-degree aesthetic (forced square corners even on Windows 11) with Matrix, Amber, Cyan, Mono, and custom color themes.
- **Multi-OS Autostart**: Configurable system tray auto-launch on boot for Windows, macOS, and Linux.
- **Self-Contained & Resilient**: Embedded SQLite task persistence (`rusqlite bundled`) with pause, resume, and file integrity verification.

---

## 📦 Downloads

Download ready-to-run installers and portable packages from [GitHub Releases](https://github.com/bryxnsal/ultra-downloader/releases/latest):

| Operating System | Package Format | Details |
| :--- | :--- | :--- |
| **Windows 10 / 11** | `.exe` (NSIS) / `.msi` | Self-contained, native icons & details embedded |
| **macOS (Apple Silicon)** | `.dmg` | Native `aarch64` build (M1 / M2 / M3 / M4) |
| **macOS (Intel)** | `.dmg` | Native `x86_64` build |
| **Linux (Portable)** | `.AppImage` | Universal single-file executable for any Linux distro |
| **Linux (Debian / Ubuntu)** | `.deb` | Native deb package with app menu and protocol handlers |
| **Browser Extensions** | `.zip` | Packages for **Chrome / Edge / Brave** & **Firefox** |

---

## 🌐 Browser Extension

Ultra Downloader connects with your web browser through a local high-speed WebSocket bridge (`127.0.0.1:51248`).

### Quick Installation:
1. Open **Ultra Downloader** > Go to **Settings** > **Advanced**.
2. Click **"Get Extension"** (or download `ultra-extension-chrome.zip` / `ultra-extension-firefox.zip` from Releases).
3. **Chrome / Edge / Brave**:
   - Go to `chrome://extensions`.
   - Enable **Developer mode** (top right).
   - Click **Load unpacked** and select the extension folder.
4. **Firefox**:
   - Go to `about:debugging#/runtime/this-firefox`.
   - Click **Load Temporary Add-on** and select `manifest.json`.

---

## 🏗️ Architecture

```text
ultra-downloader/
├── core/                        # Rust backend
│   ├── src/
│   │   ├── engine.rs            # Async HTTP multi-connection segment fetcher
│   │   ├── assembler.rs         # Chunk streaming assembler & FFmpeg muxer
│   │   ├── manager.rs           # Task state machine & concurrency controller
│   │   ├── server.rs            # Local HTTP & WebSocket bridge (port 51248)
│   │   ├── storage.rs           # SQLite persistence layer (bundled)
│   │   ├── tray.rs              # Cross-platform tray integration
│   │   ├── embedded_extension.rs# Zip-bundled browser extension payload
│   │   └── lib.rs               # Tauri IPC handlers & Win32 DWM customizations
│   └── tauri.conf.json
├── desktop/                     # Frontend UI
│   ├── src/
│   │   ├── features/downloads/  # Task queue, chunk visualizer & progress modal
│   │   ├── features/settings/   # Network speed limiter, themes, paths, autostart
│   │   ├── features/tray/       # Rectilinear tray context menu
│   │   └── shared/i18n/         # English & Spanish locale files
│   └── index.html
├── extension/                   # Browser Addon (Manifest V3)
│   ├── background.js            # Interception & download routing
│   ├── content.js               # Media player grabber overlay
│   └── panel.css                # Brutalist badge & format selection styles
└── .github/workflows/           # Automated multi-platform release CI/CD
```

---

## 🛠️ Building from Source

### 1. Requirements
- [Rust](https://www.rust-lang.org/tools/install) `1.76+`
- [Node.js](https://nodejs.org/) `v20+`
- [pnpm](https://pnpm.io/) `v9+`
- **Linux only**:
  ```bash
  sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
  ```

### 2. Clone and install
```bash
git clone https://github.com/bryxnsal/ultra-downloader.git
cd ultra-downloader
pnpm install
```

### 3. Development
```bash
pnpm dev
```

### 4. Production Build
```bash
pnpm build
```
The compiled binaries and installers will be located in `core/target/release/bundle/`.

---

## 🤝 Contributing

Contributions are warmly welcomed! Please read [CONTRIBUTING.md](CONTRIBUTING.md) for details on code style, UI design rules, and our pull request process.

---

## 📄 License

This project is licensed under the **GNU General Public License v3.0 (GPL-3.0)** — see the [LICENSE](LICENSE) file for details.
