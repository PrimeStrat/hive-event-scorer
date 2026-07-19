/**
 * BlockPartyParser - individual last-player-standing.
 */
(function (global) {
    'use strict';
    const Base = global.Hive.parsers.SurvivalLastStandingParser;

    class BlockPartyParser extends Base {
        get name() { return 'Block Party'; }
    }

    global.Hive.parsers['Block Party'] = BlockPartyParser;
    if (typeof module !== 'undefined' && module.exports) module.exports = BlockPartyParser;
})(typeof window !== 'undefined' ? window : globalThis);
