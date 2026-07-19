/**
 * SurvivalLastStandingParser - shared base for individual last-player-standing
 * modes (Block Drop, Block Party).
 */
(function (global) {
    'use strict';
    const Base = global.Hive.parsers.GamemodeParser;
    const ChatUtils = global.Hive.ChatUtils;

    class SurvivalLastStandingParser extends Base {
        /**
         * Any non-noise line naming exactly one registered player is that
         * player's elimination.
         * @param {string} clean Stripped chat line.
         * @returns {boolean} True when the line scored.
         */
        detect(clean) {
            if (this.isNoise(clean) || this.isLobbyLine(clean)) return false;

            const players = ChatUtils.findPlayersInText(clean, this.state.allPlayerNames());

            if (players.length === 0 && /you died/i.test(clean)) {
                const me = this.resolvePlayerName('You');
                if (me) return this.recordDeath(me) !== false;
                return false;
            }

            if (players.length === 1) {
                return this.recordDeath(players[0]) !== false;
            }
            return false;
        }

        /**
         * True for mode-specific noise lines.
         * @param {string} clean Stripped chat line.
         * @returns {boolean} Whether the line is noise.
         */
        isNoise(clean) {
            return /is the chosen color/i.test(clean) ||
                /color bomb/i.test(clean) ||
                /Powerup/i.test(clean) ||
                /Top Layer/i.test(clean) ||
                /Mystery Chest/i.test(clean) ||
                /XP\s+for breaking/i.test(clean);
        }

        /**
         * Finalise placements from elimination order.
         * @param {string} clean Stripped chat line.
         * @returns {void}
         */
        onGameOver(clean) {
            super.onGameOver(clean);
            this.engine.finalizePlayerPlacements();
            this.state.addLog(`${this.name} game over - placements finalised`, 'info');
        }
    }

    global.Hive.parsers.SurvivalLastStandingParser = SurvivalLastStandingParser;
    if (typeof module !== 'undefined' && module.exports) module.exports = SurvivalLastStandingParser;
})(typeof window !== 'undefined' ? window : globalThis);
