/**
 * SkyWarsParser - team mode scored by kills and survival; flavour-verb kills are
 * detected structurally.
 */
(function (global) {
    'use strict';
    const Base = global.Hive.parsers.GamemodeParser;

    class SkyWarsParser extends Base {
        get name() { return 'SkyWars'; }

        /**
         * SkyWars line detection, tracking the kill leader before noise filtering.
         * @param {string} clean Stripped chat line.
         * @returns {boolean} True when the line scored.
         */
        detect(clean) {
            const leader = clean.match(/»?\s*(.+?)\s+is the new kill leader!?$/i);
            if (leader) {
                if (this.points.enableKillLeader) {
                    this.state.skyWarsKillLeader = leader[1].trim();
                }
                return false;
            }
            if (this.isNoise(clean)) return false;
            if (this.detectWinner(clean)) {
                this.awardKillLeader();
                return true;
            }
            if (this.detectTeamElimination(clean)) return true;
            if (this.detectKilledBy(clean)) return true;
            if (this.detectGenericKill(clean)) return true;
            return false;
        }

        /**
         * True for SkyWars noise lines.
         * @param {string} clean Stripped chat line.
         * @returns {boolean} Whether the line is noise.
         */
        isNoise(clean) {
            return /is the new kill leader/i.test(clean) ||
                /Mystery Chest was opened by/i.test(clean) ||
                /spellbook for you/i.test(clean) ||
                /wasn't very lucky/i.test(clean) ||
                /minimum play height/i.test(clean) ||
                /Your tracking compass is pointing to/i.test(clean);
        }

        /**
         * Award the "Kill Leader" bonus once to the last announced leader's team;
         * requires the misc toggle.
         * @returns {void}
         */
        awardKillLeader() {
            if (!this.points.enableKillLeader) return;
            const playerName = this.state.skyWarsKillLeader;
            if (!playerName) return;
            const teamName = this.state.findPlayerTeam(playerName);
            if (!this.engine.isScorableTeam(teamName)) return;
            const score = this.state.ensureScore(teamName);
            if (score.events.some(e => e.type === 'Kill Leader')) return;
            this.engine.awardPoints(teamName, 'Kill Leader');
            const last = score.events[score.events.length - 1];
            if (last && last.type === 'Kill Leader') last.player = playerName;
            this.state.addLog(`${playerName} finished as the kill leader`, 'success');
        }

        /**
         * Award the kill-leader bonus before base finalisation.
         * @param {string} clean Stripped chat line.
         * @returns {void}
         */
        onGameOver(clean) {
            this.awardKillLeader();
            super.onGameOver(clean);
        }
    }

    global.Hive.parsers.SkyWars = SkyWarsParser;
    if (typeof module !== 'undefined' && module.exports) module.exports = SkyWarsParser;
})(typeof window !== 'undefined' ? window : globalThis);
