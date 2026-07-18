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
