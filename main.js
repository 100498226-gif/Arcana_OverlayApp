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
} = require('electron');

const FRONTEND_URL = 'http://localhost:5173';

let overlayWindow = null;
let tray = null;
let isVisible = false;

// ── Tray icon (22×22 teal square, replaces with a real icon if you add icon.png) ──
function buildTrayIcon() {
  const size = 22;
  const buf = Buffer.alloc(size * size * 4);
  // Teal #0D9488
  for (let i = 0; i < size * size; i++) {
    buf[i * 4]     = 13;   // R
    buf[i * 4 + 1] = 148;  // G
    buf[i * 4 + 2] = 136;  // B
    buf[i * 4 + 3] = 255;  // A
  }
  return nativeImage.createFromBuffer(buf, { width: size, height: size });
}

// ── Overlay window ─────────────────────────────────────────────────────────────
function createOverlayWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  overlayWindow = new BrowserWindow({
    width: 960,
    height: 580,
    x: Math.round((width - 960) / 2),
    y: Math.round((height - 580) / 2),
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

    let lastCtrlAt = 0;

    uIOhook.on('keydown', (e) => {
      const isCtrl =
        e.keycode === UiohookKey.Ctrl ||
        e.keycode === UiohookKey.CtrlRight;

      if (isCtrl) {
        const now = Date.now();
        if (now - lastCtrlAt > 60 && now - lastCtrlAt < 400) {
          // Two Ctrl presses within 60–400 ms → toggle
          toggleOverlay();
          lastCtrlAt = 0;
        } else {
          lastCtrlAt = now;
        }
      } else {
        // Any non-Ctrl keydown resets the double-press window
        lastCtrlAt = 0;
      }
    });

    uIOhook.start();
    console.log('[Arcana] Ctrl+Ctrl hotkey active (uiohook-napi)');
    return;
  } catch (err) {
    console.warn('[Arcana] uiohook-napi unavailable:', err.message);
  }

  // Fallback: fixed shortcut when Accessibility not yet granted
  console.warn('[Arcana] Fallback hotkey: Ctrl+Shift+Space');
  globalShortcut.register('Control+Shift+Space', toggleOverlay);
}

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
