/**
 * SurvivalGamesParser - kills plus individual survival; in-game teams are
 * "District N" and resolve purely via player membership.
 */
(function (global) {
    'use strict';
    const Base = global.Hive.parsers.GamemodeParser;

    class SurvivalGamesParser extends Base {
        get name() { return 'Survival Games'; }

        /**
         * Survival Games line detection.
         * @param {string} clean Stripped chat line.
         * @returns {boolean} True when the line scored.
         */
        detect(clean) {
            if (this.detectDistrictElimination(clean)) return true;
            if (this.detectKilledBy(clean)) return true;
            if (this.detectGenericKill(clean)) return true;
            // Lone registered player starting the line = kill on an unregistered victim.
            if (!this.isLobbyLine(clean) && !/\bhas \d+(\.\d+)? hearts?\b/i.test(clean)) {
                const { ChatUtils } = global.Hive;
                const players = ChatUtils.findPlayersInText(clean, this.state.allPlayerNames());
                if (players.length === 1 && !this.selfDeathPhrases.some(p => clean.toLowerCase().includes(p))) {
                    const name = players[0];
                    const stripped = clean.replace(/^»\s*/, '');
                    if (stripped.startsWith(name) && this.state.findPlayerTeam(name)) {
                        return this.recordKillPointOnly(name) !== false;
                    }
                }
            }
            return false;
        }

        /**
         * Log the Survival Games game over.
         * @param {string} clean Stripped chat line.
         * @returns {void}
         */
        onGameOver(clean) {
            super.onGameOver(clean);
            this.state.addLog('Survival Games game over', 'info');
        }

        /**
         * "District N has been ELIMINATED!" resolved via eliminated players.
         * @param {string} clean Stripped chat line.
         * @returns {boolean} True when handled.
         */
        detectDistrictElimination(clean) {
            if (!/District\s+\d+\s+has been\s+ELIMINATED/i.test(clean)) return false;

            let candidate = this.engine.getActiveTeams().find(teamName => {
                const players = this.state.teams[teamName].players || [];
                if (players.length === 0) return false;
                return players.every(p => this.state.playerStats[p] && this.state.playerStats[p].eliminated);
            });
            if (!candidate) candidate = this.inferEliminatedTeam();

            if (!candidate) {
                this.state.addLog('District eliminated (unmapped to an app team)', 'warning');
                return true;
            }
            this.state.eliminationOrder.push(candidate);
            this.state.addLog(`${candidate} eliminated (${this.state.eliminationOrder.length} out)`, 'warning');
            if (!this.features.individualSurvival) {
                this.engine.recordTeamEliminationPlacement(candidate);
                this.engine.tryFinalize();
            }
            return true;
        }
    }

    global.Hive.parsers['Survival Games'] = SurvivalGamesParser;
    if (typeof module !== 'undefined' && module.exports) module.exports = SurvivalGamesParser;
})(typeof window !== 'undefined' ? window : globalThis);
