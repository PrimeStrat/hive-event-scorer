/**
 * BedWarsParser - team mode with final kills and bed breaks. Regular kills
 * respawn the victim and never score; only "FINAL KILL!" lines award points.
 */
(function (global) {
    'use strict';
    const Base = global.Hive.parsers.GamemodeParser;

    class BedWarsParser extends Base {
        get name() { return 'BedWars'; }

        /**
         * BedWars line detection; no generic flavour-kill fallback.
         * @param {string} clean Stripped chat line.
         * @returns {boolean} True when the line scored.
         */
        detect(clean) {
            if (this.detectFinalKill(clean)) return true;
            if (this.detectLocalElimination(clean)) return true;
            if (this.detectFirstPersonKill(clean)) return true;
            // if (this.detectBedBreak(clean)) return true;
            if (this.detectWinner(clean)) return true;
            if (this.detectTeamElimination(clean)) return true;
            return false;
        }

        /**
         * "You have been eliminated from the game!" - local player's final out.
         * @param {string} clean Stripped chat line.
         * @returns {boolean} True when handled.
         */
        detectLocalElimination(clean) {
            if (!/You have been\s+eliminated\s+from the game/i.test(clean)) return false;
            const me = this.resolvePlayerName('You');
            if (me) {
                const team = this.resolvePlayerTeam(me);
                if (team) {
                    this.state.getOrCreatePlayerStats(me, team).deaths++;
                    this.markEliminated(me, team);
                }
            }
            return true;
        }

        /**
         * "FINAL KILL! X eliminated Y" - the only kill type that scores.
         * @param {string} clean Stripped chat line.
         * @returns {boolean} True when handled.
         */
        detectFinalKill(clean) {
            const m = clean.match(/FINAL KILL!?\s+(.+?)\s+eliminated\s+(.+?)\s*$/i);
            if (!m) return false;
            const killer = m[1].trim();
            const victim = m[2].trim();
            const killerTeam = this.resolvePlayerTeam(killer);
            const victimTeam = this.resolvePlayerTeam(victim);
            if (killerTeam) {
                const ks = this.state.getOrCreatePlayerStats(killer, killerTeam);
                ks.kills++; ks.finalKills++;
                this.engine.awardPoints(killerTeam, 'Kill');
                this.state.ensureScore(killerTeam).kills.push({
                    player: killer, victim, time: new Date().toISOString()
                });
            }
            if (victimTeam) {
                const vs = this.state.getOrCreatePlayerStats(victim, victimTeam);
                vs.deaths++;
                this.markEliminated(victim, victimTeam);
            }
            this.state.addLog(`FINAL KILL: ${killer} eliminated ${victim}`, 'success');
            return true;
        }

        /**
         * First-person regular kills; deaths are tracked but no kill points.
         * @param {string} clean Stripped chat line.
         * @returns {boolean} True when handled.
         */
        detectFirstPersonKill(clean) {
            let m = clean.match(/»?\s*You killed\s+(.+?)\s*$/i);
            if (m) {
                const victim = m[1].trim();
                const victimTeam = this.resolvePlayerTeam(victim);
                if (victimTeam) {
                    this.state.getOrCreatePlayerStats(victim, victimTeam).deaths++;
                }
                return true;
            }
            m = clean.match(/»?\s*You were killed by\s+(.+?)\.?\s*$/i);
            if (m) {
                const victim = this.resolvePlayerName('You');
                if (!victim) return false;
                const victimTeam = this.resolvePlayerTeam(victim);
                if (victimTeam) this.state.getOrCreatePlayerStats(victim, victimTeam).deaths++;
                return true;
            }
            return false;
        }

        /**
         * Bed break lines in either direction.
         * @param {string} clean Stripped chat line.
         * @returns {boolean} True when handled.
         */
        detectBedBreak(clean) {
            let breaker = null;
            let m = clean.match(/»?\s*(.+?)\s+destroyed\s+(.+?)['’]?s?\s+bed/i);
            if (m) breaker = m[1].trim();
            if (!breaker) {
                m = clean.match(/»?\s*Your bed was destroyed by\s+(.+?)\s*$/i);
                if (m) breaker = m[1].trim();
            }
            if (!breaker) return false;

            const team = this.resolvePlayerTeam(breaker);
            if (!team) return false;
            const ps = this.state.getOrCreatePlayerStats(breaker, team);
            ps.bedBreaks++;
            this.engine.awardPoints(team, 'Bed Break');
            this.state.ensureScore(team).bedBreaks.push({ player: breaker, time: new Date().toISOString() });
            this.state.addLog(`${team} - ${breaker} broke a bed`, 'success');
            return true;
        }

        /**
         * Log the BedWars game over.
         * @param {string} clean Stripped chat line.
         * @returns {void}
         */
        onGameOver(clean) {
            super.onGameOver(clean);
            this.state.addLog('BedWars game over', 'info');
        }
    }

    global.Hive.parsers.BedWars = BedWarsParser;
    if (typeof module !== 'undefined' && module.exports) module.exports = BedWarsParser;
})(typeof window !== 'undefined' ? window : globalThis);
