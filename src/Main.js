/**
 * Electron main process - creates the app window and owns live log capture.
 */
'use strict';

const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const fs = require('fs');
const path = require('path');

const POLL_MS = 500;
const NEWLINE = 0x0A;

/**
 * File system locations and name sanitizing for app data, presets and the chat log.
 */
class AppFiles {
    /**
     * App data folder in the user's local appdata.
     * @returns {string} Absolute path.
     */
    static dataDir() {
        return path.join(process.env.LOCALAPPDATA || app.getPath('userData'), 'HiveEventScorer');
    }

    /**
     * Strip a storage key or file name down to safe characters.
     * @param {string} name Requested name.
     * @returns {string} Sanitized name.
     */
    static safeFileName(name) {
        return String(name || '').replace(/[^A-Za-z0-9 ._-]/g, '').trim().slice(0, 80);
    }

    /**
     * Strip a preset name down to a safe file base name.
     * @param {string} name Requested preset name.
     * @returns {string} Sanitized base name.
     */
    static safePresetName(name) {
        return String(name || '').replace(/[^A-Za-z0-9 _-]/g, '').trim().slice(0, 60);
    }

    /**
     * File that stores one key's value.
     * @param {string} key Storage key.
     * @returns {string} Absolute path.
     */
    static storageFile(key) {
        return path.join(AppFiles.dataDir(), AppFiles.safeFileName(key) + '.json');
    }

    /**
     * Folder with presets bundled alongside the app source or packaged resources.
     * @returns {string} Absolute path.
     */
    static bundledPresetsDir() {
        if (app.isPackaged) return path.join(process.resourcesPath, 'PresetSettings');
        return path.join(__dirname, '..', 'PresetSettings');
    }

    /**
     * Writable folder for user-saved presets.
     * @returns {string} Absolute path.
     */
    static userPresetsDir() {
        return path.join(app.getPath('userData'), 'presets');
    }

    /**
     * List .json presets in a folder.
     * @param {string} dir Folder to scan.
     * @param {string} source 'bundled' or 'user'.
     * @returns {Array<{name: string, file: string, source: string}>} Entries.
     */
    static listPresetDir(dir, source) {
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
    static msglogPath() {
        if (process.env.HIVE_MSGLOG) return process.env.HIVE_MSGLOG;
        return path.join(process.env.LOCALAPPDATA || '', 'OderSoClient', 'msglog.txt');
    }
}

/**
 * Tails a text file from its current end, emitting only newly appended complete
 * lines; handles truncation by restarting from offset 0.
 */
class LogWatcher {
    /**
     * Create a watcher for one file.
     * @param {string} filePath File to tail.
     * @param {function(string[]): void} onLines Callback receiving new complete lines.
     */
    constructor(filePath, onLines) {
        this.filePath = filePath;
        this.onLines = onLines;
        this.offset = 0;
        this.remainder = Buffer.alloc(0);
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
        this.remainder = Buffer.alloc(0);
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
        if (this.watcher) {
            this.watcher.close();
            this.watcher = null;
        }
        if (this.pollTimer) {
            clearInterval(this.pollTimer);
            this.pollTimer = null;
        }
    }

    /**
     * Read bytes appended since the last read and emit complete lines. Bytes are
     * only decoded up to the last newline so a multi-byte character is never split.
     * @returns {void}
     */
    readNew() {
        if (this.reading) return;
        this.reading = true;
        fs.stat(this.filePath, (err, stat) => {
            if (err) {
                this.reading = false;
                return;
            }
            if (stat.size < this.offset) {
                this.offset = 0;
                this.remainder = Buffer.alloc(0);
            }
            if (stat.size === this.offset) {
                this.reading = false;
                return;
            }

            const stream = fs.createReadStream(this.filePath, { start: this.offset, end: stat.size - 1 });
            const chunks = [this.remainder];
            stream.on('data', d => chunks.push(d));
            stream.on('error', () => {
                this.reading = false;
            });
            stream.on('end', () => {
                this.offset = stat.size;
                const bytes = Buffer.concat(chunks);
                const cut = bytes.lastIndexOf(NEWLINE);
                this.remainder = cut === -1 ? bytes : bytes.subarray(cut + 1);
                if (cut !== -1) {
                    const lines = bytes.subarray(0, cut).toString('utf8').split(/\r?\n/).filter(l => l.trim());
                    if (lines.length > 0) this.onLines(lines);
                }
                this.reading = false;
            });
        });
    }
}

/**
 * Owns the main window and the live log watcher, and answers renderer IPC.
 */
class MainApp {
    static mainWindow = null;
    static watcher = null;

