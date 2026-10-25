/**
 * DeathRunParser - scored by individual finish placement plus team-finish bonuses.
 */
(function (global) {
    'use strict';
    const Base = global.Hive.parsers.GamemodeParser;

    class DeathRunParser extends Base {
        get name() { return 'DeathRun'; }

        /**
         * DeathRun line detection.
         * @param {string} clean Stripped chat line.
         * @returns {boolean} True when the line scored.
         */
        detect(clean) {
            return this.detectIndividualPlacement(clean);
        }
    }

    global.Hive.parsers.DeathRun = DeathRunParser;
    if (typeof module !== 'undefined' && module.exports) module.exports = DeathRunParser;
})(typeof window !== 'undefined' ? window : globalThis);
