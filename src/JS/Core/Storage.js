/**
 * Storage - key/value persistence shim. In the desktop app values live in
 * %LOCALAPPDATA%\HiveEventScorer via the preload bridge; in a browser they fall
 * back to localStorage, and headless runs use an in-memory map.
 */
(function (global) {
    'use strict';

    const memory = {};

    class Storage {
        /**
         * The desktop storage bridge when running under Electron.
         * @returns {Object|null} Bridge or null.
         */
        static desktop() {
            return (global.hiveDesktop && global.hiveDesktop.storage) || null;
        }

        /**
         * Read a stored value; a legacy localStorage value is moved to disk on first read.
         * @param {string} key Storage key.
         * @returns {string|null} Stored string or null.
         */
        static getItem(key) {
            const d = Storage.desktop();
            if (d) {
                const v = d.getItem(key);
                if (v !== null && v !== undefined) return v;
                if (typeof localStorage !== 'undefined') {
                    const legacy = localStorage.getItem(key);
                    if (legacy !== null) {
                        d.setItem(key, legacy);
                        return legacy;
                    }
                }
                return null;
            }
            if (typeof localStorage !== 'undefined') return localStorage.getItem(key);
            return Object.prototype.hasOwnProperty.call(memory, key) ? memory[key] : null;
        }

        /**
         * Write a value.
         * @param {string} key Storage key.
         * @param {string} value Value to store.
         * @returns {void}
         */
        static setItem(key, value) {
            const d = Storage.desktop();
            if (d) {
                d.setItem(key, String(value));
                return;
            }
            if (typeof localStorage !== 'undefined') {
                localStorage.setItem(key, value);
                return;
            }
            memory[key] = String(value);
        }

        /**
         * Remove a value.
         * @param {string} key Storage key.
         * @returns {void}
         */
        static removeItem(key) {
            const d = Storage.desktop();
            if (d) {
                d.removeItem(key);
                return;
            }
            if (typeof localStorage !== 'undefined') {
                localStorage.removeItem(key);
                return;
            }
            delete memory[key];
        }
    }

    global.Hive = global.Hive || {};
    global.Hive.Storage = Storage;

    if (typeof module !== 'undefined' && module.exports) module.exports = Storage;
})(typeof window !== 'undefined' ? window : globalThis);