    /**
     * Create the main application window.
     * @returns {void}
     */
    static createWindow() {
        MainApp.mainWindow = new BrowserWindow({
            width: 1280,
            height: 860,
            autoHideMenuBar: true,
            icon: path.join(__dirname, 'Assets', 'Icon.ico'),
            webPreferences: {
                preload: path.join(__dirname, 'Preload.js'),
                contextIsolation: true,
                nodeIntegration: false
            }
        });
        MainApp.mainWindow.loadFile(path.join(__dirname, 'Main.html'));
        MainApp.mainWindow.on('closed', () => {
            MainApp.stopWatcher();
            MainApp.mainWindow = null;
        });
    }

    /**
     * Stop and drop the live log watcher when one is running.
     * @returns {void}
     */
    static stopWatcher() {
        if (MainApp.watcher) {
            MainApp.watcher.stop();
            MainApp.watcher = null;
        }
    }

    /**
     * Start tailing the chat log and forward new lines to the window.
     * @returns {{ok: boolean, path: string}} Result with the resolved log path.
     */
    static startCapture() {
        MainApp.stopWatcher();
        const logPath = AppFiles.msglogPath();
        MainApp.watcher = new LogWatcher(logPath, lines => {
            if (MainApp.mainWindow && !MainApp.mainWindow.isDestroyed()) {
                MainApp.mainWindow.webContents.send('live-lines', lines);
            }
        });
        const ok = MainApp.watcher.start();
        if (!ok) MainApp.watcher = null;
        return { ok, path: logPath };
    }

    /**
     * Stop tailing the chat log.
     * @returns {{ok: boolean}} Acknowledgement.
     */
    static stopCapture() {
        MainApp.stopWatcher();
        return { ok: true };
    }

    /**
     * List presets; user presets shadow bundled ones with the same name.
     * @returns {Array<{name: string, file: string, source: string}>} Entries.
     */
    static listPresets() {
        const seen = new Set();
        const all = [
            ...AppFiles.listPresetDir(AppFiles.userPresetsDir(), 'user'),
            ...AppFiles.listPresetDir(AppFiles.bundledPresetsDir(), 'bundled')
        ];
        return all.filter(p => {
            if (seen.has(p.name)) return false;
            seen.add(p.name);
            return true;
        });
    }

    /**
     * Read a preset, checking the user folder before the bundled one.
     * @param {string} name Preset name.
     * @returns {Object|null} Settings object or null.
     */
    static readPreset(name) {
        const base = AppFiles.safePresetName(name);
        if (!base) return null;
        for (const dir of [AppFiles.userPresetsDir(), AppFiles.bundledPresetsDir()]) {
            try {
                return JSON.parse(fs.readFileSync(path.join(dir, base + '.json'), 'utf8'));
            } catch (err) {
                continue;
            }
        }
        return null;
    }

    /**
     * Save settings as a user preset.
     * @param {string} name Preset name.
     * @param {Object} settings Settings object.
     * @returns {{ok: boolean, name: string}} Result.
     */
    static savePreset(name, settings) {
        const base = AppFiles.safePresetName(name);
        if (!base || !settings) return { ok: false };
        try {
            fs.mkdirSync(AppFiles.userPresetsDir(), { recursive: true });
            fs.writeFileSync(path.join(AppFiles.userPresetsDir(), base + '.json'), JSON.stringify(settings, null, 2), 'utf8');
            return { ok: true, name: base };
        } catch (err) {
            return { ok: false };
        }
    }

    /**
     * Delete a user preset; bundled presets are never touched.
     * @param {string} name Preset name.
     * @returns {{ok: boolean}} Result.
     */
    static deletePreset(name) {
        const base = AppFiles.safePresetName(name);
        if (!base) return { ok: false };
        try {
            fs.unlinkSync(path.join(AppFiles.userPresetsDir(), base + '.json'));
            return { ok: true };
        } catch (err) {
            return { ok: false };
        }
    }

