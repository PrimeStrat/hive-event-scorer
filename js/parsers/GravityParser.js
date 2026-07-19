/**
 * GravityParser - like DeathRun with Gravity's "finished all maps" phrasing.
 */
(function (global) {
    'use strict';
    const Base = global.Hive.parsers.GamemodeParser;

    class GravityParser extends Base {
        get name() { return 'Gravity'; }

        /**
         * Gravity line detection.
         * @param {string} clean Stripped chat line.
         * @returns {boolean} True when the line scored.
         */
        detect(clean) {
            return this.detectIndividualPlacement(clean);
        }

        /**
         * Gravity placement patterns plus the generic fallbacks.
         * @returns {Array<{pattern: RegExp, name: number, pos: number}>} Patterns.
         */
        placementRegexes() {
            return [
                { pattern: /(?:»\s*)?(You|[A-Za-z0-9_ ]+?)\s+finished all maps and came in\s+(\d+)(?:st|nd|rd|th)\s+place/i, name: 1, pos: 2 },
                ...super.placementRegexes()
            ];
        }
    }

    global.Hive.parsers.Gravity = GravityParser;
    if (typeof module !== 'undefined' && module.exports) module.exports = GravityParser;
})(typeof window !== 'undefined' ? window : globalThis);
