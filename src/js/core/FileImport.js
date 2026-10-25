/**
 * FileImport - infer a gamemode from a dropped log file's name.
 */
(function (global) {
    'use strict';

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

    const FileImport = {
        /**
         * Reduce a filename to its letters for matching.
         * @param {string} filename File name.
         * @returns {string} Lowercased letters only.
         */
        normalize(filename) {
            return String(filename)
                .replace(/\.[^.]+$/, '')
                .toLowerCase()
                .replace(/[^a-z]+/g, '');
        },

        /**
         * Best-effort gamemode match for a filename.
         * @param {string} filename File name.
         * @param {string[]} knownGamemodes Configured gamemode names.
         * @returns {string|null} Canonical gamemode name or null.
         */
        inferGamemode(filename, knownGamemodes) {
            const norm = this.normalize(filename);
            if (!norm) return null;

            for (const g of knownGamemodes) {
                if (g.replace(/\s+/g, '').toLowerCase() === norm) return g;
            }
            if (ALIASES[norm]) {
                const canonical = ALIASES[norm];
                const match = knownGamemodes.find(g =>
                    g.replace(/\s+/g, '').toLowerCase() === canonical.replace(/\s+/g, '').toLowerCase());
                if (match) return match;
            }
            for (const g of knownGamemodes) {
                const gn = g.replace(/\s+/g, '').toLowerCase();
                if (norm.includes(gn) || gn.includes(norm)) return g;
            }
            for (const [alias, canonical] of Object.entries(ALIASES)) {
                if (norm.includes(alias)) {
                    const match = knownGamemodes.find(g =>
                        g.replace(/\s+/g, '').toLowerCase() === canonical.replace(/\s+/g, '').toLowerCase());
                    if (match) return match;
                }
            }
            return null;
        },

        /**
         * True for a plain-text log file.
         * @param {File} file Dropped file.
         * @returns {boolean} Whether it is a .txt/plain file.
         */
        isTextFile(file) {
            return /\.txt$/i.test(file.name) || file.type === 'text/plain';
        }
    };

    FileImport.ALIASES = ALIASES;

    global.Hive = global.Hive || {};
    global.Hive.FileImport = FileImport;

    if (typeof module !== 'undefined' && module.exports) module.exports = FileImport;
})(typeof window !== 'undefined' ? window : globalThis);
