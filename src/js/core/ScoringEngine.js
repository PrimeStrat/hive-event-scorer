/**
 * ScoringEngine - shared scoring logic between GameState and the parsers:
 * point awards, placements, finalisation, and contribution math.
 */
(function (global) {
    'use strict';

    const MAX_PLACEMENTS = 50;
    const PLACEMENT_KEYS = {};
    for (let i = 1; i <= MAX_PLACEMENTS; i++) {
        PLACEMENT_KEYS[i] = global.Hive.ChatUtils.ordinal(i) + ' place';
    }
    const UNKNOWN_TEAM = 'UNKNOWN';

    class ScoringEngine {
        /**
         * @param {GameState} state Shared game state.
         * @param {PointSystem} pointSystem Point tables and toggles.
         */
        constructor(state, pointSystem) {
            this.state = state;
            this.points = pointSystem;
            this.parsers = {};
        }

        /**
         * Register a parser instance for a gamemode.
         * @param {string} gamemode Gamemode name.
         * @param {GamemodeParser} parser Parser instance.
         * @returns {void}
         */
        registerParser(gamemode, parser) {
            this.parsers[gamemode] = parser;
        }

        /**
         * Parser for a gamemode, tolerant of spacing/case differences.
         * @param {string} gamemode Gamemode name.
         * @returns {GamemodeParser|null} Parser or null.
         */
        parserFor(gamemode) {
            if (this.parsers[gamemode]) return this.parsers[gamemode];
            const norm = String(gamemode || '').replace(/\s+/g, '').toLowerCase();
            for (const [name, parser] of Object.entries(this.parsers)) {
                if (name.replace(/\s+/g, '').toLowerCase() === norm) return parser;
            }
            return null;
        }

        /**
         * Point-table key for a finishing position.
         * @param {number} position 1-based position.
         * @returns {string|null} Key like "3rd place" or null.
         */
        placementKey(position) {
            return PLACEMENT_KEYS[position] || null;
        }

        /**
         * True for a team that should accrue points (any real team, not UNKNOWN).
         * @param {string} teamName Team name.
         * @returns {boolean} Whether the team scores.
         */
        isScorableTeam(teamName) {
            return !!teamName && teamName !== UNKNOWN_TEAM;
        }

        /**
         * True for a player currently on a scorable team.
         * @param {string} playerName Player name.
         * @returns {boolean} Whether the player scores.
         */
        isScorablePlayer(playerName) {
            return this.isScorableTeam(this.state.findPlayerTeam(playerName));
        }

        /**
         * Award points for an event type to a team and record the event.
         * @param {string} teamName Team name.
         * @param {string} eventType Point-table key.
         * @returns {number} Points awarded.
         */
        awardPoints(teamName, eventType) {
            if (!this.isScorableTeam(teamName)) return 0;
            const table = this.points.forGamemode(this.state.gamemode);
            if (!table) return 0;
            const pts = table[eventType];
            if (pts === undefined) return 0;

            const score = this.state.ensureScore(teamName);
            score.score += pts;
            score.events.push({ type: eventType, points: pts, time: new Date().toISOString() });
            return pts;
        }

        /**
         * True when a team already has an event of the given type.
         * @param {string} teamName Team name.
         * @param {string} placementKey Event type.
         * @returns {boolean} Whether the event exists.
         */
        hasPlacement(teamName, placementKey) {
            const s = this.state.scores[teamName];
            return !!(s && s.events.some(e => e.type === placementKey));
        }

        /**
         * Teams not yet eliminated.
         * @returns {string[]} Team names.
         */
        getActiveTeams() {
            return Object.keys(this.state.teams).filter(t => !this.state.eliminationOrder.includes(t));
        }

        /**
         * Number of players on a team still alive.
         * @param {string} teamName Team name.
         * @returns {number} Alive count.
         */
        aliveCount(teamName) {
            const team = this.state.teams[teamName];
            if (!team || !team.players) return 0;
            return team.players.filter(p => {
                const ps = this.state.playerStats[p];
                return !ps || !ps.eliminated;
            }).length;
        }

        /**
         * True when every player on a team is eliminated.
         * @param {string} teamName Team name.
         * @returns {boolean} Whether the team is knocked out.
         */
        isTeamFullyEliminated(teamName) {
            const team = this.state.teams[teamName];
            if (!team || !team.players || team.players.length === 0) return false;
            return team.players.every(p => {
                const ps = this.state.playerStats[p];
                return ps && ps.eliminated;
            });
        }

        /**
         * Record a team's placement and stamp its players.
         * @param {string} teamName Team name.
         * @param {number} position 1-based position.
         * @returns {void}
         */
        recordTeamPlacement(teamName, position) {
            const key = this.placementKey(position);
            if (key && !this.hasPlacement(teamName, key)) {
                this.awardPoints(teamName, key);
            }
            const team = this.state.teams[teamName];
            if (team && team.players) {
                const ord = global.Hive.ChatUtils.ordinal(position);
                for (const p of team.players) {
                    const ps = this.state.getOrCreatePlayerStats(p, teamName);
                    if (!ps.placement) ps.placement = ord;
                }
            }
        }

        /**
         * Record placement for a team just eliminated, from elimination order.
         * @param {string} teamName Team name.
         * @returns {void}
         */
        recordTeamEliminationPlacement(teamName) {
            const totalTeams = Object.keys(this.state.teams).length;
            const position = totalTeams - this.state.eliminationOrder.indexOf(teamName);
            this.recordTeamPlacement(teamName, position);
        }

        /**
         * Finalise the game when only one active team remains.
         * @returns {void}
         */
        tryFinalize() {
            const active = this.getActiveTeams();
            if (active.length === 1) this.finalizeGamePlacements(active[0]);
        }

        /**
         * Close out a team-elimination game from survival state on Game OVER.
         * @returns {void}
         */
        finalizeFromSurvival() {
            const active = this.getActiveTeams();
            if (active.length === 0) return;
            if (active.length === 1) { this.finalizeGamePlacements(active[0]); return; }
            const winner = active.slice().sort((a, b) =>
                this.aliveCount(b) - this.aliveCount(a) || a.localeCompare(b))[0];
            this.finalizeGamePlacements(winner);
        }

        /**
         * Assign final team placements around a winner.
         * @param {string} winnerTeam Winning team name.
         * @returns {void}
         */
        finalizeGamePlacements(winnerTeam) {
            const totalTeams = Object.keys(this.state.teams).length;
            if (winnerTeam && !this.hasPlacement(winnerTeam, '1st place')) {
                this.recordTeamPlacement(winnerTeam, 1);
            }
            for (let i = 0; i < this.state.eliminationOrder.length; i++) {
                this.recordTeamPlacement(this.state.eliminationOrder[i], totalTeams - i);
            }
            for (const teamName of Object.keys(this.state.teams)) {
                if (teamName !== winnerTeam && !this.state.eliminationOrder.includes(teamName)) {
                    this.recordTeamPlacement(teamName, 2);
                }
            }
            this.state.currentGameCompleted = true;
        }

        /**
         * Record an individual player's placement and award its points once.
         * @param {string} teamName Player's team.
         * @param {string} playerName Player name.
         * @param {number} position 1-based position.
         * @returns {void}
         */
        recordPlayerPlacement(teamName, playerName, position) {
            const ps = this.state.getOrCreatePlayerStats(playerName, teamName);
            ps.placement = global.Hive.ChatUtils.ordinal(position);
            const key = this.placementKey(position);
            if (!key) return;
            const score = this.state.ensureScore(teamName);
            const already = score.placements.some(p => p.player === playerName);
            if (!already) {
                this.awardPoints(teamName, key);
                score.placements.push({ player: playerName, position, time: new Date().toISOString() });
            }
        }

        /**
         * Rank every player from elimination order (survivors on top) and award
         * last-standing team bonuses; 2nd/3rd tiers need the extended toggle.
         * Block Party ties among survivors follow blockPartyTieMode.
         * @returns {void}
         */
        finalizePlayerPlacements() {
            const players = [...new Set(this.state.allPlayerNames().map(n => this.state.resolveCanonicalPlayer(n)))]
                .filter(n => this.isScorablePlayer(n));
            const totalPlayers = players.length;
            if (totalPlayers === 0) return;

            const assigned = new Set();
            const finalPositions = [];
            const order = this.state.playerEliminationOrder.filter(n => this.isScorablePlayer(n));
            const survivors = players.filter(n => !order.includes(n)).sort((a, b) => a.localeCompare(b));
            const isBlockPartyTie = this.state.gamemode === 'Block Party' && survivors.length > 1;
            const tieMode = this.points.blockPartyTieMode || 'shared-first';

            for (let i = 0; i < order.length; i++) {
                const name = order[i];
                const team = this.state.findPlayerTeam(name);
                // shared-first ties occupy 1st, pushing eliminated players down one slot.
                const pos = (isBlockPartyTie && tieMode === 'shared-first')
                    ? order.length - i + 1
                    : totalPlayers - i;
                this.recordPlayerPlacement(team, name, pos);
                finalPositions.push({ team, position: pos });
                assigned.add(name);
            }

            if (isBlockPartyTie) {
                const tiedPosition = tieMode === 'shared-placement' ? survivors.length : 1;
                for (const name of survivors) {
                    const team = this.state.findPlayerTeam(name);
                    this.recordPlayerPlacement(team, name, tiedPosition);
                    finalPositions.push({ team, position: tiedPosition });
                }
            } else {
                for (let i = 0; i < survivors.length; i++) {
                    const team = this.state.findPlayerTeam(survivors[i]);
                    const pos = survivors.length - i;
                    this.recordPlayerPlacement(team, survivors[i], pos);
                    finalPositions.push({ team, position: pos });
                }
            }

            const bestByTeam = {};
            for (const r of finalPositions) {
                if (!this.isScorableTeam(r.team)) continue;
                if (bestByTeam[r.team] === undefined || r.position < bestByTeam[r.team]) {
                    bestByTeam[r.team] = r.position;
                }
            }
            const ranking = Object.entries(bestByTeam).sort((a, b) => a[1] - b[1]).map(([t]) => t);
            const bonusEvents = ['Last team standing', 'Second last team standing', 'Third last team standing'];
            const tiers = this.points.enableExtendedTeamBonuses ? 3 : 1;
            for (let i = 0; i < Math.min(tiers, ranking.length); i++) {
                if (!this.hasPlacement(ranking[i], bonusEvents[i])) {
                    this.awardPoints(ranking[i], bonusEvents[i]);
                }
            }
            this.state.currentGameCompleted = true;
        }

        /**
         * Rebuild the current game's team scores from player-tagged records after
         * a roster change, so points follow players to their new team.
         * @returns {void}
         */
        recomputeScores() {
            const features = this.points.featuresFor(this.state.gamemode) || {};
            const kills = [], beds = [], finishPlacements = [];
            for (const s of Object.values(this.state.scores)) {
                if (Array.isArray(s.kills)) kills.push(...s.kills);
                if (Array.isArray(s.bedBreaks)) beds.push(...s.bedBreaks);
                if (Array.isArray(s.placements)) finishPlacements.push(...s.placements);
            }
            this.state.scores = {};
            for (const t of Object.keys(this.state.teams)) this.state.ensureScore(t);

            for (const k of kills) {
                const t = this.state.findPlayerTeam(k.player);
                if (!this.isScorableTeam(t)) continue;
                this.state.ensureScore(t).kills.push(k);
                this.awardPoints(t, 'Kill');
            }
            for (const b of beds) {
                const t = this.state.findPlayerTeam(b.player);
                if (!this.isScorableTeam(t)) continue;
                this.state.ensureScore(t).bedBreaks.push(b);
                this.awardPoints(t, 'Bed Break');
            }

            if (features.individualSurvival) {
                this.finalizePlayerPlacements();
            } else if (features.individualFinish) {
                for (const p of finishPlacements) {
                    const t = this.state.findPlayerTeam(p.player);
                    if (!this.isScorableTeam(t)) continue;
                    this.state.ensureScore(t).placements.push(p);
                    const key = this.placementKey(Number(p.position));
                    if (key) this.awardPoints(t, key);
                }
                if (features.teamFinish) this.recomputeTeamFinishes(finishPlacements);
            }
        }

        /**
         * Re-derive team-finish bonuses from finish positions; 2nd/3rd tiers need
         * the extended toggle.
         * @param {Array<{player: string, position: number}>} finishPlacements Player finish records.
         * @returns {void}
         */
        recomputeTeamFinishes(finishPlacements) {
            const posOf = {};
            for (const p of finishPlacements) posOf[p.player] = Number(p.position);
            const completed = [];
            for (const [teamName, team] of Object.entries(this.state.teams)) {
                if (!this.isScorableTeam(teamName)) continue;
                const members = team.players || [];
                if (members.length === 0 || members.some(m => posOf[m] === undefined)) continue;
                completed.push({ teamName, rank: Math.max(...members.map(m => posOf[m])) });
            }
            completed.sort((a, b) => a.rank - b.rank || a.teamName.localeCompare(b.teamName));
            const bonusEvents = ['First full team finish', 'Second full team finish', 'Third full team finish'];
            const tiers = this.points.enableExtendedTeamBonuses ? 3 : 1;
            for (let i = 0; i < Math.min(tiers, completed.length); i++) {
                this.awardPoints(completed[i].teamName, bonusEvents[i]);
            }
        }

        /**
         * A player's point contribution within a team score record.
         * @param {Object} teamScore Team score bucket.
         * @param {string} playerName Player name.
         * @param {Object} playerData Player stats record.
         * @param {Object} pointSystemTable Point table for the gamemode.
         * @returns {number} Contributed points.
         */
        playerContribution(teamScore, playerName, playerData, pointSystemTable) {
            if (!teamScore) return 0;
            const table = pointSystemTable || {};
            const killPts = Number(table['Kill'] || 0);
            const bedPts = Number(table['Bed Break'] || 0);
            let total = 0;

            if (Array.isArray(teamScore.kills)) {
                total += teamScore.kills.filter(e => e.player === playerName).length * killPts;
            }
            if (Array.isArray(teamScore.bedBreaks)) {
                total += teamScore.bedBreaks.filter(e => e.player === playerName).length * bedPts;
            }
            if (Array.isArray(teamScore.events)) {
                for (const eventType of ['Kill Leader', 'First Blood', 'Mystery Chest']) {
                    const pts = Number(table[eventType] || 0);
                    if (!pts) continue;
                    total += teamScore.events.filter(e => e.type === eventType && e.player === playerName).length * pts;
                }
            }

            let hasPlacementRecord = false;
            if (Array.isArray(teamScore.placements)) {
                for (const pl of teamScore.placements) {
                    if (pl.player !== playerName) continue;
                    hasPlacementRecord = true;
                    const key = this.placementKey(Number(pl.position));
                    if (key && table[key] !== undefined) total += Number(table[key]);
                }
            }
            if (!hasPlacementRecord && playerData && playerData.placement) {
                const m = String(playerData.placement).match(/\d+/);
                if (m) {
                    const key = this.placementKey(Number(m[0]));
                    if (key && table[key] !== undefined) total += Number(table[key]);
                }
            }
            return total;
        }

        /**
         * A player's contribution in the current game.
         * @param {string} playerName Player name.
         * @param {Object} playerData Player stats record.
         * @returns {number} Contributed points.
         */
        currentPlayerContribution(playerName, playerData) {
            if (!playerData || !playerData.team) return 0;
            const teamScore = this.state.scores[playerData.team];
            const table = this.points.forGamemode(this.state.gamemode) || {};
            return this.playerContribution(teamScore, playerName, playerData, table);
        }

        /**
         * A player's contribution in a completed history game.
         * @param {Object} game History record.
         * @param {string} playerName Player name.
         * @param {Object} playerData Player stats record from the game.
         * @returns {number} Contributed points.
         */
        gamePlayerContribution(game, playerName, playerData) {
            if (!game || !playerData || !playerData.team || !game.scores) return 0;
            const teamScore = game.scores[playerData.team];
            const table = this.points.forGamemode(game.gamemode) || {};
            return this.playerContribution(teamScore, playerName, playerData, table);
        }
    }

    ScoringEngine.PLACEMENT_KEYS = PLACEMENT_KEYS;

    global.Hive = global.Hive || {};
    global.Hive.ScoringEngine = ScoringEngine;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = ScoringEngine;
    }
})(typeof window !== 'undefined' ? window : globalThis);
