/**
 * SkyWarsParser - team mode scored by kills and survival; flavour-verb kills are
 * detected structurally.
 */
(function (global) {
    'use strict';
    const Base = global.Hive.parsers.GamemodeParser;

    class SkyWarsParser extends Base {
        /**
         * Gamemode name this parser handles.
         * @returns {string} Gamemode name.
         */
        get name() {
            return 'SkyWars';
        }

        /**
         * SkyWars line detection, tracking the kill leader before noise filtering.
         * @param {string} clean Stripped chat line.
         * @returns {boolean} True when the line scored.
         */
        detect(clean) {
            const leader = clean.match(/\u00BB?\s*(.+?)\s+is the new kill leader!?$/i);
            if (leader) {
                if (this.points.enableKillLeader) this.state.skyWarsKillLeader = leader[1].trim();
                return false;
            }
            const chest = clean.match(/\u00BB?\s*The Mystery Chest was opened by\s+(.+?)\s*$/i);
            if (chest) return this.recordChestOpen(chest[1].trim());
            if (this.isNoise(clean)) return false;
            if (this.detectWinner(clean)) {
                this.awardKillLeader();
                return true;
            }
            return this.detectTeamElimination(clean) ||
                this.detectKilledBy(clean) ||
                !!this.detectGenericKill(clean);
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
         * Award Mystery Chest points to the opener's team; requires the misc toggle.
         * @param {string} openerName Player who opened the chest.
         * @returns {boolean} True when points were awarded.
         */
        recordChestOpen(openerName) {
            if (!this.points.enableChestPoints || !openerName) return false;
            const teamName = this.state.findPlayerTeam(openerName);
            if (!this.engine.isScorableTeam(teamName)) return false;
            const canonical = this.state.resolveCanonicalPlayer(openerName);
            const pts = this.engine.awardPoints(teamName, 'Mystery Chest');
            this.tagLastEvent(teamName, 'Mystery Chest', canonical);
            this.state.addLog(`${this.subLabel(openerName, canonical)} opened the Mystery Chest${pts ? ` (+${pts})` : ''}`, 'info');
            return true;
        }

        /**
         * Award the "Kill Leader" bonus once to the last announced leader's team;
         * requires the misc toggle.
         * @returns {void}
         */
        awardKillLeader() {
            if (!this.points.enableKillLeader) return;
            const announced = this.state.skyWarsKillLeader;
            if (!announced) return;
            const teamName = this.state.findPlayerTeam(announced);
            if (!this.engine.isScorableTeam(teamName)) return;
            if (this.state.ensureScore(teamName).events.some(e => e.type === 'Kill Leader')) return;
            const playerName = this.state.resolveCanonicalPlayer(announced);
            this.engine.awardPoints(teamName, 'Kill Leader');
            this.tagLastEvent(teamName, 'Kill Leader', playerName);
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
