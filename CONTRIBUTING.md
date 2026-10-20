# Contributing to Ultra Downloader

Thank you for your interest in contributing to **Ultra Downloader**! Whether you are fixing bugs, optimizing chunk segmentation performance, adding new browser integrations, or improving translations, we welcome your contributions.

---

## 🛠️ Monorepo Architecture

Ultra Downloader is organized into clean workspaces:

```text
ultra-downloader/
├── core/         # Rust backend (Tauri v2, Tokio engine, chunk assembler, SQLite, tray, local bridge)
├── desktop/      # Solid.js + TypeScript + TailwindCSS brutalist GUI
├── extension/    # Cross-browser extension (Manifest V3 for Chrome/Edge/Firefox)
└── .github/      # CI/CD automated release workflows
```

---

## 🚀 Getting Started

### Prerequisites

- **Rust**: Latest stable (`rustup update stable`).
- **Node.js**: `v20+` or `v22+`.
- **Package Manager**: `pnpm` (`v9+`).
- **Platform-specific requirements**:
  - **Windows**: Visual Studio C++ Build Tools & Edge WebView2.
  - **Linux**: `sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev`.
  - **macOS**: Xcode Command Line Tools.

### Setup Repository

```bash
# Clone the repository
git clone https://github.com/bryxnsal/ultra-downloader.git
cd ultra-downloader

# Install frontend and workspace dependencies
pnpm install
```

### Running in Development

```bash
# Start frontend and Rust desktop backend with hot-reload
pnpm dev

# Or run frontend in browser-only mode for rapid UI styling
pnpm dev:desktop
```

### Code Formatting & Checks

Before submitting a Pull Request, make sure both Rust and TypeScript code compile cleanly:

```bash
# Check Rust backend
cargo check --manifest-path core/Cargo.toml

# Build frontend
pnpm build:desktop
```

---

## 🎨 UI Guidelines & Style Rules

Ultra Downloader adheres to a strict **cyberpunk / rectilinear brutalist** aesthetic:
- **No rounded borders**: Always use square corners (`rounded-none`, `border-radius: 0 !important`).
- **Forced Rectilinear Windows**: Window decorations and OS corners are explicitly squared (`DWMWCP_DONOTROUND` on Windows 11).
- **High-contrast themes**: Respect active color variables (`var(--bg-primary)`, `var(--bg-secondary)`, `var(--bg-surface)`, `var(--accent)`, `var(--border)`, `var(--text-main)`, `var(--text-muted)`).
- **Internationalization**: Do not hardcode English/Spanish user-facing strings; always add corresponding keys to `desktop/src/shared/i18n/en.json` and `desktop/src/shared/i18n/es.json`.

---

## 📦 Pull Request Process

1. **Fork** the repository and create your branch from `main`:
   ```bash
   git checkout -b feat/my-new-feature
   ```
2. Commit your changes with clear, descriptive commit messages:
   ```bash
   git commit -m "feat: optimize chunk buffer flushing in dynamic assembler"
   ```
3. Push to your fork:
   ```bash
   git push origin feat/my-new-feature
   ```
4. Open a **Pull Request** against the `main` branch.
5. Ensure CI builds pass and describe what your PR solves or improves.

---

## 📄 License

By contributing to **Ultra Downloader**, you agree that your contributions will be licensed under the **GNU General Public License v3.0 (GPL-3.0)**.
