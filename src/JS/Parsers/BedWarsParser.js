/**
 * BedWarsParser - team mode with final kills. Regular kills respawn the victim
 * and never score; only "FINAL KILL!" lines award points. Bed breaks are added
 * manually by the host (the log only shows breaks against the log user's bed).
 */
(function (global) {
    'use strict';
    const Base = global.Hive.parsers.GamemodeParser;

    class BedWarsParser extends Base {
        /**
         * Gamemode name this parser handles.
         * @returns {string} Gamemode name.
         */
        get name() {
            return 'BedWars';
        }

        /**
         * BedWars line detection; no generic flavour-kill fallback.
         * @param {string} clean Stripped chat line.
         * @returns {boolean} True when the line scored.
         */
        detect(clean) {
            return this.detectFinalKill(clean) ||
                this.detectLocalElimination(clean) ||
                this.detectFirstPersonKill(clean) ||
                this.detectWinner(clean) ||
                this.detectTeamElimination(clean);
        }

        /**
         * "You have been eliminated from the game!" - local player's final out.
         * @param {string} clean Stripped chat line.
         * @returns {boolean} True when handled.
         */
        detectLocalElimination(clean) {
            if (!/You have been\s+eliminated\s+from the game/i.test(clean)) return false;
            const me = this.resolvePlayerName('You');
            const team = me && this.resolvePlayerTeam(me);
            if (team) this.creditDeath(this.state.resolveCanonicalPlayer(me), team);
            return true;
        }

        /**
         * "FINAL KILL! X eliminated Y" - the only kill type that scores.
         * "FINAL KILL! X eliminated themselves" is a final death with no killer.
         * @param {string} clean Stripped chat line.
         * @returns {boolean} True when handled.
         */
        detectFinalKill(clean) {
            const selfMatch = clean.match(/FINAL KILL!?\s+(.+?)\s+eliminated\s+themselves\s*$/i);
            if (selfMatch) {
                const playerName = selfMatch[1].trim();
                const canonical = this.state.resolveCanonicalPlayer(playerName);
                const team = this.resolvePlayerTeam(playerName);
                if (team) this.creditDeath(canonical, team);
                this.state.addLog(`FINAL DEATH: ${this.subLabel(playerName, canonical)} eliminated themselves`, 'warning');
                return true;
            }

            const m = clean.match(/FINAL KILL!?\s+(.+?)\s+eliminated\s+(.+?)\s*$/i);
            if (!m) return false;
            const killer = m[1].trim();
            const victim = m[2].trim();
            const killerTeam = this.resolvePlayerTeam(killer);
            const victimTeam = this.resolvePlayerTeam(victim);
            const canonicalKiller = this.state.resolveCanonicalPlayer(killer);
            const canonicalVictim = this.state.resolveCanonicalPlayer(victim);

            if (killerTeam) {
                this.state.getOrCreatePlayerStats(canonicalKiller, killerTeam).finalKills++;
                this.creditKill(canonicalKiller, killerTeam, canonicalVictim);
            }
            if (victimTeam) this.creditDeath(canonicalVictim, victimTeam);
            this.state.addLog(`FINAL KILL: ${this.subLabel(killer, canonicalKiller)} eliminated ${this.subLabel(victim, canonicalVictim)}`, 'success');
            return true;
        }

        /**
         * First-person regular kills; deaths are tracked but no kill points.
         * @param {string} clean Stripped chat line.
         * @returns {boolean} True when handled.
         */
        detectFirstPersonKill(clean) {
            let m = clean.match(/\u00BB?\s*You killed\s+(.+?)\s*$/i);
            if (m) {
                const victim = m[1].trim();
                const victimTeam = this.resolvePlayerTeam(victim);
                if (victimTeam) this.state.getOrCreatePlayerStats(victim, victimTeam).deaths++;
                return true;
            }
            m = clean.match(/\u00BB?\s*You were killed by\s+(.+?)\.?\s*$/i);
            if (!m) return false;
            const victim = this.resolvePlayerName('You');
            if (!victim) return false;
            const victimTeam = this.resolvePlayerTeam(victim);
            if (victimTeam) this.state.getOrCreatePlayerStats(victim, victimTeam).deaths++;
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
