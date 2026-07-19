/**
 * BlockDropParser - individual last-player-standing.
 */
(function (global) {
    'use strict';
    const Base = global.Hive.parsers.SurvivalLastStandingParser;

    class BlockDropParser extends Base {
        get name() { return 'BlockDrop'; }
    }

    global.Hive.parsers.BlockDrop = BlockDropParser;
    if (typeof module !== 'undefined' && module.exports) module.exports = BlockDropParser;
})(typeof window !== 'undefined' ? window : globalThis);
