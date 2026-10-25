/**
 * ChatUtils - stateless helpers for interpreting Hive chat lines.
 */
(function (global) {
    'use strict';

    class ChatUtils {
        /**
         * Remove Minecraft color/format codes and collapse leftover spacing.
         * @param {string} text Raw chat line.
         * @returns {string} Cleaned line.
         */
        static stripColorCodes(text) {
            if (text == null) return '';
            return String(text)
                .replace(/\u00A7\S/g, '')
                .replace(/\s{2,}/g, ' ')
                .trim();
        }

        /**
         * True for a player talking in chat, which must not be parsed as an event.
         * @param {string} rawLine Raw chat line.
         * @returns {boolean} Whether the line is player chat.
         */
        static isPlayerChatLine(rawLine) {
            if (!rawLine) return false;
            const stripped = ChatUtils.stripColorCodes(rawLine);
            if (/\[[^\]]*\]\s*\u00BB/.test(stripped)) return true;

            const arrowIdx = stripped.indexOf('\u00BB');
            if (arrowIdx === -1) return false;
            const before = stripped.slice(0, arrowIdx).trim();
            if (before === '') return false;
            return /^(?:\[[^\]]*\]\s*)*(?:\d+\s+)?[A-Za-z0-9_]+$/.test(before);
        }

        /**
         * Text following the first arrow.
         * @param {string} line Cleaned chat line.
         * @returns {string|null} Trailing text, or null without an arrow.
         */
        static afterArrow(line) {
            const m = line.match(/\u00BB\s*(.*)$/);
            return m ? m[1] : null;
        }

        /**
         * Ordinal suffix for a number.
         * @param {number} num Position.
         * @returns {string} "st", "nd", "rd" or "th".
         */
        static ordinalSuffix(num) {
            const j = num % 10;
            const k = num % 100;
            if (j === 1 && k !== 11) return 'st';
            if (j === 2 && k !== 12) return 'nd';
            if (j === 3 && k !== 13) return 'rd';
            return 'th';
        }

        /**
         * Format a position as an ordinal.
         * @param {number} num Position.
         * @returns {string} e.g. "3rd".
         */
        static ordinal(num) {
            return `${num}${ChatUtils.ordinalSuffix(num)}`;
        }

        /**
         * Registered player names appearing in the text, in order of appearance.
         * @param {string} text Cleaned chat line.
         * @param {string[]} allPlayerNames Registered names.
         * @returns {string[]} Names found.
         */
        static findPlayersInText(text, allPlayerNames) {
            const found = [];
            for (const name of allPlayerNames) {
                const idx = ChatUtils.indexOfName(text, name);
                if (idx !== -1) found.push({ name, idx });
            }
            found.sort((a, b) => a.idx - b.idx);
            return found.map(f => f.name);
        }

        /**
         * Index of a name in text using word-ish boundaries; names may hold spaces.
         * @param {string} text Cleaned chat line.
         * @param {string} name Player name.
         * @returns {number} Index or -1.
         */
        static indexOfName(text, name) {
            const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const re = new RegExp(`(^|[^A-Za-z0-9_])${escaped}(?=$|[^A-Za-z0-9_])`);
            const m = re.exec(text);
            if (!m) return -1;
            return m.index + (m[1] ? m[1].length : 0);
        }

        /**
         * Normalize a gamemode name for tolerant comparison.
         * @param {string} name Gamemode name.
         * @returns {string} Lowercased name without spaces.
         */
        static normalizeMode(name) {
            return String(name || '').replace(/\s+/g, '').toLowerCase();
        }

        /**
         * Case/spacing-tolerant lookup in a map keyed by gamemode name.
         * @param {Object<string, *>} map Keyed map.
         * @param {string} gamemode Gamemode name.
         * @returns {*} The value or null.
         */
        static lookupMode(map, gamemode) {
            if (!gamemode) return null;
            if (map[gamemode]) return map[gamemode];
            const norm = ChatUtils.normalizeMode(gamemode);
            for (const [key, val] of Object.entries(map)) {
                if (ChatUtils.normalizeMode(key) === norm) return val;
            }
            return null;
        }
    }

    global.Hive = global.Hive || {};
    global.Hive.ChatUtils = ChatUtils;

    if (typeof module !== 'undefined' && module.exports) module.exports = ChatUtils;
})(typeof window !== 'undefined' ? window : globalThis);
