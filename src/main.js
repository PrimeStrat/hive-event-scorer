/**
 * Electron main process - creates the app window and owns live log capture.
 */
'use strict';

const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const fs = require('fs');
const path = require('path');

const POLL_MS = 500;

/**
 * App data folder in the user's local appdata.
 * @returns {string} Absolute path.
 */
function dataDir() {
    return path.join(process.env.LOCALAPPDATA || app.getPath('userData'), 'HiveEventScorer');
}

/**
 * Strip a storage key or file name down to safe characters.
 * @param {string} name Requested name.
 * @returns {string} Sanitized name.
 */
function safeFileName(name) {
    return String(name || '').replace(/[^A-Za-z0-9 ._-]/g, '').trim().slice(0, 80);
}

/**
 * File that stores one key's value.
 * @param {string} key Storage key.
 * @returns {string} Absolute path.
 */
function storageFile(key) {
    return path.join(dataDir(), safeFileName(key) + '.json');
}

/**
 * Folder with presets bundled alongside the app source or packaged resources.
 * @returns {string} Absolute path.
 */
function bundledPresetsDir() {
    if (app.isPackaged) return path.join(process.resourcesPath, 'preset-settings');
    return path.join(__dirname, '..', 'preset-settings');
}

/**
 * Writable folder for user-saved presets.
 * @returns {string} Absolute path.
 */
function userPresetsDir() {
    return path.join(app.getPath('userData'), 'presets');
}

/**
 * Strip a preset name down to a safe file base name.
 * @param {string} name Requested preset name.
 * @returns {string} Sanitized base name.
 */
function safePresetName(name) {
    return String(name || '').replace(/[^A-Za-z0-9 _-]/g, '').trim().slice(0, 60);
}

/**
 * List .json presets in a folder.
 * @param {string} dir Folder to scan.
 * @param {string} source 'bundled' or 'user'.
 * @returns {Array<{name: string, file: string, source: string}>} Entries.
 */
function listPresetDir(dir, source) {
    try {
        return fs.readdirSync(dir)
            .filter(f => /\.json$/i.test(f))
            .map(f => ({ name: f.replace(/\.json$/i, ''), file: path.join(dir, f), source }));
    } catch (err) {
        return [];
    }
}

/**
 * Resolve the msglog path for the current user (HIVE_MSGLOG overrides).
 * @returns {string} Absolute path to msglog.txt.
 */
function msglogPath() {
    if (process.env.HIVE_MSGLOG) return process.env.HIVE_MSGLOG;
    return path.join(process.env.LOCALAPPDATA || '', 'OderSoClient', 'msglog.txt');
}

/**
 * Tails a text file from its current end, emitting only newly appended complete
 * lines; handles truncation by restarting from offset 0.
 */
class LogWatcher {
    /**
     * @param {string} filePath File to tail.
     * @param {function(string[]): void} onLines Callback receiving new complete lines.
     */
    constructor(filePath, onLines) {
        this.filePath = filePath;
        this.onLines = onLines;
        this.offset = 0;
        this.remainder = '';
        this.watcher = null;
        this.pollTimer = null;
        this.reading = false;
    }

    /**
     * Begin tailing from the file's current end.
     * @returns {boolean} False when the file does not exist.
     */
    start() {
        try {
            this.offset = fs.statSync(this.filePath).size;
        } catch (err) {
            return false;
        }
        this.remainder = '';
        try {
            this.watcher = fs.watch(this.filePath, () => this.readNew());
        } catch (err) {
            this.watcher = null;
        }
        this.pollTimer = setInterval(() => this.readNew(), POLL_MS);
        return true;
    }

    /**
     * Stop tailing.
     * @returns {void}
     */
    stop() {
        if (this.watcher) { this.watcher.close(); this.watcher = null; }
        if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
    }

    /**
     * Read bytes appended since the last read and emit complete lines.
     * @returns {void}
     */
    readNew() {
        if (this.reading) return;
        this.reading = true;
        fs.stat(this.filePath, (err, stat) => {
            if (err) { this.reading = false; return; }
            if (stat.size < this.offset) { this.offset = 0; this.remainder = ''; }
            if (stat.size === this.offset) { this.reading = false; return; }

            const stream = fs.createReadStream(this.filePath, {
                start: this.offset, end: stat.size - 1, encoding: 'utf8'
            });
            let chunk = '';
            stream.on('data', d => { chunk += d; });
            stream.on('error', () => { this.reading = false; });
            stream.on('end', () => {
                this.offset = stat.size;
                const text = this.remainder + chunk;
                const parts = text.split(/\r?\n/);
                this.remainder = parts.pop();
                const lines = parts.filter(l => l.trim());
                if (lines.length > 0) this.onLines(lines);
                this.reading = false;
            });
        });
    }
}

