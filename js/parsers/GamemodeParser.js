/**
 * GamemodeParser - base class for all gamemode interpreters.
 *
 * A parser turns one line of Hive chat into scoring events by mutating GameState
 * through the shared ScoringEngine. The base provides the common building blocks
 * found across Hive modes; subclasses override `features`, `name`, and the small
 * set of detectors unique to their mode.
 *
 * Detection philosophy (per requirement): combat kills are matched *structurally*
 * via the registered players present in a line, NOT by a hard-coded verb list, so
 * any flavour verb ("rolled ... beyond space and time", "ten hearted", "silenced")
 * is interpreted correctly: first registered player = killer, last = victim.
 */
(function (global) {
    'use strict';

    const ChatUtils = global.Hive.ChatUtils;

    class GamemodeParser {
        /**
         * @param {GameState} state
         * @param {ScoringEngine} engine
         * @param {PointSystem} points
         */
        constructor(state, engine, points) {
            this.state = state;
            this.engine = engine;
            this.points = points;
        }

        get name() { return 'Base'; }

        /** Feature flags; falls back to PointSystem's table for this gamemode. */
        get features() {
            return this.points.featuresFor(this.name) || {};
        }

        // Phrases that mean "this player died with no killer" - they end an
        // otherwise kill-shaped line, so they must NOT credit a kill.
        get selfDeathPhrases() {
            return ['did an oopsie', 'you died', 'forgot their parachute', 'fell off',
                'fell to their demise', 'said goodbye to this cruel world', "got ratio'd",
                'made their last dance move', "ain't stayin' alive", 'has two left feet',
                "rock 'n' rolled into the void"];
        }

        /**
         * Parse a single RAW chat line. Returns true if a scoring-relevant event
         * was recorded. Shared front-door: strip colors, skip player chat, then
         * dispatch to detectors. Subclasses usually override `detect()` only.
         */
        parseLine(rawLine) {
            if (ChatUtils.isPlayerChatLine(rawLine)) return false;
            const clean = ChatUtils.stripColorCodes(rawLine);
            if (!clean) return false;

            if (/game over!?/i.test(clean)) {
                this.onGameOver(clean);
                // Game-over is informational; let other detectors still run on the
                // same line in case a winner is announced separately.
            }
            return this.detect(clean, rawLine);
        }

        /** Subclasses implement mode-specific detection. */
        detect(/* clean, raw */) {
            return false;
        }

        onGameOver(/* clean */) {
            this.state.currentGameCompleted = true;
        }

        // ---- shared detectors --------------------------------------------

        /**
         * Generic flavour-verb kill: a non-chat line containing two registered
         * players. Killer = first appearance, victim = last. Self-death phrases or
         * a single player present mean death-only (no kill credit).
         * Returns 'kill' | 'death' | false.
         */
        detectGenericKill(clean) {
            const lower = clean.toLowerCase();
            const players = ChatUtils.findPlayersInText(clean, this.state.allPlayerNames());

            if (players.length >= 2) {
                const killer = players[0];
                const victim = players[players.length - 1];
                if (killer === victim) return this.recordDeath(victim);
                return this.recordKill(killer, victim);
            }
            if (players.length === 1) {
                // One known player + a self-death phrase => elimination only.
                if (this.selfDeathPhrases.some(p => lower.includes(p))) {
                    return this.recordDeath(players[0]);
                }
            }
            return false;
        }

        recordKill(killerName, victimName) {
            const killerTeam = this.state.findPlayerTeam(killerName);
            const victimTeam = this.state.findPlayerTeam(victimName);
            if (killerTeam) {
                const ks = this.state.getOrCreatePlayerStats(killerName, killerTeam);
                ks.kills++;
                this.engine.awardPoints(killerTeam, 'Kill');
                this.state.ensureScore(killerTeam).kills.push({
                    player: killerName, victim: victimName, time: new Date().toISOString()
                });
            }
            if (victimTeam) {
                const vs = this.state.getOrCreatePlayerStats(victimName, victimTeam);
                vs.deaths++;
                this.markEliminated(victimName, victimTeam);
            }
            this.state.addLog(`${killerName} eliminated ${victimName}`, 'success');
            return 'kill';
        }

        recordDeath(victimName) {
            const team = this.state.findPlayerTeam(victimName);
            if (!team) return false;
            const vs = this.state.getOrCreatePlayerStats(victimName, team);
            vs.deaths++;
            this.markEliminated(victimName, team);
            this.state.addLog(`${victimName} was eliminated`, 'warning');
            return 'death';
        }

        markEliminated(playerName, teamName) {
            const ps = this.state.getOrCreatePlayerStats(playerName, teamName);
            if (!ps.eliminated) {
                ps.eliminated = true;
                if (!this.state.playerEliminationOrder.includes(playerName)) {
                    this.state.playerEliminationOrder.push(playerName);
                }
            }
        }

        /**
         * Team elimination: "[COLOR] Team has been ELIMINATED" / "...eliminated!".
         * Resolves to the app team named by the color word when present; falls back
         * to a team whose players are already all eliminated. Returns true if handled.
         */
        detectTeamElimination(clean) {
            const m = clean.match(/(.+?)\s+(?:Team\s+)?has been (?:ELIMINATED|eliminated)!?$/i);
            if (!m) return false;
            const label = m[1].trim();
            const teamName = this.resolveTeamFromLabel(label);
            if (!teamName) return false;
            if (this.state.eliminationOrder.includes(teamName)) return true; // dedupe dup lines

            this.state.eliminationOrder.push(teamName);
            const team = this.state.teams[teamName];
            if (team && team.players) {
                for (const p of team.players) this.markEliminated(p, teamName);
            }
            this.state.addLog(`${teamName} eliminated (${this.state.eliminationOrder.length} out)`, 'warning');
            this.engine.recordTeamEliminationPlacement(teamName);
            this.engine.tryFinalize();
            return true;
        }

        /**
         * Winner: "[COLOR] Team are the WINNERS / are the champions / is the WINNER".
         */
        detectWinner(clean) {
            const m = clean.match(/(.+?)\s+(?:Team\s+)?(?:is the WINNER|are the WINNERS|are the champions?|is the champion)!?$/i);
            if (!m) return false;
            const teamName = this.resolveTeamFromLabel(m[1].trim());
            if (!teamName) return false;
            this.engine.awardPoints(teamName, '1st place');
            this.state.addLog(`${teamName} WON!`, 'success');
            this.engine.finalizeGamePlacements(teamName);
            return true;
        }

        /**
         * Map an in-game team label to a manually-assigned app team.
         * 1) Exact app-team name match (e.g. "RED" -> team "RED").
         * 2) The label's leading color word ("Red Team" -> "RED").
         * Returns null when no app team corresponds (so District labels with no
         * player overlap are ignored by name and handled via player membership).
         */
        resolveTeamFromLabel(label) {
            const upper = label.trim().toUpperCase();
            if (this.state.teams[upper]) return upper;
            // Try the first word ("Red", "Dark Gray").
            const word = upper.replace(/\bTEAM\b/i, '').trim();
            if (this.state.teams[word]) return word;
            // Two-word colors like "DARK GRAY".
            for (const teamName of Object.keys(this.state.teams)) {
                if (word === teamName || word.startsWith(teamName + ' ') || word.endsWith(' ' + teamName)) {
                    return teamName;
                }
            }
            return null;
        }

        /**
         * Individual placement line. Default matches DeathRun-style:
         *   "You finished in 1st place"
         *   "SamsungWaffle has finished in 2nd place"
         *   "1st Place: Qv19v"
         * Subclasses can override `placementRegexes()` to add mode-specific phrasing.
         */
        detectIndividualPlacement(clean) {
            for (const re of this.placementRegexes()) {
                const m = clean.match(re.pattern);
                if (!m) continue;
                const playerName = this.resolvePlayerName(m[re.name]);
                const position = parseInt(m[re.pos], 10);
                if (!playerName || !Number.isInteger(position)) continue;
                this.recordIndividualPlacement(playerName, position);
                return true;
            }
            return false;
        }

        placementRegexes() {
            return [
                { pattern: /(?:»\s*)?(You|[A-Za-z0-9_ ]+?)\s+(?:has\s+)?finished in\s+(\d+)(?:st|nd|rd|th)\s+place/i, name: 1, pos: 2 },
                { pattern: /(?:»\s*)?(\d+)(?:st|nd|rd|th)\s+Place:\s+([A-Za-z0-9_ ]+?)(?:\s|$|\[)/i, name: 2, pos: 1 }
            ];
        }

        recordIndividualPlacement(playerName, position) {
            const team = this.state.findPlayerTeam(playerName);
            if (!team) return false;
            const ps = this.state.getOrCreatePlayerStats(playerName, team);
            ps.placement = ChatUtils.ordinal(position);

            const key = this.engine.placementKey(position);
            if (key) {
                const score = this.state.ensureScore(team);
                const already = score.placements.some(p => p.player === playerName && p.position === position);
                if (!already) {
                    this.engine.awardPoints(team, key);
                    score.placements.push({ player: playerName, position, time: new Date().toISOString() });
                }
            }
            this.state.addLog(`${team} - ${playerName} finished ${ChatUtils.ordinal(position)}`, 'info');

            // Team-finish bonus tracking (DeathRun / Gravity).
            if (this.features.teamFinish) this.trackTeamFinish(team, playerName);
            return true;
        }

        trackTeamFinish(teamName, playerName) {
            if (!this.state.playersFinished[teamName]) this.state.playersFinished[teamName] = [];
            if (!this.state.playersFinished[teamName].includes(playerName)) {
                this.state.playersFinished[teamName].push(playerName);
            }
            const team = this.state.teams[teamName];
            if (!team || !team.players) return;
            const allFinished = team.players.every(p => this.state.playersFinished[teamName].includes(p));
            if (allFinished && !this.state.teamsFullyFinished.includes(teamName)) {
                this.state.teamsFullyFinished.push(teamName);
                if (this.state.teamsFullyFinished.length === 1) {
                    this.engine.awardPoints(teamName, 'First full team finish');
                    this.state.addLog(`${teamName} is the FIRST team to fully finish!`, 'success');
                }
            }
        }

        /** Resolve "You" to the configured local IGN (or null if unset). */
        resolvePlayerName(raw) {
            if (!raw) return null;
            const name = raw.trim();
            if (/^you$/i.test(name)) {
                const ign = (this.points.myIgn || '').trim();
                if (!ign) {
                    this.state.addLog('Skipped a "You" event - set "My IGN" in Settings to score it', 'warning');
                    return null;
                }
                return ign;
            }
            return name;
        }
    }

    global.Hive = global.Hive || {};
    global.Hive.parsers = global.Hive.parsers || {};
    global.Hive.parsers.GamemodeParser = GamemodeParser;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = GamemodeParser;
    }
})(typeof window !== 'undefined' ? window : globalThis);
