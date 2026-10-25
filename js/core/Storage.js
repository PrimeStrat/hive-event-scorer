/**
 * Storage - key/value persistence shim. In the desktop app values live in
 * %LOCALAPPDATA%\HiveEventScorer via the preload bridge; in a browser they fall
 * back to localStorage, and headless runs use an in-memory map.
 */
(function (global) {
    'use strict';

    const memory = {};

    /**
     * The desktop storage bridge when running under Electron.
     * @returns {Object|null} Bridge or null.
     */
    function desktop() {
        return (typeof global.hiveDesktop !== 'undefined' && global.hiveDesktop && global.hiveDesktop.storage) || null;
    }

    const Storage = {
        /**
         * Read a stored value.
         * @param {string} key Storage key.
         * @returns {string|null} Stored string or null.
         */
        getItem(key) {
            const d = desktop();
            if (d) {
                const v = d.getItem(key);
                if (v !== null && v !== undefined) return v;
                // Migrate any pre-desktop localStorage value to disk on first read.
                if (typeof localStorage !== 'undefined') {
                    const legacy = localStorage.getItem(key);
                    if (legacy !== null) { d.setItem(key, legacy); return legacy; }
                }
                return null;
            }
            if (typeof localStorage !== 'undefined') return localStorage.getItem(key);
            return Object.prototype.hasOwnProperty.call(memory, key) ? memory[key] : null;
        },

        /**
         * Write a value.
         * @param {string} key Storage key.
         * @param {string} value Value to store.
         * @returns {void}
         */
        setItem(key, value) {
            const d = desktop();
            if (d) { d.setItem(key, String(value)); return; }
            if (typeof localStorage !== 'undefined') { localStorage.setItem(key, value); return; }
            memory[key] = String(value);
        },

        /**
         * Remove a value.
         * @param {string} key Storage key.
         * @returns {void}
         */
        removeItem(key) {
            const d = desktop();
            if (d) { d.removeItem(key); return; }
            if (typeof localStorage !== 'undefined') { localStorage.removeItem(key); return; }
            delete memory[key];
        }
    };

    global.Hive = global.Hive || {};
    global.Hive.Storage = Storage;

    if (typeof module !== 'undefined' && module.exports) module.exports = Storage;
})(typeof window !== 'undefined' ? window : globalThis);
