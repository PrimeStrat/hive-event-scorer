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
    }
});
