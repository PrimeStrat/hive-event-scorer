/**
 * GamemodeParser - base class for all gamemode interpreters. Kills are detected
 * structurally from registered player names, not a verb whitelist.
 */
(function (global) {
    'use strict';

    const ChatUtils = global.Hive.ChatUtils;

    const SELF_DEATH_PHRASES = ['did an oopsie', 'you died', 'forgot their parachute', 'fell off',
        'fell to their demise', 'said goodbye to this cruel world', "got ratio'd",
        'made their last dance move', "ain't stayin' alive", 'has two left feet',
        "rock 'n' rolled into the void"];

    class GamemodeParser {
        /**
         * Create a parser over shared state.
         * @param {GameState} state Shared game state.
         * @param {ScoringEngine} engine Scoring engine.
         * @param {PointSystem} points Point tables and toggles.
         */
        constructor(state, engine, points) {
            this.state = state;
            this.engine = engine;
            this.points = points;
        }

        /**
         * Gamemode name this parser handles.
         * @returns {string} Gamemode name.
         */
        get name() {
            return 'Base';
        }

        /**
         * Feature flags for this gamemode.
         * @returns {GamemodeFeatures} Feature flags.
         */
        get features() {
            return this.points.featuresFor(this.name) || {};
        }

        /**
         * Phrases that mean a lone named player died without a killer.
         * @returns {string[]} Lowercase phrases.
         */
        get selfDeathPhrases() {
            return SELF_DEATH_PHRASES;
        }

        /**
         * True once any scoring event exists in the current game, so pre-game lobby
         * traffic never scores. Derived from state so it resets with each new game.
         * @returns {boolean} Whether the current game has begun.
         */
        get gameHasStarted() {
            if (this.state.playerEliminationOrder.length > 0) return true;
            return Object.values(this.state.scores).some(s =>
                s && ((s.kills && s.kills.length > 0) || (s.placements && s.placements.length > 0)));
        }

        /**
         * Parse a single raw chat line. Going offline mid-game is a permanent
         * elimination; coming back online does not undo it.
         * @param {string} rawLine Raw chat line.
         * @returns {boolean} True when a scoring-relevant event was recorded.
         */
        parseLine(rawLine) {
            if (ChatUtils.isPlayerChatLine(rawLine)) return false;
            const clean = ChatUtils.stripColorCodes(rawLine);
            if (!clean) return false;

            const offline = clean.match(/^(.+?)\s+has gone offline\.?$/i);
            if (offline) {
                if (this.gameHasStarted) {
                    const name = offline[1].trim();
                    const team = this.state.findPlayerTeam(name);
                    const ps = team && this.state.playerStats[this.state.resolveCanonicalPlayer(name)];
                    if (team && (!ps || !ps.eliminated)) this.markEliminated(name, team);
                }
                return true;
            }
            if (/^.+?\s+has come online\.?$/i.test(clean)) return true;

            if (/game over!?/i.test(clean)) this.onGameOver(clean);
            return this.detect(clean, rawLine);
        }

        /**
         * Mode-specific detection; subclasses override.
         * @param {string} clean Stripped chat line.
         * @param {string} raw Raw chat line.
         * @returns {boolean} True when the line scored.
         */
        detect(clean, raw) {
            return false;
        }

        /**
         * Handle a Game OVER line by finalising the mode's placements. PvP solo
         * placements use enemy-relative survival; team placements still follow.
         * @param {string} clean Stripped chat line.
         * @returns {void}
         */
        onGameOver(clean) {
            this.state.currentGameCompleted = true;
            if (this.features.pvp && this.points.enableSoloPlacements) {
                this.engine.finalizePvpIndividualPlacements();
            } else if (this.features.individualSurvival) {
                this.engine.finalizePlayerPlacements();
            }
            if (this.features.teamElimination) this.engine.finalizeFromSurvival();
        }

        /**
         * True for lobby/server system messages that must never score.
         * @param {string} clean Stripped chat line.
         * @returns {boolean} Whether the line is lobby noise.
         */
        isLobbyLine(clean) {
            return /has (?:gone )?offline\b/i.test(clean) ||
                /has come online\b/i.test(clean) ||
                /joined\.\s*\[\d+\/\d+\]/i.test(clean) ||
                /\bset .+?'s role to\b/i.test(clean) ||
                /\bset .+? to\b/i.test(clean) ||
                /\bsent an invite to\b/i.test(clean) ||
                /\brank to\b/i.test(clean) ||
                /\bupgraded\b.*\bby\b/i.test(clean) ||
                /\bunlocked\b.*\bby\b/i.test(clean) ||
                /Your tracking compass is pointing to/i.test(clean);
        }

        /**
         * Structural kill: first registered player is the killer, last the victim.
         * @param {string} clean Stripped chat line.
         * @returns {string|boolean} 'kill' | 'death' | false.
         */
        detectGenericKill(clean) {
            if (this.isLobbyLine(clean)) return false;
            const lower = clean.toLowerCase();
            const players = ChatUtils.findPlayersInText(clean, this.state.allPlayerNames());

            if (players.length >= 2) {
                const killer = players[0];
                const victim = players[players.length - 1];
                if (killer === victim) return this.recordDeath(victim);
                return this.recordKill(killer, victim);
            }
            if (players.length === 1 && this.selfDeathPhrases.some(p => lower.includes(p))) {
                return this.recordDeath(players[0]);
            }
            return false;
        }

        /**
         * Resolve a player's team, optionally auto-adding unrostered players to the
         * UNKNOWN bucket. Only call with names from high-confidence detectors.
         * @param {string} playerName Player name.
         * @returns {string|null} Team name or null.
         */
        resolvePlayerTeam(playerName) {
            const team = this.state.findPlayerTeam(playerName);
            if (team && team !== 'UNKNOWN') return team;
            if (this.points.autoAddUnknownPlayers === false) return null;
            return this.state.addUnknownPlayer(playerName);
        }

        /**
         * "You were killed by X" - credits the killer even when "My IGN" is unset;
         * the victim's death is only recorded when resolvable.
         * @param {string} clean Stripped chat line.
         * @returns {boolean} True when the line scored.
         */
        detectKilledBy(clean) {
            const m = clean.match(/\u00BB?\s*You were killed by\s+(.+?)(?:\.\s*They had\s+[\d.]+\s+hearts?)?\s*$/i);
            if (!m) return false;
            const killerName = m[1].trim().replace(/\.$/, '');
            if (!killerName) return false;
            const victim = this.resolvePlayerName('You');
            if (victim) return this.recordKill(killerName, victim) !== false;
            return this.recordKillPointOnly(killerName) !== false;
        }

        /**
         * Award the First Blood bonus once per game to the first killer; only in
         * modes whose point table declares the key.
         * @param {string} playerName Canonical killer name.
         * @param {string} teamName Killer's team.
         * @returns {void}
         */
        awardFirstBlood(playerName, teamName) {
            if (!playerName || !this.engine.isScorableTeam(teamName)) return;
            const table = this.points.forGamemode(this.name) || {};
            if (table['First Blood'] === undefined) return;
            const alreadyAwarded = Object.values(this.state.scores).some(score =>
                Array.isArray(score.events) && score.events.some(e => e.type === 'First Blood'));
            if (alreadyAwarded) return;
            const points = this.engine.awardPoints(teamName, 'First Blood');
            this.tagLastEvent(teamName, 'First Blood', playerName);
            this.state.addLog(`${playerName} got FIRST BLOOD!${points ? ` (+${points})` : ''}`, 'success');
        }

        /**
         * Credit the player on a team's newest event when it has the given type.
         * @param {string} teamName Team name.
         * @param {string} eventType Expected event type.
         * @param {string} playerName Player to credit.
         * @returns {void}
         */
        tagLastEvent(teamName, eventType, playerName) {
            const events = this.state.ensureScore(teamName).events;
            const event = events[events.length - 1];
            if (event && event.type === eventType) event.player = playerName;
        }

        /**
         * Label a logged name, marking substitutes as scoring for their original.
         * @param {string} rawName Name as it appeared in chat.
         * @param {string} canonical Canonical roster name.
         * @returns {string} Display label.
         */
        subLabel(rawName, canonical) {
            return rawName !== canonical ? `${rawName} (for ${canonical})` : canonical;
        }

        /**
         * Credit a kill to the killer's team and stats.
         * @param {string} canonicalKiller Canonical killer name.
         * @param {string} killerTeam Killer's team.
         * @param {string} canonicalVictim Canonical victim name, or '???'.
         * @returns {void}
         */
        creditKill(canonicalKiller, killerTeam, canonicalVictim) {
            this.state.getOrCreatePlayerStats(canonicalKiller, killerTeam).kills++;
            this.engine.awardPoints(killerTeam, 'Kill');
            this.state.ensureScore(killerTeam).kills.push({
                player: canonicalKiller, victim: canonicalVictim, time: new Date().toISOString()
            });
            this.awardFirstBlood(canonicalKiller, killerTeam);
        }

        /**
         * Count a death and eliminate the victim.
         * @param {string} canonicalVictim Canonical victim name.
         * @param {string} victimTeam Victim's team.
         * @returns {void}
         */
        creditDeath(canonicalVictim, victimTeam) {
            this.state.getOrCreatePlayerStats(canonicalVictim, victimTeam).deaths++;
            this.markEliminated(canonicalVictim, victimTeam);
        }

        /**
         * Credit a kill with no known victim.
         * @param {string} killerName Killer name.
         * @returns {string|boolean} 'kill' or false.
         */
        recordKillPointOnly(killerName) {
            const killerTeam = this.resolvePlayerTeam(killerName);
            if (!killerTeam) return false;
            const canonical = this.state.resolveCanonicalPlayer(killerName);
            this.creditKill(canonical, killerTeam, '???');
            this.state.addLog(`${this.subLabel(killerName, canonical)} got a kill`, 'success');
            return 'kill';
        }

        /**
         * Credit a kill and eliminate the victim.
         * @param {string} killerName Killer name.
         * @param {string} victimName Victim name.
         * @returns {string} 'kill'.
         */
        recordKill(killerName, victimName) {
            const killerTeam = this.resolvePlayerTeam(killerName);
            const victimTeam = this.resolvePlayerTeam(victimName);
            const canonicalKiller = this.state.resolveCanonicalPlayer(killerName);
            const canonicalVictim = this.state.resolveCanonicalPlayer(victimName);
            if (killerTeam) this.creditKill(canonicalKiller, killerTeam, canonicalVictim);
            if (victimTeam) this.creditDeath(canonicalVictim, victimTeam);
            this.state.addLog(`${this.subLabel(killerName, canonicalKiller)} eliminated ${this.subLabel(victimName, canonicalVictim)}`, 'success');
            return 'kill';
        }

        /**
         * Record a killer-less death and eliminate the victim.
         * @param {string} victimName Victim name.
         * @returns {string|boolean} 'death' or false.
         */
        recordDeath(victimName) {
            const team = this.resolvePlayerTeam(victimName);
            if (!team) return false;
            const canonical = this.state.resolveCanonicalPlayer(victimName);
            this.creditDeath(canonical, team);
            this.state.addLog(`${this.subLabel(victimName, canonical)} was eliminated`, 'warning');
            return 'death';
        }

        /**
         * Mark a player eliminated once and track elimination order.
         * @param {string} playerName Player name.
         * @param {string} teamName Player's team.
         * @returns {void}
         */
        markEliminated(playerName, teamName) {
            const canonical = this.state.resolveCanonicalPlayer(playerName);
            const ps = this.state.getOrCreatePlayerStats(canonical, teamName);
            if (ps.eliminated) return;
            ps.eliminated = true;
            if (!this.state.playerEliminationOrder.includes(canonical)) {
                this.state.playerEliminationOrder.push(canonical);
            }
        }

        /**
         * Number of eliminated players on a team.
         * @param {string} teamName Team name.
         * @returns {number} Eliminated count.
         */
        eliminatedCount(teamName) {
            const team = this.state.teams[teamName];
            if (!team) return 0;
            return (team.players || []).filter(p => {
                const ps = this.state.playerStats[p];
                return ps && ps.eliminated;
            }).length;
        }

        /**
         * Team elimination line; resolves by name first, then player data when the
         * in-game color does not match an app team. An already-eliminated team is
         * either a color mismatch or a duplicate broadcast, so it is only reassigned
         * to a team that is genuinely fully knocked out.
         * @param {string} clean Stripped chat line.
         * @returns {boolean} True when handled.
         */
        detectTeamElimination(clean) {
            const m = clean.match(/(.+?)\s+(?:Team\s+)?has been (?:ELIMINATED|eliminated)!?$/i);
            if (!m) return false;
            let teamName = this.resolveTeamFromLabel(m[1].trim());

            if (teamName) {
                const inferred = this.inferEliminatedTeam();
                if (inferred && inferred !== teamName && this.eliminatedCount(inferred) > this.eliminatedCount(teamName)) {
                    teamName = inferred;
                }
            } else {
                teamName = this.inferEliminatedTeam();
            }
            if (!teamName) return false;
            if (this.state.eliminationOrder.includes(teamName)) {
                const inferred = this.inferEliminatedTeam();
                if (!inferred || !this.engine.isTeamFullyEliminated(inferred)) return true;
                teamName = inferred;
            }

            this.state.eliminationOrder.push(teamName);
            const team = this.state.teams[teamName];
            if (team && team.players) {
                for (const p of team.players) this.markEliminated(p, teamName);
            }
            this.state.addLog(`${teamName} eliminated (${this.state.eliminationOrder.length} out)`, 'warning');
            this.afterTeamEliminated(teamName);
            return true;
        }

        /**
         * Record placement for a newly eliminated team. PvP placements wait for
         * Game OVER so tied surviving teams can share a placement.
         * @param {string} teamName Eliminated team.
         * @returns {void}
         */
        afterTeamEliminated(teamName) {
            if (this.features.individualSurvival || this.features.pvp) return;
            this.engine.recordTeamEliminationPlacement(teamName);
            this.engine.tryFinalize();
        }

        /**
         * Unresolved app team with the most eliminated players.
         * @returns {string|null} Team name or null.
         */
        inferEliminatedTeam() {
            let best = null, bestCount = -1;
            for (const t of this.engine.getActiveTeams()) {
                const count = this.eliminatedCount(t);
                if (count > bestCount) {
                    bestCount = count;
                    best = t;
                }
            }
            return best;
        }

        /**
         * Winner line; falls back to the last active team on a color mismatch.
         * Solo PvP placements are left for Game OVER.
         * @param {string} clean Stripped chat line.
         * @returns {boolean} True when handled.
         */
        detectWinner(clean) {
            const m = clean.match(/(.+?)\s+(?:Team\s+)?(?:is the WINNER|are the WINNERS|are the champions?|is the champion)!?$/i);
            if (!m) return false;
            let teamName = this.resolveTeamFromLabel(m[1].trim());

            if (!teamName || this.state.eliminationOrder.includes(teamName)) {
                const active = this.engine.getActiveTeams();
                if (active.length === 1) teamName = active[0];
                else if (active.length === 0) teamName = null;
            }
            if (!teamName) return false;
            this.state.addLog(`${teamName} WON!`, 'success');
            if (this.features.individualSurvival && !this.features.pvp) {
                this.engine.finalizePlayerPlacements();
                return true;
            }
            this.engine.finalizeGamePlacements(teamName);
            return true;
        }

        /**
         * Map an in-game team label to a manually-assigned app team.
         * @param {string} label In-game label like "Red Team".
         * @returns {string|null} App team name or null.
         */
        resolveTeamFromLabel(label) {
            const upper = label.trim().toUpperCase();
            if (this.state.teams[upper]) return upper;
            const word = upper.replace(/\bTEAM\b/i, '').trim();
            if (this.state.teams[word]) return word;
            for (const teamName of Object.keys(this.state.teams)) {
                if (word.startsWith(teamName + ' ') || word.endsWith(' ' + teamName)) return teamName;
            }
            return null;
        }

        /**
         * Individual placement line (DeathRun-style by default).
         * @param {string} clean Stripped chat line.
         * @returns {boolean} True when handled.
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

        /**
         * Placement patterns with capture-group indexes for name and position.
         * @returns {Array<{pattern: RegExp, name: number, pos: number}>} Patterns.
         */
        placementRegexes() {
            return [
                { pattern: /(?:\u00BB\s*)?(You|[A-Za-z0-9_ ]+?)\s+(?:has\s+)?finished in\s+(\d+)(?:st|nd|rd|th)\s+place/i, name: 1, pos: 2 },
                { pattern: /(?:\u00BB\s*)?(\d+)(?:st|nd|rd|th)\s+Place:\s+([A-Za-z0-9_ ]+?)(?:\s|$|\[)/i, name: 2, pos: 1 }
            ];
        }

        /**
         * Record an individual finish placement once and track team finishes.
         * @param {string} playerName Player name.
         * @param {number} position 1-based position.
         * @returns {boolean} True when the player is on a team.
         */
        recordIndividualPlacement(playerName, position) {
            const team = this.resolvePlayerTeam(playerName);
            if (!team) return false;
            const canonical = this.state.resolveCanonicalPlayer(playerName);
            const ps = this.state.getOrCreatePlayerStats(canonical, team);
            ps.placement = ChatUtils.ordinal(position);

            const key = this.engine.placementKey(position);
            if (key) {
                const score = this.state.ensureScore(team);
                if (!score.placements.some(p => p.player === canonical && p.position === position)) {
                    this.engine.awardPoints(team, key);
                    score.placements.push({ player: canonical, position, time: new Date().toISOString() });
                }
            }
            this.state.addLog(`${team} - ${this.subLabel(playerName, canonical)} finished ${ChatUtils.ordinal(position)}`, 'info');

            if (this.features.teamFinish) this.trackTeamFinish(team, canonical);
            return true;
        }

        /**
         * Track a player's finish and award team-finish bonuses in order; 2nd/3rd
         * tiers need the extended toggle.
         * @param {string} teamName Team name.
         * @param {string} playerName Player name.
         * @returns {void}
         */
        trackTeamFinish(teamName, playerName) {
            if (!this.engine.isScorableTeam(teamName)) return;
            const finished = this.state.playersFinished[teamName] = this.state.playersFinished[teamName] || [];
            if (!finished.includes(playerName)) finished.push(playerName);
            const team = this.state.teams[teamName];
            if (!team || !team.players) return;
            if (!team.players.every(p => finished.includes(p)) || this.state.teamsFullyFinished.includes(teamName)) return;

            this.state.teamsFullyFinished.push(teamName);
            const position = this.state.teamsFullyFinished.length;
            if (position > 1 && !this.points.enableExtendedTeamBonuses) return;
            const tiers = [
                ['First full team finish', 'FIRST'],
                ['Second full team finish', 'SECOND'],
                ['Third full team finish', 'THIRD']
            ];
            const tier = tiers[position - 1];
            if (!tier) return;
            this.engine.awardPoints(teamName, tier[0]);
            this.state.addLog(`${teamName} is the ${tier[1]} team to fully finish!`, 'success');
        }

        /**
         * Resolve "You" to the configured local IGN.
         * @param {string} raw Captured name or "You".
         * @returns {string|null} Player name or null when unresolvable.
         */
        resolvePlayerName(raw) {
            if (!raw) return null;
            const name = raw.trim();
            if (!/^you$/i.test(name)) return name;
            const ign = (this.points.myIgn || '').trim();
            if (!ign) {
                this.state.addLog('Skipped a "You" event - set "My IGN" in Settings to score it', 'warning');
                return null;
            }
            return ign;
        }
    }

    global.Hive = global.Hive || {};
    global.Hive.parsers = global.Hive.parsers || {};
    global.Hive.parsers.GamemodeParser = GamemodeParser;

    if (typeof module !== 'undefined' && module.exports) module.exports = GamemodeParser;
})(typeof window !== 'undefined' ? window : globalThis);