    /**
     * Open a folder in the file explorer, creating it first.
     * @param {string} dir Folder to open.
     * @returns {{ok: boolean}} Result.
     */
    static openFolder(dir) {
        fs.mkdirSync(dir, { recursive: true });
        shell.openPath(dir);
        return { ok: true };
    }

    /**
     * Read one stored value.
     * @param {string} key Storage key.
     * @returns {string|null} Stored string or null.
     */
    static storageGet(key) {
        try {
            return fs.readFileSync(AppFiles.storageFile(key), 'utf8');
        } catch (err) {
            return null;
        }
    }

    /**
     * Write one stored value.
     * @param {string} key Storage key.
     * @param {string} value Value to store.
     * @returns {boolean} Whether the write worked.
     */
    static storageSet(key, value) {
        try {
            fs.mkdirSync(AppFiles.dataDir(), { recursive: true });
            fs.writeFileSync(AppFiles.storageFile(key), String(value), 'utf8');
            return true;
        } catch (err) {
            return false;
        }
    }

    /**
     * Remove one stored value.
     * @param {string} key Storage key.
     * @returns {boolean} Always true.
     */
    static storageRemove(key) {
        try {
            fs.unlinkSync(AppFiles.storageFile(key));
        } catch (err) {
            return true;
        }
        return true;
    }

    /**
     * Write a JSON text file into the app data saves folder.
     * @param {string} filename File name.
     * @param {string} text File content.
     * @returns {{ok: boolean, path: string}} Result with the saved path.
     */
    static saveJson(filename, text) {
        const base = AppFiles.safeFileName(filename);
        if (!base) return { ok: false };
        try {
            const dir = path.join(AppFiles.dataDir(), 'saves');
            fs.mkdirSync(dir, { recursive: true });
            const file = path.join(dir, base);
            fs.writeFileSync(file, String(text), 'utf8');
            return { ok: true, path: file };
        } catch (err) {
            return { ok: false };
        }
    }

    /**
     * Save PNG bytes through a native save dialog.
     * @param {string} filename Suggested file name.
     * @param {Uint8Array} bytes PNG data.
     * @returns {Promise<{ok: boolean, path: string, canceled: boolean}>} Result.
     */
    static async saveImage(filename, bytes) {
        const res = await dialog.showSaveDialog(MainApp.mainWindow, {
            title: 'Save poster',
            defaultPath: path.join(app.getPath('pictures'), AppFiles.safeFileName(filename) || 'poster.png'),
            filters: [{ name: 'PNG Image', extensions: ['png'] }]
        });
        if (res.canceled || !res.filePath) return { ok: false, canceled: true };
        try {
            fs.writeFileSync(res.filePath, Buffer.from(bytes));
            return { ok: true, path: res.filePath };
        } catch (err) {
            return { ok: false };
        }
    }
}

ipcMain.handle('live-capture-start', () => MainApp.startCapture());
ipcMain.handle('live-capture-stop', () => MainApp.stopCapture());
ipcMain.handle('live-capture-path', () => AppFiles.msglogPath());
ipcMain.handle('presets-list', () => MainApp.listPresets());
ipcMain.handle('presets-read', (event, name) => MainApp.readPreset(name));
ipcMain.handle('presets-save', (event, name, settings) => MainApp.savePreset(name, settings));
ipcMain.handle('presets-delete', (event, name) => MainApp.deletePreset(name));
ipcMain.handle('presets-open-folder', () => MainApp.openFolder(AppFiles.userPresetsDir()));
ipcMain.on('storage-get', (event, key) => {
    event.returnValue = MainApp.storageGet(key);
});
ipcMain.on('storage-set', (event, key, value) => {
    event.returnValue = MainApp.storageSet(key, value);
});
ipcMain.on('storage-remove', (event, key) => {
    event.returnValue = MainApp.storageRemove(key);
});
ipcMain.handle('save-json', (event, filename, text) => MainApp.saveJson(filename, text));
ipcMain.handle('save-image', (event, filename, bytes) => MainApp.saveImage(filename, bytes));
ipcMain.handle('open-data-folder', () => MainApp.openFolder(AppFiles.dataDir()));

app.whenReady().then(() => {
    MainApp.createWindow();
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) MainApp.createWindow();
    });
});

app.on('window-all-closed', () => {
    MainApp.stopWatcher();
    app.quit();
});
