/**
 * SurvivalGamesParser - team mode (in-game teams are "District N"), kills only,
 * last team standing wins.
 *
 * Teams are assigned manually in the app; District labels are resolved purely via
 * player membership (a District line credits whichever app team the players are on).
 *   "» sparkskye killed Quapot"
 *   "» SandRosey ten hearted Bo0ky"  /  "» Akumatizedd obliterated Galaxy 12000"
 *   "» District 3 has been ELIMINATED!"
 */
(function (global) {
    'use strict';
    const Base = global.Hive.parsers.GamemodeParser;

    class SurvivalGamesParser extends Base {
        get name() { return 'Survival Games'; }

        detect(clean) {
            if (this.detectDistrictElimination(clean)) return true;
            // "You were killed by X" -> local player death only.
            const m = clean.match(/»?\s*You were killed by\s+(.+?)\.?\s*$/i);
            if (m) {
                const victim = this.resolvePlayerName('You');
                if (victim) return this.recordDeath(victim) !== false;
            }
            if (this.detectGenericKill(clean)) return true;
            return false;
        }

        /**
         * "District N has been ELIMINATED!" - there is no color name, so resolve to
         * the app team whose members were eliminated this round. We pick the team
         * with the most already-eliminated, not-yet-recorded players.
         */
        detectDistrictElimination(clean) {
            if (!/District\s+\d+\s+has been\s+ELIMINATED/i.test(clean)) return false;

            // Find the active app team whose players are all eliminated.
            const candidate = this.engine.getActiveTeams().find(teamName => {
                const players = this.state.teams[teamName].players || [];
                if (players.length === 0) return false;
                return players.every(p => this.state.playerStats[p] && this.state.playerStats[p].eliminated);
            });

            if (!candidate) {
                // Couldn't map by membership; still note the event.
                this.state.addLog('District eliminated (unmapped to an app team)', 'warning');
                return true;
            }
            this.state.eliminationOrder.push(candidate);
            this.state.addLog(`${candidate} eliminated (${this.state.eliminationOrder.length} out)`, 'warning');
            this.engine.recordTeamEliminationPlacement(candidate);
            this.engine.tryFinalize();
            return true;
        }
    }

    global.Hive.parsers['Survival Games'] = SurvivalGamesParser;
    if (typeof module !== 'undefined' && module.exports) module.exports = SurvivalGamesParser;
})(typeof window !== 'undefined' ? window : globalThis);
