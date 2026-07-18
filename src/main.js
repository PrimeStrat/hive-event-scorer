/**
 * Electron main process - creates the app window and owns live log capture.
 */
'use strict';

const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');

const POLL_MS = 500;

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
