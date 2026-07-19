/**
 * ChatUtils - stateless helpers for interpreting Hive chat lines.
 */
(function (global) {
    'use strict';

    const ChatUtils = {
        /**
         * Remove Minecraft color/format codes and collapse leftover spacing.
         * @param {string} text Raw chat line.
         * @returns {string} Cleaned line.
         */
        stripColorCodes(text) {
            if (text == null) return '';
            return String(text)
                .replace(/§\S/g, '')
                .replace(/\s{2,}/g, ' ')
                .trim();
        },

        /**
         * True for a player talking in chat, which must not be parsed as an event.
         * @param {string} rawLine Raw chat line.
         * @returns {boolean} Whether the line is player chat.
         */
        isPlayerChatLine(rawLine) {
            if (!rawLine) return false;
            const stripped = this.stripColorCodes(rawLine);
            if (/\[[^\]]*\]\s*»/.test(stripped)) return true;

            const arrowIdx = stripped.indexOf('»');
            if (arrowIdx === -1) return false;
            const before = stripped.slice(0, arrowIdx).trim();
            if (before === '') return false;
            return /^(?:\d+\s+)?[A-Za-z0-9_]+$/.test(before);
        },

        /**
         * Text following the first arrow.
         * @param {string} line Cleaned chat line.
         * @returns {string|null} Trailing text, or null without an arrow.
         */
        afterArrow(line) {
            const m = line.match(/»\s*(.*)$/);
            return m ? m[1] : null;
        },

        /**
         * Ordinal suffix for a number.
         * @param {number} num Position.
         * @returns {string} "st", "nd", "rd" or "th".
         */
        ordinalSuffix(num) {
            const j = num % 10;
            const k = num % 100;
            if (j === 1 && k !== 11) return 'st';
            if (j === 2 && k !== 12) return 'nd';
            if (j === 3 && k !== 13) return 'rd';
            return 'th';
        },

        /**
         * Format a position as an ordinal.
         * @param {number} num Position.
         * @returns {string} e.g. "3rd".
         */
        ordinal(num) {
            return `${num}${this.ordinalSuffix(num)}`;
        },

        /**
         * Registered player names appearing in the text, in order of appearance.
         * @param {string} text Cleaned chat line.
         * @param {string[]} allPlayerNames Registered names.
         * @returns {string[]} Names found.
         */
        findPlayersInText(text, allPlayerNames) {
            const found = [];
            for (const name of allPlayerNames) {
                const idx = ChatUtils.indexOfName(text, name);
                if (idx !== -1) found.push({ name, idx });
            }
            found.sort((a, b) => a.idx - b.idx);
            return found.map(f => f.name);
        },

        /**
         * Index of a name in text using word-ish boundaries; names may hold spaces.
         * @param {string} text Cleaned chat line.
         * @param {string} name Player name.
         * @returns {number} Index or -1.
         */
        indexOfName(text, name) {
            const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const re = new RegExp(`(^|[^A-Za-z0-9_])${escaped}(?=$|[^A-Za-z0-9_])`);
            const m = re.exec(text);
            if (!m) return -1;
            return m.index + (m[1] ? m[1].length : 0);
        }
    };

    global.Hive = global.Hive || {};
    global.Hive.ChatUtils = ChatUtils;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = ChatUtils;
    }
})(typeof window !== 'undefined' ? window : globalThis);
