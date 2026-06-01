# Arcana — Desktop Overlay App

A macOS desktop overlay for Arcana, built with Electron. It wraps the exact same frontend (`Arcanaaiuiuxdesign`) in a native macOS window — no duplicate code, no separate design.

The overlay lives in the macOS menu bar and can be toggled instantly from any application, without switching windows or opening a browser.

---

## Prerequisites

- macOS (Apple Silicon or Intel)
- Node.js 18+
- The **backend** running at `http://localhost:8000`
- The **frontend** running at `http://localhost:5173`

Both must be running before launching the overlay. See `ArcanaAI_whole-project` for setup instructions.

---

## Installation & Run

```bash
npm install    # first time only — also rebuilds uiohook-napi for your Electron version
npm start
```

The Arcana logo will appear in your macOS menu bar.

---

## First-Time: Accessibility Permission

On first launch a dialog will appear asking for Accessibility access. This is required for the **Shift+Ctrl** keyboard shortcut to work.

1. Click **"Open Settings"** in the dialog
2. Go to **System Settings → Privacy & Security → Accessibility**
3. Enable **Arcana** (or Electron) in the list
4. Restart the overlay: `Ctrl+C` → `npm start`

Until permission is granted, the fallback shortcut **Ctrl+Shift+Space** can be used instead.

---

## How to Use

| Action | How |
|--------|-----|
| **Toggle overlay on/off** | **Shift+Ctrl** from any application |
| **Open overlay from menu bar** | Click the Arcana logo → "Open overlay" |
| **Open in browser instead** | Click the Arcana logo → "Open in browser" |
| **Collapse to slim bar** | Click the minimize button (top-left, inside the overlay) |
| **Expand from slim bar** | Click the expand icon in the slim bar |
| **Quit** | Click the Arcana logo → "Quit Arcana" |

The overlay hides automatically when you click outside it. It does not appear in the macOS Dock — it lives only in the menu bar.

---

## Technology Stack

| Technology | Role |
|-----------|------|
| Electron 31 | Native macOS window and menu bar integration |
| uiohook-napi | Global keyboard hook for the Shift+Ctrl shortcut (requires Accessibility permission) |
| electron-rebuild | Recompiles native modules for the installed Electron version |

---

## Repository Structure

```
Arcana_OverlayApp/
├── main.js        # Electron main process: tray icon, overlay window,
│                  # hotkey detection, IPC handlers (collapse/expand)
├── preload.js     # Exposes window.electronAPI to the renderer
│                  # (collapseWindow, expandWindow, isElectron flag)
├── icon.png       # Arcana logo used as the macOS menu bar icon
└── package.json
```

### How it works

- `main.js` creates a frameless `BrowserWindow` loading `http://localhost:5173`
- A thin invisible drag strip is injected into the page so the frameless window can be moved
- `uiohook-napi` monitors global key events; pressing Shift then Ctrl triggers `toggleOverlay()`
- IPC messages `window:collapse` and `window:expand` resize the window (480×290 ↔ 360×80)
- The tray menu is built with Electron's `Menu` API; left-clicking the icon pops the menu

---

*Arcana — built by Ignacio, 2026*
