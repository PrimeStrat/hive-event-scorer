/**
 * FileImport - infer a gamemode from a dropped log file's name.
 */
(function (global) {
    'use strict';

    const ChatUtils = global.Hive.ChatUtils;

    const ALIASES = {
        sg: 'Survival Games',
        survival: 'Survival Games',
        survivalgames: 'Survival Games',
        bedwars: 'BedWars',
        bw: 'BedWars',
        skywars: 'SkyWars',
        sw: 'SkyWars',
        deathrun: 'DeathRun',
        dr: 'DeathRun',
        gravity: 'Gravity',
        blockdrop: 'BlockDrop',
        bd: 'BlockDrop',
        blockparty: 'Block Party',
        bp: 'Block Party'
    };

    class FileImport {
        /**
         * Reduce a filename to its letters for matching.
         * @param {string} filename File name.
         * @returns {string} Lowercased letters only.
         */
        static normalize(filename) {
            return String(filename)
                .replace(/\.[^.]+$/, '')
                .toLowerCase()
                .replace(/[^a-z]+/g, '');
        }

        /**
         * Configured gamemode matching a canonical alias target.
         * @param {string} canonical Canonical gamemode name.
         * @param {string[]} knownGamemodes Configured gamemode names.
         * @returns {string|null} Configured name or null.
         */
        static findKnown(canonical, knownGamemodes) {
            const norm = ChatUtils.normalizeMode(canonical);
            return knownGamemodes.find(g => ChatUtils.normalizeMode(g) === norm) || null;
        }

        /**
         * Best-effort gamemode match for a filename.
         * @param {string} filename File name.
         * @param {string[]} knownGamemodes Configured gamemode names.
         * @returns {string|null} Canonical gamemode name or null.
         */
        static inferGamemode(filename, knownGamemodes) {
            const norm = FileImport.normalize(filename);
            if (!norm) return null;

            const exact = FileImport.findKnown(norm, knownGamemodes);
            if (exact) return exact;
            if (ALIASES[norm]) {
                const match = FileImport.findKnown(ALIASES[norm], knownGamemodes);
                if (match) return match;
            }
            for (const g of knownGamemodes) {
                const gn = ChatUtils.normalizeMode(g);
                if (norm.includes(gn) || gn.includes(norm)) return g;
            }
            for (const [alias, canonical] of Object.entries(ALIASES)) {
                if (!norm.includes(alias)) continue;
                const match = FileImport.findKnown(canonical, knownGamemodes);
                if (match) return match;
            }
            return null;
        }

        /**
         * True for a plain-text log file.
         * @param {File} file Dropped file.
         * @returns {boolean} Whether it is a .txt/plain file.
         */
        static isTextFile(file) {
            return /\.txt$/i.test(file.name) || file.type === 'text/plain';
        }
    }

    FileImport.ALIASES = ALIASES;

    global.Hive = global.Hive || {};
    global.Hive.FileImport = FileImport;

    if (typeof module !== 'undefined' && module.exports) module.exports = FileImport;
})(typeof window !== 'undefined' ? window : globalThis);
