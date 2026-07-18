/**
 * Preload - exposes the minimal live-capture bridge to the renderer.
 * The renderer detects desktop mode via the presence of window.hiveDesktop.
 */
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('hiveDesktop', {
    /**
     * Start tailing msglog.txt from its current end.
     * @returns {Promise<{ok: boolean, path: string}>} Result with the resolved log path.
     */
    startCapture: () => ipcRenderer.invoke('live-capture-start'),

    /**
     * Stop tailing.
     * @returns {Promise<{ok: boolean}>} Acknowledgement.
     */
    stopCapture: () => ipcRenderer.invoke('live-capture-stop'),

    /**
     * Resolve the msglog path without starting capture.
     * @returns {Promise<string>} Absolute path to msglog.txt.
     */
    getLogPath: () => ipcRenderer.invoke('live-capture-path'),

    /**
     * Subscribe to newly appended log lines.
     * @param {function(string[]): void} handler Called with each batch of new lines.
     * @returns {void}
     */
    onLines: handler => {
        ipcRenderer.on('live-lines', (event, lines) => handler(lines));
    },

    storage: {
        /**
         * Read a stored value from the app data folder (synchronous).
         * @param {string} key Storage key.
         * @returns {string|null} Stored string or null.
         */
        getItem: key => ipcRenderer.sendSync('storage-get', key),

        /**
         * Write a value to the app data folder (synchronous).
         * @param {string} key Storage key.
         * @param {string} value Value to store.
         * @returns {void}
         */
        setItem: (key, value) => { ipcRenderer.sendSync('storage-set', key, value); },

        /**
         * Remove a stored value (synchronous).
         * @param {string} key Storage key.
         * @returns {void}
         */
        removeItem: key => { ipcRenderer.sendSync('storage-remove', key); }
    },

    /**
     * Write a JSON text file into the app data saves folder.
     * @param {string} filename File name.
     * @param {string} text File content.
     * @returns {Promise<{ok: boolean, path: string}>} Result with the saved path.
     */
    saveJson: (filename, text) => ipcRenderer.invoke('save-json', filename, text),

    /**
     * Save PNG bytes via a native save dialog.
     * @param {string} filename Suggested file name.
     * @param {Uint8Array} bytes PNG data.
     * @returns {Promise<{ok: boolean, path: string, canceled: boolean}>} Result.
     */
    saveImage: (filename, bytes) => ipcRenderer.invoke('save-image', filename, bytes),

    /**
     * Open the app data folder in the file explorer.
     * @returns {Promise<{ok: boolean}>} Result.
     */
    openDataFolder: () => ipcRenderer.invoke('open-data-folder'),

    presets: {
        /**
         * List available presets (user presets shadow bundled ones by name).
         * @returns {Promise<Array<{name: string, source: string}>>} Preset entries.
         */
        list: () => ipcRenderer.invoke('presets-list'),

        /**
         * Read a preset's settings object.
         * @param {string} name Preset name.
         * @returns {Promise<Object|null>} Settings or null.
         */
        read: name => ipcRenderer.invoke('presets-read', name),

        /**
         * Save settings as a user preset.
         * @param {string} name Preset name.
         * @param {Object} settings Settings object.
         * @returns {Promise<{ok: boolean, name: string}>} Result.
         */
        save: (name, settings) => ipcRenderer.invoke('presets-save', name, settings),

        /**
         * Delete a user preset.
         * @param {string} name Preset name.
         * @returns {Promise<{ok: boolean}>} Result.
         */
        remove: name => ipcRenderer.invoke('presets-delete', name),

        /**
         * Open the user presets folder in the file explorer.
         * @returns {Promise<{ok: boolean}>} Result.
         */
        openFolder: () => ipcRenderer.invoke('presets-open-folder')
    }
});
