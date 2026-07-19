/**
 * GameState - single source of truth for all mutable scoring data and its
 * localStorage/JSON persistence.
 */
(function (global) {
    'use strict';

    const PREDEFINED_TEAMS = {
        'YELLOW': { color: '#FFFF55', colorCode: 'e' },
        'LIME': { color: '#55FF55', colorCode: 'a' },
        'RED': { color: '#FF5555', colorCode: 'c' },
        'BLUE': { color: '#5555FF', colorCode: '9' },
        'GOLD': { color: '#FFAA00', colorCode: '6' },
        'MAGENTA': { color: '#FF55FF', colorCode: 'd' },
        'AQUA': { color: '#55FFFF', colorCode: 'b' },
        'GRAY': { color: '#AAAAAA', colorCode: '7' },
        'PURPLE': { color: '#AA00AA', colorCode: '5' },
        'GREEN': { color: '#00AA00', colorCode: '2' },
        'DARK GRAY': { color: '#555555', colorCode: '8' },
        'CYAN': { color: '#00AAAA', colorCode: '3' },
        'UNKNOWN': { color: '#9CA3AF', colorCode: '7' }
    };

    const clone = (v) => JSON.parse(JSON.stringify(v));

    class GameState {
        constructor() {
            this.predefinedTeams = PREDEFINED_TEAMS;

            this.gamemode = '';
            this.currentGame = null;
            this.scores = {};
            this.teams = {};
            this.substitutions = {};
            this.playerStats = {};
            this.activityLog = [];
            this.eliminationOrder = [];
            this.playerEliminationOrder = [];
            this.playersFinished = {};
            this.teamsFullyFinished = [];
            this.gameHistory = [];
            this.currentGameCompleted = false;
            this.editingGameId = null;
            this.skyWarsKillLeader = null;

            this.undoStack = [];
            this.redoStack = [];

            this.onLog = null;
        }

        /**
         * Append an activity-log entry and notify the live listener.
         * @param {string} message Entry text.
         * @param {string} type 'info' | 'success' | 'warning'.
         * @returns {{message: string, type: string, time: string}} The entry.
         */
        addLog(message, type = 'info') {
            const entry = { message, type, time: new Date().toISOString() };
            this.activityLog.push(entry);
            if (typeof this.onLog === 'function') this.onLog(entry);
            return entry;
        }

        /**
         * Map a substitute's name to the rostered player they play for.
         * @param {string} playerName Logged player name.
         * @returns {string} Canonical roster name.
         */
        resolveCanonicalPlayer(playerName) {
            return this.substitutions[playerName] || playerName;
        }

        /**
         * Team a player is rostered on; substitutes resolve to their original.
         * @param {string} playerName Player name.
         * @returns {string|null} Team name or null.
         */
        findPlayerTeam(playerName) {
            const canonical = this.resolveCanonicalPlayer(playerName);
            for (const [teamName, data] of Object.entries(this.teams)) {
                if (data.players && data.players.includes(canonical)) return teamName;
            }
            return null;
        }

        /**
         * Every rostered player name plus substitute aliases (chat-detectable).
         * @returns {string[]} Player names.
         */
        allPlayerNames() {
            const names = [];
            for (const data of Object.values(this.teams)) {
                if (data.players) names.push(...data.players);
            }
            names.push(...Object.keys(this.substitutions || {}));
            return [...new Set(names)];
        }

        /**
         * Add an unrostered player to the catch-all UNKNOWN team.
         * @param {string} playerName Player name.
         * @returns {string|null} The team name, or null for a blank name.
         */
        addUnknownPlayer(playerName) {
            if (!playerName) return null;
            const teamName = 'UNKNOWN';
            const team = this.ensureTeam(teamName);
            if (!team.players.includes(playerName)) {
                team.players.push(playerName);
                this.addLog(`Added unknown player ${playerName} to ${teamName} team`, 'warning');
            }
            this.ensureScore(teamName);
            return teamName;
        }

        /**
         * Return a team record, creating it from presets if missing.
         * @param {string} teamName Team name.
         * @returns {{color: string, colorCode: string, players: string[]}} The team.
         */
        ensureTeam(teamName) {
            if (!this.teams[teamName]) {
                const preset = this.predefinedTeams[teamName] || { color: '#FFFFFF', colorCode: 'f' };
                this.teams[teamName] = { color: preset.color, colorCode: preset.colorCode, players: [] };
            }
            return this.teams[teamName];
        }

        /**
         * Return a player's stats record, creating it if missing. Substitute names
         * resolve to the original player so their stats merge.
         * @param {string} playerName Player name.
         * @param {string} teamName Team to associate.
         * @returns {Object} The stats record.
         */
        getOrCreatePlayerStats(playerName, teamName) {
            const canonical = this.resolveCanonicalPlayer(playerName);
            if (!this.playerStats[canonical]) {
                this.playerStats[canonical] = {
                    team: teamName, kills: 0, deaths: 0, finalKills: 0,
                    bedBreaks: 0, eliminated: false, placement: null
                };
            } else if (teamName) {
                this.playerStats[canonical].team = teamName;
            }
            return this.playerStats[canonical];
        }

        /**
         * Return a team's score bucket, creating it if missing.
         * @param {string} teamName Team name.
         * @returns {Object} The score bucket.
         */
        ensureScore(teamName) {
            if (!this.scores[teamName]) {
                this.scores[teamName] = { score: 0, placements: [], kills: [], bedBreaks: [], events: [] };
            }
            return this.scores[teamName];
        }

        /**
         * Reset all per-game state and begin a new game.
         * @param {string} gamemode Gamemode name.
         * @returns {void}
         */
        startNewGame(gamemode) {
            this.gamemode = gamemode;
            this.currentGame = {
                id: Date.now(),
                gamemode,
                startTime: new Date().toISOString(),
                endTime: null
            };
            this.scores = {};
            this.playerStats = {};
            this.eliminationOrder = [];
            this.playerEliminationOrder = [];
            this.playersFinished = {};
            this.teamsFullyFinished = [];
            this.currentGameCompleted = false;
            this.skyWarsKillLeader = null;

            Object.keys(this.teams).forEach(teamName => this.ensureScore(teamName));
        }

        /**
         * True when the current game has any score buckets.
         * @returns {boolean} Whether scores exist.
         */
        hasActiveScores() {
            return Object.keys(this.scores).length > 0;
        }

        /**
         * Deep-copy the undoable state.
         * @param {string} action Label for the snapshot.
         * @returns {Object} Snapshot.
         */
        captureSnapshot(action) {
            return {
                action,
                currentGame: clone(this.currentGame),
                gameHistory: clone(this.gameHistory),
                teams: clone(this.teams),
                substitutions: clone(this.substitutions),
                activityLog: clone(this.activityLog),
                playerStats: clone(this.playerStats),
                scores: clone(this.scores),
                eliminationOrder: clone(this.eliminationOrder),
                playerEliminationOrder: clone(this.playerEliminationOrder),
                playersFinished: clone(this.playersFinished),
                teamsFullyFinished: clone(this.teamsFullyFinished)
            };
        }

        /**
         * Restore a snapshot produced by captureSnapshot.
         * @param {Object} s Snapshot.
         * @returns {void}
         */
        restoreSnapshot(s) {
            this.currentGame = clone(s.currentGame);
            this.gameHistory = clone(s.gameHistory);
            this.teams = clone(s.teams);
            this.substitutions = clone(s.substitutions || {});
            this.activityLog = clone(s.activityLog);
            this.playerStats = clone(s.playerStats);
            this.scores = clone(s.scores);
            this.eliminationOrder = clone(s.eliminationOrder);
            this.playerEliminationOrder = clone(s.playerEliminationOrder);
            this.playersFinished = clone(s.playersFinished);
            this.teamsFullyFinished = clone(s.teamsFullyFinished);
        }

        /**
         * Push an undo snapshot and clear the redo stack.
         * @param {string} action Label for the snapshot.
         * @returns {void}
         */
        pushUndo(action) {
            this.undoStack.push(this.captureSnapshot(action));
            this.redoStack = [];
        }

        /**
         * Undo the latest snapshot.
         * @returns {string|null} The undone action label, or null.
         */
        undo() {
            if (this.undoStack.length === 0) return null;
            const state = this.undoStack.pop();
            this.redoStack.push(this.captureSnapshot(state.action));
            this.restoreSnapshot(state);
            return state.action;
        }

        /**
         * Redo the latest undone snapshot.
         * @returns {string|null} The redone action label, or null.
         */
        redo() {
            if (this.redoStack.length === 0) return null;
            const state = this.redoStack.pop();
            this.undoStack.push(this.captureSnapshot(state.action));
            this.restoreSnapshot(state);
            return state.action;
        }

        /**
         * Roll the current game into gameHistory (updates an existing record by id).
         * @returns {boolean} False when there is nothing to save.
         */
        saveGameToHistory() {
            if (!this.currentGame || !this.hasActiveScores()) return false;
            this.currentGame.endTime = new Date().toISOString();
            const record = {
                id: this.currentGame.id,
                gamemode: this.currentGame.gamemode,
                startTime: this.currentGame.startTime,
                endTime: this.currentGame.endTime,
                scores: clone(this.scores),
                playerStats: clone(this.playerStats),
                eliminationOrder: [...this.eliminationOrder],
                playerEliminationOrder: [...this.playerEliminationOrder]
            };
            const idx = this.gameHistory.findIndex(g => String(g.id) === String(record.id));
            if (idx !== -1) this.gameHistory[idx] = record;
            else this.gameHistory.push(record);
            this.currentGameCompleted = false;
            return true;
        }

        /**
         * Build the full persistable data object.
         * @param {Object} extra Extra fields to merge in.
         * @returns {Object} Serialized data.
         */
        serialize(extra = {}) {
            return Object.assign({
                teams: this.teams,
                substitutions: this.substitutions,
                currentGame: this.currentGame,
                scores: this.scores,
                playerStats: this.playerStats,
                eliminationOrder: this.eliminationOrder,
                playerEliminationOrder: this.playerEliminationOrder,
                gameHistory: this.gameHistory,
                playersFinished: this.playersFinished,
                teamsFullyFinished: this.teamsFullyFinished,
                undoStack: this.undoStack,
                redoStack: this.redoStack,
                gamemode: this.gamemode
            }, extra);
        }

        /**
         * Apply serialized data over the current state.
         * @param {Object} data Serialized data.
         * @param {{includeTeams: boolean}} opts Whether to overwrite teams.
         * @returns {void}
         */
        applyData(data, { includeTeams = true } = {}) {
            if (!data) return;
            if (includeTeams && data.teams) this.teams = data.teams;
            if (data.substitutions && typeof data.substitutions === 'object' && !Array.isArray(data.substitutions)) {
                this.substitutions = data.substitutions;
            }
            if (data.currentGame) this.currentGame = data.currentGame;
            if (data.scores) this.scores = data.scores;
            if (data.playerStats) this.playerStats = data.playerStats;
            if (data.eliminationOrder) this.eliminationOrder = data.eliminationOrder;
            if (data.playerEliminationOrder) this.playerEliminationOrder = data.playerEliminationOrder;
            if (Array.isArray(data.gameHistory)) this.gameHistory = data.gameHistory;
            if (data.playersFinished) this.playersFinished = data.playersFinished;
            if (data.teamsFullyFinished) this.teamsFullyFinished = data.teamsFullyFinished;
            this.undoStack = Array.isArray(data.undoStack) ? data.undoStack : [];
            this.redoStack = Array.isArray(data.redoStack) ? data.redoStack : [];
            if (data.gamemode) this.gamemode = data.gamemode;
        }

        /**
         * Load persisted teams, event data and history from localStorage.
         * @returns {void}
         */
        loadFromStorage() {
            const store = global.Hive.Storage;
            if (!store) return;
            const savedTeams = store.getItem('hive_teams');
            if (savedTeams) {
                try { this.teams = JSON.parse(savedTeams); } catch (e) { console.error('teams load', e); }
            }
            const savedSubs = store.getItem('hive_substitutions');
            if (savedSubs) {
                try {
                    const parsed = JSON.parse(savedSubs);
                    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) this.substitutions = parsed;
                } catch (e) { console.error('subs load', e); }
            }
            try {
                const eventData = store.getItem('hive_event_data');
                if (eventData) this.applyData(JSON.parse(eventData), { includeTeams: false });
                const history = store.getItem('hive_game_history');
                if (history) {
                    const parsed = JSON.parse(history);
                    if (Array.isArray(parsed)) this.gameHistory = parsed;
                }
            } catch (e) {
                console.error('Error loading persistent data:', e);
                this.gameHistory = []; this.undoStack = []; this.redoStack = [];
            }
        }

        /**
         * Persist all state to the app data store.
         * @returns {void}
         */
        syncToStorage() {
            const store = global.Hive.Storage;
            if (!store) return;
            store.setItem('hive_teams', JSON.stringify(this.teams));
            store.setItem('hive_substitutions', JSON.stringify(this.substitutions));
            store.setItem('hive_game_history', JSON.stringify(this.gameHistory));
            store.setItem('hive_event_data', JSON.stringify(this.serialize()));
        }

        /**
         * Persist team rosters and substitutions only.
         * @returns {void}
         */
        saveTeams() {
            const store = global.Hive.Storage;
            if (!store) return;
            store.setItem('hive_teams', JSON.stringify(this.teams));
            store.setItem('hive_substitutions', JSON.stringify(this.substitutions));
        }

        /**
         * Wipe all scoring statistics and history while keeping team rosters.
         * @returns {void}
         */
        wipeStatistics() {
            this.currentGame = null;
            this.scores = {};
            this.playerStats = {};
            this.eliminationOrder = [];
            this.playerEliminationOrder = [];
            this.playersFinished = {};
            this.teamsFullyFinished = [];
            this.gameHistory = [];
            this.currentGameCompleted = false;
            this.editingGameId = null;
            this.undoStack = [];
            this.redoStack = [];

            const store = global.Hive.Storage;
            if (store) {
                store.removeItem('hive_game_history');
                store.removeItem('hive_event_data');
                store.removeItem('hive_emergency_backup');
            }
        }

        /**
         * True when there is any data worth saving.
         * @returns {boolean} Whether stats, scores or history exist.
         */
        hasDataToSave() {
            return Object.keys(this.playerStats).length > 0 ||
                Object.keys(this.scores).length > 0 ||
                this.gameHistory.length > 0;
        }
    }

    GameState.PREDEFINED_TEAMS = PREDEFINED_TEAMS;

    global.Hive = global.Hive || {};
    global.Hive.GameState = GameState;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = GameState;
    }
})(typeof window !== 'undefined' ? window : globalThis);
