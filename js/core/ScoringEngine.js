/**
 * ScoringEngine - shared scoring logic that sits between GameState and the
 * per-gamemode parsers. It owns:
 *  - awarding points to teams (single place that mutates score totals + events)
 *  - team / player placement recording and finalisation
 *  - player point-contribution math (used by stats renderers)
 *  - routing a chat line to the active gamemode parser
 *
 * Parsers call back into the engine for award/placement so the rules live in one
 * place; the engine never reaches into the DOM.
 */
(function (global) {
    'use strict';

    const PLACEMENT_KEYS = { 1: '1st place', 2: '2nd place', 3: '3rd place', 4: '4th place', 5: '5th place' };

    class ScoringEngine {
        constructor(state, pointSystem) {
            this.state = state;
            this.points = pointSystem;
            this.parsers = {}; // gamemode -> parser instance
        }

        registerParser(gamemode, parser) {
            this.parsers[gamemode] = parser;
        }

        parserFor(gamemode) {
            if (this.parsers[gamemode]) return this.parsers[gamemode];
            const norm = String(gamemode || '').replace(/\s+/g, '').toLowerCase();
            for (const [name, parser] of Object.entries(this.parsers)) {
                if (name.replace(/\s+/g, '').toLowerCase() === norm) return parser;
            }
            return null;
        }

        placementKey(position) {
            return PLACEMENT_KEYS[position] || null;
        }

        /** Award points for an event type to a team, recording it in the events log. */
        awardPoints(teamName, eventType) {
            const table = this.points.forGamemode(this.state.gamemode);
            if (!table) return 0;
            const pts = table[eventType];
            if (pts === undefined) return 0;

            const score = this.state.ensureScore(teamName);
            score.score += pts;
            score.events.push({ type: eventType, points: pts, time: new Date().toISOString() });
            return pts;
        }

        hasPlacement(teamName, placementKey) {
            const s = this.state.scores[teamName];
            return !!(s && s.events.some(e => e.type === placementKey));
        }

        getActiveTeams() {
            return Object.keys(this.state.teams).filter(t => !this.state.eliminationOrder.includes(t));
        }

        // ---- team placements ---------------------------------------------
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

        /** Record placement for a team being eliminated, derived from elimination order. */
        recordTeamEliminationPlacement(teamName) {
            const totalTeams = Object.keys(this.state.teams).length;
            const position = totalTeams - this.state.eliminationOrder.indexOf(teamName);
            this.recordTeamPlacement(teamName, position);
        }

        /** If only one team remains active, finalise the whole game with it as winner. */
        tryFinalize() {
            const active = this.getActiveTeams();
            if (active.length === 1) this.finalizeGamePlacements(active[0]);
        }

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

        // ---- player placements (individual-survival modes) ---------------
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
         * Assign placements to every player from elimination order: first eliminated
         * gets last place; survivors fill the top slots. Used by Block Drop / Block Party.
         */
        finalizePlayerPlacements() {
            const allPlayers = this.state.allPlayerNames();
            const totalPlayers = allPlayers.length;
            if (totalPlayers === 0) return;

            const assigned = new Set();
            const order = this.state.playerEliminationOrder;
            for (let i = 0; i < order.length; i++) {
                const name = order[i];
                const team = this.state.findPlayerTeam(name);
                if (!team) continue;
                this.recordPlayerPlacement(team, name, totalPlayers - i);
                assigned.add(name);
            }
            // Survivors (never eliminated) take the best remaining slots.
            const survivors = allPlayers.filter(n => !assigned.has(n)).sort((a, b) => a.localeCompare(b));
            for (let i = 0; i < survivors.length; i++) {
                const team = this.state.findPlayerTeam(survivors[i]);
                if (team) this.recordPlayerPlacement(team, survivors[i], survivors.length - i);
            }
            this.state.currentGameCompleted = true;
        }

        // ---- contribution math (for stats display) -----------------------
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

        currentPlayerContribution(playerName, playerData) {
            if (!playerData || !playerData.team) return 0;
            const teamScore = this.state.scores[playerData.team];
            const table = this.points.forGamemode(this.state.gamemode) || {};
            return this.playerContribution(teamScore, playerName, playerData, table);
        }

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
