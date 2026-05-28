const {
  app,
  BrowserWindow,
  globalShortcut,
  Tray,
  Menu,
  shell,
  nativeImage,
  screen,
  dialog,
  systemPreferences,
  ipcMain,
} = require('electron');
const path = require('path');

const FRONTEND_URL = 'http://localhost:5173';

let overlayWindow = null;
let tray = null;
let isVisible = false;

// ── Tray icon ──────────────────────────────────────────────────────────────────
function buildTrayIcon() {
  const iconPath = path.join(__dirname, 'icon.png');
  return nativeImage.createFromPath(iconPath).resize({ width: 22, height: 22 });
}

// ── Overlay window ─────────────────────────────────────────────────────────────
function createOverlayWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  overlayWindow = new BrowserWindow({
    width: 480,
    height: 290,
    x: Math.round((width - 480) / 2),
    y: Math.round((height - 290) / 2),
    frame: false,
    transparent: false,
    backgroundColor: '#F9FAFB',
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    resizable: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  overlayWindow.loadURL(FRONTEND_URL);

  // Inject a thin drag strip so the frameless window can be moved
  overlayWindow.webContents.on('did-finish-load', () => {
    overlayWindow.webContents.executeJavaScript(`
      (() => {
        if (document.getElementById('_arcana_drag')) return;
        const bar = document.createElement('div');
        bar.id = '_arcana_drag';
        bar.style.cssText =
          'position:fixed;top:0;left:0;right:0;height:10px;' +
          '-webkit-app-region:drag;z-index:2147483647;cursor:move;';
        document.body.appendChild(bar);
      })();
    `).catch(() => {});
  });

  // Hide when focus leaves the window
  overlayWindow.on('blur', () => hideOverlay());

  overlayWindow.on('closed', () => { overlayWindow = null; isVisible = false; });
}

function showOverlay() {
  if (!overlayWindow) createOverlayWindow();
  overlayWindow.show();
  overlayWindow.focus();
  isVisible = true;
}

function hideOverlay() {
  if (overlayWindow && isVisible) {
    overlayWindow.hide();
    isVisible = false;
  }
}

function toggleOverlay() {
  isVisible ? hideOverlay() : showOverlay();
}

// ── System tray ────────────────────────────────────────────────────────────────
function createTray() {
  tray = new Tray(buildTrayIcon());
  tray.setToolTip('Arcana');

  const menu = Menu.buildFromTemplate([
    { label: 'Open overlay',    click: () => toggleOverlay() },
    { label: 'Open in browser', click: () => shell.openExternal(FRONTEND_URL) },
    { type: 'separator' },
    { label: 'Quit Arcana',     click: () => app.quit() },
  ]);

  tray.setContextMenu(menu);

  // Left-click also pops the menu (macOS default is right-click only)
  tray.on('click', () => tray.popUpContextMenu());
}

// ── macOS Accessibility permission ────────────────────────────────────────────
function checkAccessibility() {
  if (process.platform !== 'darwin') return true;
  const trusted = systemPreferences.isTrustedAccessibilityClient(false);
  if (!trusted) {
    dialog.showMessageBoxSync({
      type: 'info',
      title: 'Arcana — Accessibility Permission Required',
      message:
        'To use the Ctrl+Ctrl shortcut, Arcana needs Accessibility access.\n\n' +
        'Go to:\nSystem Settings → Privacy & Security → Accessibility\n' +
        'and enable Arcana (or Electron).\n\n' +
        'Then restart the app.\n\n' +
        'Until then, use Ctrl+Shift+Space to toggle the overlay.',
      buttons: ['Open Settings', 'Skip'],
      defaultId: 0,
    });
    // Request permission — opens System Settings automatically
    systemPreferences.isTrustedAccessibilityClient(true);
    return false;
  }
  return true;
}

// ── Ctrl + Ctrl hotkey ─────────────────────────────────────────────────────────
function setupHotkey() {
  const hasAccess = checkAccessibility();

  if (hasAccess) try {
    const { uIOhook, UiohookKey } = require('uiohook-napi');

    let shiftDown = false;

    uIOhook.on('keydown', (e) => {
      const isShift = e.keycode === UiohookKey.Shift || e.keycode === UiohookKey.ShiftRight;
      const isCtrl  = e.keycode === UiohookKey.Ctrl  || e.keycode === UiohookKey.CtrlRight;

      if (isShift) { shiftDown = true; return; }
      if (isCtrl && shiftDown) { toggleOverlay(); return; }
    });

    uIOhook.on('keyup', (e) => {
      const isShift = e.keycode === UiohookKey.Shift || e.keycode === UiohookKey.ShiftRight;
      if (isShift) shiftDown = false;
    });

    uIOhook.start();
    console.log('[Arcana] Shift+Ctrl hotkey active (uiohook-napi)');
    return;
  } catch (err) {
    console.warn('[Arcana] uiohook-napi unavailable:', err.message);
  }

  // Fallback: fixed shortcut when Accessibility not yet granted
  console.warn('[Arcana] Fallback hotkey: Ctrl+Shift+Space');
  globalShortcut.register('Control+Shift+Space', toggleOverlay);
}

// ── Collapse / expand IPC ──────────────────────────────────────────────────────
const FULL_W = 480, FULL_H = 290;
const MINI_W = 360, MINI_H = 80;

ipcMain.on('window:collapse', () => {
  if (!overlayWindow) return;
  overlayWindow.setSize(MINI_W, MINI_H);
});

ipcMain.on('window:expand', () => {
  if (!overlayWindow) return;
  overlayWindow.setSize(FULL_W, FULL_H);
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  overlayWindow.setPosition(
    Math.round((width - FULL_W) / 2),
    Math.round((height - FULL_H) / 2),
  );
});

// ── App lifecycle ──────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  // Hide from macOS Dock — live only in the menu bar
  if (process.platform === 'darwin') app.dock.hide();

  createOverlayWindow();
  createTray();
  setupHotkey();
});

// Keep the process alive when the overlay window is closed
app.on('window-all-closed', () => { /* intentionally empty */ });

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  try {
    require('uiohook-napi').uIOhook.stop();
  } catch {}
});
