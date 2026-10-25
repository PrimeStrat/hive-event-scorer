/**
 * BlockDropParser - individual last-player-standing.
 */
(function (global) {
    'use strict';
    const Base = global.Hive.parsers.SurvivalLastStandingParser;

    class BlockDropParser extends Base {
        /**
         * Gamemode name this parser handles.
         * @returns {string} Gamemode name.
         */
        get name() {
            return 'BlockDrop';
        }
    }

    global.Hive.parsers.BlockDrop = BlockDropParser;
    if (typeof module !== 'undefined' && module.exports) module.exports = BlockDropParser;
})(typeof window !== 'undefined' ? window : globalThis);
