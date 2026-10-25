/**
 * ScoringEngine - shared scoring logic between GameState and the parsers:
 * point awards, placements, finalisation, and contribution math.
 */
(function (global) {
    'use strict';

    const ChatUtils = global.Hive.ChatUtils;

    const MAX_PLACEMENTS = 50;
    const PLACEMENT_KEYS = {};
    for (let i = 1; i <= MAX_PLACEMENTS; i++) {
        PLACEMENT_KEYS[i] = ChatUtils.ordinal(i) + ' place';
    }
    const UNKNOWN_TEAM = 'UNKNOWN';
    const PLACEMENT_RE = /^\d+(?:st|nd|rd|th) place$/;
    const PLAYER_BONUS_TYPES = ['Kill Leader', 'First Blood', 'Mystery Chest'];
    const STANDING_BONUSES = ['Last team standing', 'Second last team standing', 'Third last team standing'];
    const FINISH_BONUSES = ['First full team finish', 'Second full team finish', 'Third full team finish'];

    /**
     * @typedef {Object} ScoreEvent
     * @property {string} type Point-table key.
     * @property {number} points Points awarded.
     * @property {string} time ISO timestamp.
     * @property {string} [player] Player credited for player bonuses.
     */

    /**
     * @typedef {Object} PlacementRecord
     * @property {string} player Canonical player name.
     * @property {number} position 1-based position.
     * @property {string} time ISO timestamp.
     * @property {string} [type] 'pvp-individual' for solo PvP placements.
     */

    /**
     * @typedef {Object} TeamScore
     * @property {number} score Team total.
     * @property {PlacementRecord[]} placements Individual placements.
     * @property {Array<{player: string, victim: string, time: string}>} kills Kill records.
     * @property {Array<{player: string, time: string}>} bedBreaks Bed break records.
     * @property {ScoreEvent[]} events Every point award.
     */

    class ScoringEngine {
        /**
         * Create an engine over shared state and point tables.
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
            return ChatUtils.lookupMode(this.parsers, gamemode);
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
                const ord = ChatUtils.ordinal(position);
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
         * Finalise the game when only one active team remains; PvP waits for Game OVER.
         * @returns {void}
         */
        tryFinalize() {
            const active = this.getActiveTeams();
            if (active.length !== 1) return;
            const features = this.points.featuresFor(this.state.gamemode) || {};
            if (features.pvp && features.teamElimination) return;
            this.finalizeGamePlacements(active[0]);
        }

        /**
         * Close out a team-elimination game from survival state on Game OVER.
         * PvP games can end with several teams alive, which counts as a tie.
         * @returns {void}
         */
        finalizeFromSurvival() {
            const active = this.getActiveTeams();
            if (active.length === 0) return;
            if (active.length === 1) {
                this.finalizeGamePlacements(active[0]);
                return;
            }

            const features = this.points.featuresFor(this.state.gamemode) || {};
            if (features.pvp && features.teamElimination) {
                this.finalizePvpTeamTie(active);
                return;
            }

            const winner = active.slice().sort((a, b) =>
                this.aliveCount(b) - this.aliveCount(a) || a.localeCompare(b))[0];
            this.finalizeGamePlacements(winner);
        }

        /**
         * Give every surviving PvP team the same placement and rank eliminated teams
         * below them. shared-first with 3 survivors gives 1st, 1st, 1st, 2nd...;
         * shared-placement gives 3rd, 3rd, 3rd, 4th...
         * @param {string[]} activeTeams Teams still alive.
         * @returns {void}
         */
        finalizePvpTeamTie(activeTeams) {
            const tiedTeams = activeTeams.filter(team => this.isScorableTeam(team));
            if (tiedTeams.length === 0) return;

            const sharedFirst = (this.points.pvpTeamTieMode || 'shared-first') === 'shared-first';
            const tiedCount = tiedTeams.length;
            const tiedPosition = sharedFirst ? 1 : tiedCount;
            for (const teamName of tiedTeams) this.recordTeamPlacement(teamName, tiedPosition);

            const order = this.state.eliminationOrder;
            for (let i = 0; i < order.length; i++) {
                const outlasted = order.length - i;
                this.recordTeamPlacement(order[i], sharedFirst ? outlasted + 1 : tiedCount + outlasted);
            }
            this.state.currentGameCompleted = true;
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
            ps.placement = ChatUtils.ordinal(position);
            const key = this.placementKey(position);
            if (!key) return;
            const score = this.state.ensureScore(teamName);
            if (!score.placements.some(p => p.player === playerName)) {
                this.awardPoints(teamName, key);
                score.placements.push({ player: playerName, position, time: new Date().toISOString() });
            }
        }

        /**
         * Scorable canonical player names across every roster.
         * @returns {string[]} Player names.
         */
        scorablePlayers() {
            const names = this.state.allPlayerNames().map(n => this.state.resolveCanonicalPlayer(n));
            return [...new Set(names)].filter(n => this.isScorablePlayer(n));
        }

        /**
         * Award ranked team bonuses; 2nd/3rd tiers need the extended toggle.
         * @param {string[]} ranking Team names, best first.
         * @param {string[]} bonusEvents Bonus keys for 1st, 2nd and 3rd.
         * @returns {void}
         */
        awardTeamBonuses(ranking, bonusEvents) {
            const tiers = this.points.enableExtendedTeamBonuses ? 3 : 1;
            for (let i = 0; i < Math.min(tiers, ranking.length); i++) {
                if (!this.hasPlacement(ranking[i], bonusEvents[i])) {
                    this.awardPoints(ranking[i], bonusEvents[i]);
                }
            }
        }

        /**
         * Rank every player from elimination order (survivors on top) and award
         * last-standing team bonuses. Block Party ties among survivors follow
         * blockPartyTieMode; shared-first pushes eliminated players down one slot.
         * @returns {void}
         */
        finalizePlayerPlacements() {
            const players = this.scorablePlayers();
            const totalPlayers = players.length;
            if (totalPlayers === 0) return;

            const finalPositions = [];
            const order = this.state.playerEliminationOrder.filter(n => this.isScorablePlayer(n));
            const survivors = players.filter(n => !order.includes(n)).sort((a, b) => a.localeCompare(b));
            const isBlockPartyTie = this.state.gamemode === 'Block Party' && survivors.length > 1;
            const tieMode = this.points.blockPartyTieMode || 'shared-first';
            const place = (name, pos) => {
                const team = this.state.findPlayerTeam(name);
                this.recordPlayerPlacement(team, name, pos);
                finalPositions.push({ team, position: pos });
            };

            order.forEach((name, i) => {
                place(name, (isBlockPartyTie && tieMode === 'shared-first') ? order.length - i + 1 : totalPlayers - i);
            });

            if (isBlockPartyTie) {
                const tiedPosition = tieMode === 'shared-placement' ? survivors.length : 1;
                survivors.forEach(name => place(name, tiedPosition));
            } else {
                survivors.forEach((name, i) => place(name, survivors.length - i));
            }

            const bestByTeam = {};
            for (const r of finalPositions) {
                if (!this.isScorableTeam(r.team)) continue;
                if (bestByTeam[r.team] === undefined || r.position < bestByTeam[r.team]) {
                    bestByTeam[r.team] = r.position;
                }
            }
            const ranking = Object.entries(bestByTeam).sort((a, b) => a[1] - b[1]).map(([t]) => t);
            this.awardTeamBonuses(ranking, STANDING_BONUSES);
            this.state.currentGameCompleted = true;
        }

        /**
         * Rank PvP players by enemies outlived; survivors share one placement.
         * @returns {void}
         */
        finalizePvpIndividualPlacements() {
            const players = this.scorablePlayers();
            if (players.length === 0) return;

            const eliminationIndex = {};
            this.state.playerEliminationOrder.forEach((name, index) => {
                const canonical = this.state.resolveCanonicalPlayer(name);
                if (eliminationIndex[canonical] === undefined) eliminationIndex[canonical] = index;
            });

            const survivingTeams = new Set();
            for (const playerName of players) {
                if (eliminationIndex[playerName] !== undefined) continue;
                survivingTeams.add(this.state.findPlayerTeam(playerName));
            }

            const sharedFirst = (this.points.pvpTeamTieMode || 'shared-first') === 'shared-first';
            for (const playerName of players) {
                const playerTeam = this.state.findPlayerTeam(playerName);
                const ownIndex = eliminationIndex[playerName];
                let finalPosition;
                if (ownIndex === undefined) {
                    finalPosition = sharedFirst ? 1 : survivingTeams.size;
                } else {
                    const enemies = players.filter(other => this.state.findPlayerTeam(other) !== playerTeam);
                    const outlived = enemies.filter(e => eliminationIndex[e] !== undefined && eliminationIndex[e] < ownIndex).length;
                    finalPosition = Math.max(1, enemies.length - outlived);
                }
                this.recordPvpIndividualPlacement(playerTeam, playerName, finalPosition);
            }
        }

        /**
         * Record a solo PvP placement once and award its "Indiv" points.
         * @param {string} teamName Player's team.
         * @param {string} playerName Player name.
         * @param {number} position 1-based position.
         * @returns {void}
         */
        recordPvpIndividualPlacement(teamName, playerName, position) {
            const canonical = this.state.resolveCanonicalPlayer(playerName);
            const ps = this.state.getOrCreatePlayerStats(canonical, teamName);
            ps.placement = ChatUtils.ordinal(position);

            const normalKey = this.placementKey(position);
            if (!normalKey) return;
            const score = this.state.ensureScore(teamName);
            if (score.placements.some(p => p.player === canonical && p.type === 'pvp-individual')) return;

            this.awardPoints(teamName, `Indiv ${normalKey}`);
            score.placements.push({ player: canonical, position, type: 'pvp-individual', time: new Date().toISOString() });
        }

        /**
         * Rebuild the current game's team scores from player-tagged records after
         * a roster change, so points follow players to their new team. Player
         * bonuses move with their player and team placements stay with their team.
         * Placements are only re-derived when the game had already been finalised.
         * @returns {void}
         */
        recomputeScores() {
            const features = this.points.featuresFor(this.state.gamemode) || {};
            const kills = [], beds = [], finishPlacements = [], carried = [];
            for (const [teamName, s] of Object.entries(this.state.scores)) {
                if (Array.isArray(s.kills)) kills.push(...s.kills);
                if (Array.isArray(s.bedBreaks)) beds.push(...s.bedBreaks);
                if (Array.isArray(s.placements)) finishPlacements.push(...s.placements);
                for (const e of s.events || []) {
                    if (e.player && PLAYER_BONUS_TYPES.includes(e.type)) {
                        carried.push({ team: this.state.findPlayerTeam(e.player), event: e });
                    } else if (!e.player && features.teamElimination && PLACEMENT_RE.test(e.type)) {
                        carried.push({ team: teamName, event: e });
                    }
                }
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
            for (const c of carried) {
                if (!this.isScorableTeam(c.team) || !this.state.teams[c.team]) continue;
                const s = this.state.ensureScore(c.team);
                s.score += Number(c.event.points) || 0;
                s.events.push(c.event);
            }

            if (features.pvp && features.individualSurvival) {
                if (finishPlacements.some(p => p.type === 'pvp-individual')) this.finalizePvpIndividualPlacements();
            } else if (features.individualSurvival) {
                if (finishPlacements.length > 0) this.finalizePlayerPlacements();
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
         * Re-derive team-finish bonuses from finish positions.
         * @param {PlacementRecord[]} finishPlacements Player finish records.
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
            this.awardTeamBonuses(completed.map(c => c.teamName), FINISH_BONUSES);
        }

        /**
         * Points for the table key of one placement record, or 0.
         * @param {Object<string, number>} table Point table.
         * @param {string|null} key Point-table key.
         * @returns {number} Points.
         */
        static pointsFor(table, key) {
            return key && table[key] !== undefined ? Number(table[key]) : 0;
        }

        /**
         * A player's point contribution within a team score record.
         * @param {TeamScore} teamScore Team score bucket.
         * @param {string} playerName Player name.
         * @param {Object} playerData Player stats record.
         * @param {Object<string, number>} pointSystemTable Point table for the gamemode.
         * @param {GamemodeFeatures} features Feature flags for the gamemode.
         * @returns {number} Contributed points.
         */
        playerContribution(teamScore, playerName, playerData, pointSystemTable, features) {
            if (!teamScore) return 0;
            const table = pointSystemTable || {};
            const mine = list => Array.isArray(list) ? list.filter(e => e.player === playerName) : [];
            let total = mine(teamScore.kills).length * Number(table['Kill'] || 0);
            total += mine(teamScore.bedBreaks).length * Number(table['Bed Break'] || 0);
            for (const eventType of PLAYER_BONUS_TYPES) {
                const pts = Number(table[eventType] || 0);
                if (pts) total += mine(teamScore.events).filter(e => e.type === eventType).length * pts;
            }

            if (!features || !(features.individualFinish || features.individualSurvival)) return total;

            const placements = mine(teamScore.placements);
            for (const pl of placements) {
                let key = this.placementKey(Number(pl.position));
                if (key && features.pvp && pl.type === 'pvp-individual') key = `Indiv ${key}`;
                total += ScoringEngine.pointsFor(table, key);
            }
            if (!features.pvp && placements.length === 0 && playerData && playerData.placement) {
                const m = String(playerData.placement).match(/\d+/);
                if (m) total += ScoringEngine.pointsFor(table, this.placementKey(Number(m[0])));
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
            return this.playerContribution(
                this.state.scores[playerData.team],
                playerName,
                playerData,
                this.points.forGamemode(this.state.gamemode) || {},
                this.points.featuresFor(this.state.gamemode) || {}
            );
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
            return this.playerContribution(
                game.scores[playerData.team],
                playerName,
                playerData,
                this.points.forGamemode(game.gamemode) || {},
                this.points.featuresFor(game.gamemode) || {}
            );
        }
    }

    ScoringEngine.PLACEMENT_KEYS = PLACEMENT_KEYS;

    global.Hive = global.Hive || {};
    global.Hive.ScoringEngine = ScoringEngine;

    if (typeof module !== 'undefined' && module.exports) module.exports = ScoringEngine;
})(typeof window !== 'undefined' ? window : globalThis);