let mainWindow = null;
let watcher = null;

/**
 * Create the main application window.
 * @returns {void}
 */
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 860,
        autoHideMenuBar: true,
        icon: path.join(__dirname, 'assets', 'icon.ico'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });
    mainWindow.loadFile(path.join(__dirname, 'index.html'));
    mainWindow.on('closed', () => {
        if (watcher) { watcher.stop(); watcher = null; }
        mainWindow = null;
    });
}

ipcMain.handle('live-capture-start', () => {
    if (watcher) watcher.stop();
    watcher = new LogWatcher(msglogPath(), lines => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('live-lines', lines);
        }
    });
    const ok = watcher.start();
    if (!ok) watcher = null;
    return { ok, path: msglogPath() };
});

ipcMain.handle('live-capture-stop', () => {
    if (watcher) { watcher.stop(); watcher = null; }
    return { ok: true };
});

ipcMain.handle('live-capture-path', () => msglogPath());

ipcMain.handle('presets-list', () => {
    const seen = new Set();
    const all = [...listPresetDir(userPresetsDir(), 'user'), ...listPresetDir(bundledPresetsDir(), 'bundled')];
    return all.filter(p => {
        if (seen.has(p.name)) return false;
        seen.add(p.name);
        return true;
    });
});

ipcMain.handle('presets-read', (event, name) => {
    const base = safePresetName(name);
    if (!base) return null;
    for (const dir of [userPresetsDir(), bundledPresetsDir()]) {
        const file = path.join(dir, base + '.json');
        try {
            return JSON.parse(fs.readFileSync(file, 'utf8'));
        } catch (err) { /* try the next location */ }
    }
    return null;
});

ipcMain.handle('presets-save', (event, name, settings) => {
    const base = safePresetName(name);
    if (!base || !settings) return { ok: false };
    try {
        fs.mkdirSync(userPresetsDir(), { recursive: true });
        fs.writeFileSync(path.join(userPresetsDir(), base + '.json'), JSON.stringify(settings, null, 2), 'utf8');
        return { ok: true, name: base };
    } catch (err) {
        return { ok: false };
    }
});

ipcMain.handle('presets-delete', (event, name) => {
    const base = safePresetName(name);
    if (!base) return { ok: false };
    try {
        fs.unlinkSync(path.join(userPresetsDir(), base + '.json'));
        return { ok: true };
    } catch (err) {
        return { ok: false };
    }
});

ipcMain.handle('presets-open-folder', () => {
    fs.mkdirSync(userPresetsDir(), { recursive: true });
    shell.openPath(userPresetsDir());
    return { ok: true };
});

ipcMain.on('storage-get', (event, key) => {
    try {
        event.returnValue = fs.readFileSync(storageFile(key), 'utf8');
    } catch (err) {
        event.returnValue = null;
    }
});

ipcMain.on('storage-set', (event, key, value) => {
    try {
        fs.mkdirSync(dataDir(), { recursive: true });
        fs.writeFileSync(storageFile(key), String(value), 'utf8');
        event.returnValue = true;
    } catch (err) {
        event.returnValue = false;
    }
});

ipcMain.on('storage-remove', (event, key) => {
    try {
        fs.unlinkSync(storageFile(key));
    } catch (err) { /* already absent */ }
    event.returnValue = true;
});

ipcMain.handle('save-json', (event, filename, text) => {
    const base = safeFileName(filename);
    if (!base) return { ok: false };
    try {
        const dir = path.join(dataDir(), 'saves');
        fs.mkdirSync(dir, { recursive: true });
        const file = path.join(dir, base);
        fs.writeFileSync(file, String(text), 'utf8');
        return { ok: true, path: file };
    } catch (err) {
        return { ok: false };
    }
});

ipcMain.handle('save-image', async (event, filename, bytes) => {
    const res = await dialog.showSaveDialog(mainWindow, {
        title: 'Save poster',
        defaultPath: path.join(app.getPath('pictures'), safeFileName(filename) || 'poster.png'),
        filters: [{ name: 'PNG Image', extensions: ['png'] }]
    });
    if (res.canceled || !res.filePath) return { ok: false, canceled: true };
    try {
        fs.writeFileSync(res.filePath, Buffer.from(bytes));
        return { ok: true, path: res.filePath };
    } catch (err) {
        return { ok: false };
    }
});

ipcMain.handle('open-data-folder', () => {
    fs.mkdirSync(dataDir(), { recursive: true });
    shell.openPath(dataDir());
    return { ok: true };
});

app.whenReady().then(() => {
    createWindow();
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (watcher) { watcher.stop(); watcher = null; }
    app.quit();
});
