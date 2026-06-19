/**
 * HiveEventScorer (controller) - wires the DOM to the state/engine/parsers/renderers.
 *
 * Owns: tab switching (no reload), event listeners, chat processing, team
 * management, undo/redo, JSON save/load, settings actions, emergency autosave.
 * All scoring rules live in the parsers/engine; all rendering lives in the
 * renderers. This class is the glue.
 */
(function (global) {
    'use strict';
    const H = global.Hive;

    class HiveEventScorer {
        constructor() {
            this.state = new H.GameState();
            this.points = new H.PointSystem();
            this.engine = new H.ScoringEngine(this.state, this.points);

            this.scoreboard = new H.renderers.ScoreboardRenderer(this);
            this.teamsView = new H.renderers.TeamsRenderer(this);
            this.statsView = new H.renderers.StatsRenderer(this);
            this.settingsView = new H.renderers.SettingsRenderer(this);

            this.init();
        }

        init() {
            this.state.loadFromStorage();
            this.points.load();
            H.parserRegistry.buildAll(this.state, this.engine, this.points);

            // Live activity-log updates as events are recorded during processing.
            this.state.onLog = () => this.scoreboard.renderActivityLog();

            this.loadEmergencySave();
            this.updateGamemodeDropdowns();
            this.setupEventListeners();
            this.applySavedGamemodeSelection();
            this.syncGamemodeFromSelection();
            this.updateUI();

            window.addEventListener('beforeunload', (e) => {
                this.emergencySave();
                if (this.state.hasDataToSave()) {
                    const msg = 'You have unsaved data. Download a JSON backup before leaving?';
                    e.preventDefault(); e.returnValue = msg; return msg;
                }
            });
            setInterval(() => { if (this.state.hasDataToSave()) this.emergencySave(); }, 30000);
        }

        // ================= event wiring =================
        setupEventListeners() {
            document.querySelectorAll('.nav-tab').forEach(tab => {
                tab.addEventListener('click', e => { e.preventDefault(); this.switchTab(e.currentTarget.dataset.tab); });
            });

            this.on('gamemode', 'change', e => {
                this.state.gamemode = e.target.value;
                if (this.state.gamemode) this.startNewGame();
                this.updateUI();
            });

            this.on('processBtn', 'click', () => this.processChat(false));
            this.on('processSingleLine', 'click', () => this.processChat(true));
            this.on('clearInput', 'click', () => { const t = document.getElementById('chatInput'); if (t) t.value = ''; });

            this.on('resetScores', 'click', () => {
                if (confirm('Reset all scores for this game?')) {
                    this.state.pushUndo('resetScores');
                    this.state.scores = {};
                    this.state.eliminationOrder = [];
                    this.state.playerEliminationOrder = [];
                    this.state.playersFinished = {};
                    this.state.teamsFullyFinished = [];
                    Object.keys(this.state.teams).forEach(t => this.state.ensureScore(t));
                    this.state.addLog('Scores reset', 'warning');
                    this.state.syncToStorage();
                    this.updateUI();
                }
            });

            this.on('saveBtn', 'click', () => this.saveData());
            this.on('loadBtn', 'click', () => document.getElementById('fileInput').click());
            this.on('fileInput', 'change', e => this.importJSON(e));
            this.on('clearLog', 'click', () => { this.state.activityLog = []; this.scoreboard.renderActivityLog(); });

            this.on('undoBtn', 'click', () => this.performUndo());
            this.on('redoBtn', 'click', () => this.performRedo());

            const gh = document.getElementById('gameHistory');
            if (gh) gh.addEventListener('click', e => this.handleGameHistoryActions(e));

            this.setupTeamManagement();
            this.setupSettingsManagement();

            const sort = document.getElementById('playerStatsSort');
            if (sort) {
                sort.value = this.statsView.sortMode;
                sort.addEventListener('change', e => { this.statsView.sortMode = e.target.value; this.statsView.renderPlayerStats(); });
            }
        }

        on(id, evt, handler) {
            const el = document.getElementById(id);
            if (el) el.addEventListener(evt, handler);
        }

        setupTeamManagement() {
            this.on('addPlayer', 'click', () => this.addPlayerToTeam(false));
            this.on('playerName', 'keypress', e => { if (e.key === 'Enter') this.addPlayerToTeam(false); });
            this.on('addBulkPlayers', 'click', () => this.addPlayerToTeam(true));
            this.on('clearAllPlayers', 'click', () => {
                if (confirm('Remove all players from all teams? This can be undone.')) this.clearAllPlayers();
            });
        }

        setupSettingsManagement() {
            this.on('settingsGamemode', 'change', () => { this.settingsView.renderPoints(); this.settingsView.updatePatternVisibility(); });
            this.on('addNewGamemode', 'click', () => this.addNewGamemode());
            this.on('deleteGamemode', 'click', () => this.deleteGamemode());
            this.on('saveSettings', 'click', () => this.saveSettings());
            this.on('resetSettings', 'click', () => {
                if (confirm('Reset all settings to defaults? This cannot be undone.')) {
                    this.points.reset(); this.updateGamemodeDropdowns(); this.settingsView.renderAll();
                    alert('Settings reset to defaults!'); this.state.addLog('Settings reset', 'warning');
                }
            });
            this.on('exportSettings', 'click', () => this.exportSettingsJSON());
            this.on('importSettings', 'click', () => document.getElementById('settingsFileInput').click());
            this.on('settingsFileInput', 'change', e => this.importSettingsJSON(e));
            this.settingsView.renderAll();
        }

        // ================= tabs =================
        switchTab(tabName) {
            document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
            const content = document.getElementById(tabName);
            if (content) content.classList.add('active');
            const nav = document.querySelector(`.nav-tab[data-tab="${tabName}"]`);
            if (nav) nav.classList.add('active');

            if (tabName === 'teams') this.teamsView.render();
            else if (tabName === 'stats') this.statsView.renderAll();
            else if (tabName === 'settings') this.settingsView.renderAll();
        }

        // ================= game flow =================
        startNewGame() {
            if (!this.state.gamemode) { alert('Please select a gamemode first!'); return; }
            if (this.state.currentGame && this.state.hasActiveScores()) {
                if (confirm('Start a new game? Current game will be saved to history.')) {
                    this.saveGameToHistory();
                } else { return; }
            }
            this.state.pushUndo('startNewGame');
            this.state.startNewGame(this.state.gamemode);
            this.state.syncToStorage();
            this.state.addLog(`Started new ${this.state.gamemode} game`, 'info');
            this.updateUI();
        }

        processChat(lastLineOnly) {
            if (!this.state.gamemode) { alert('Please select a gamemode first!'); return; }
            const input = document.getElementById('chatInput');
            const raw = input ? input.value : '';
            if (!raw.trim()) { alert('Please enter some chat text to process!'); return; }

            const parser = this.engine.parserFor(this.state.gamemode);
            if (!parser) { alert('No parser available for this gamemode.'); return; }

            this.state.pushUndo('processChat');

            let lines = raw.split('\n').filter(l => l.trim());
            if (lastLineOnly) lines = lines.slice(-1);

            let processed = 0;
            for (const line of lines) { if (parser.parseLine(line)) processed++; }

            if (input) input.value = '';
            this.state.addLog(`Processed ${processed} event(s) from ${lines.length} line(s)`, 'info');

            if (this.state.currentGameCompleted && this.state.currentGame && this.state.hasActiveScores()) {
                this.saveGameToHistory();
            }
            this.state.syncToStorage();
            this.updateUI();
        }

        saveGameToHistory() {
            this.state.pushUndo('saveGameToHistory');
            if (this.state.saveGameToHistory()) {
                this.state.syncToStorage();
                this.state.addLog(`Game saved to history: ${this.state.currentGame.gamemode}`, 'info');
            }
        }

        // ================= teams =================
        addPlayerToTeam(bulk) {
            const teamName = (document.getElementById('teamSelect') || {}).value;
            if (!teamName) { alert('Please select a team!'); return; }

            let toAdd = [];
            if (bulk) {
                const txt = (document.getElementById('bulkPlayerNames') || {}).value || '';
                if (!txt.trim()) { alert('Please enter player names in the bulk input area!'); return; }
                toAdd = txt.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
            } else {
                const name = ((document.getElementById('playerName') || {}).value || '').trim();
                if (!name) { alert('Please enter a player name!'); return; }
                toAdd = [name];
            }

            this.state.pushUndo('addPlayer');
            for (const name of toAdd) {
                this.removePlayerFromAllTeams(name);
                this.state.ensureTeam(teamName);
                if (!this.state.teams[teamName].players.includes(name)) this.state.teams[teamName].players.push(name);
            }

            const pn = document.getElementById('playerName'); if (pn) pn.value = '';
            if (bulk) { const bp = document.getElementById('bulkPlayerNames'); if (bp) bp.value = ''; }

            this.state.addLog(`Added ${toAdd.length} player(s) to ${teamName}`, 'info');
            this.state.saveTeams(); this.state.syncToStorage();
            this.teamsView.render(); this.updateUI();
        }

        removePlayerFromAllTeams(name) {
            for (const team of Object.keys(this.state.teams)) {
                const i = this.state.teams[team].players.indexOf(name);
                if (i > -1) {
                    this.state.teams[team].players.splice(i, 1);
                    if (this.state.teams[team].players.length === 0) delete this.state.teams[team];
                }
            }
        }

        removePlayer(teamName, playerName) {
            if (!this.state.teams[teamName]) return;
            this.state.pushUndo('removePlayer');
            const i = this.state.teams[teamName].players.indexOf(playerName);
            if (i > -1) this.state.teams[teamName].players.splice(i, 1);
            if (this.state.teams[teamName].players.length === 0) delete this.state.teams[teamName];
            this.state.saveTeams(); this.state.syncToStorage();
            this.teamsView.render(); this.updateUI();
        }

        changePlayerTeam(playerName, oldTeam, newTeam) {
            this.state.pushUndo('changePlayerTeam');
            this.removePlayerFromAllTeams(playerName);
            this.state.ensureTeam(newTeam);
            if (!this.state.teams[newTeam].players.includes(playerName)) this.state.teams[newTeam].players.push(playerName);
            if (this.state.playerStats[playerName]) this.state.playerStats[playerName].team = newTeam;
            this.state.saveTeams(); this.state.syncToStorage();
            this.teamsView.render(); this.updateUI();
            this.state.addLog(`${playerName} moved from ${oldTeam} to ${newTeam}`, 'info');
        }

        clearAllPlayers() {
            this.state.pushUndo('clearAllPlayers');
            this.state.teams = {};
            this.state.playerStats = {};
            this.state.addLog('All players cleared from all teams', 'warning');
            this.state.saveTeams(); this.state.syncToStorage();
            this.teamsView.render(); this.updateUI();
        }

        // ================= undo / redo =================
        performUndo() {
            const action = this.state.undo();
            if (!action) { alert('Nothing to undo!'); return; }
            this.state.addLog(`Undo: ${action}`, 'info');
            this.state.saveTeams(); this.state.syncToStorage();
            this.teamsView.render(); this.updateUI();
        }

        performRedo() {
            const action = this.state.redo();
            if (!action) { alert('Nothing to redo!'); return; }
            this.state.addLog(`Redo: ${action}`, 'info');
            this.state.saveTeams(); this.state.syncToStorage();
            this.teamsView.render(); this.updateUI();
        }

        updateUndoRedoButtons() {
            const u = document.getElementById('undoBtn'), r = document.getElementById('redoBtn');
            if (u) u.disabled = this.state.undoStack.length === 0;
            if (r) r.disabled = this.state.redoStack.length === 0;
        }

        // ================= game-history editing =================
        handleGameHistoryActions(e) {
            const action = e.target.dataset.action;
            if (!action) return;
            const gameId = e.target.dataset.gameId;
            if (action === 'edit-game-scores') { this.state.editingGameId = gameId; this.statsView.renderAll(); }
            else if (action === 'cancel-game-scores') { this.state.editingGameId = null; this.statsView.renderAll(); }
            else if (action === 'save-game-scores') this.saveEditedGameScores(gameId);
        }

        saveEditedGameScores(gameId) {
            const idx = this.state.gameHistory.findIndex(g => String(g.id) === String(gameId));
            if (idx === -1) return;
            const card = document.querySelector(`.game-history-card[data-game-id="${gameId}"]`);
            if (!card) return;
            const scores = this.state.gameHistory[idx].scores;
            card.querySelectorAll('.score-editor-input').forEach(input => {
                const team = input.dataset.team;
                if (scores[team]) scores[team].score = parseInt(input.value, 10) || 0;
            });
            this.state.editingGameId = null;
            this.state.syncToStorage();
            this.statsView.renderAll();
            this.state.addLog(`Updated saved scores for ${this.state.gameHistory[idx].gamemode}`, 'success');
        }

        /**
         * Inline overall-leaderboard edit: a per-gamemode player score was changed.
         * Apply the delta to that player's team score in every matching game so the
         * player total and the team total stay in sync.
         */
        savePlayerGamemodeScore(e) {
            const el = e.target;
            const player = el.dataset.player;
            const gamemode = el.dataset.gamemode;
            const original = parseInt(el.dataset.original, 10);
            const next = parseInt(el.textContent.trim(), 10);
            if (isNaN(next) || next < 0) { el.textContent = original; return; }
            if (next === original) return;

            const delta = next - original;
            for (const game of this.state.gameHistory) {
                if (game.gamemode !== gamemode) continue;
                const team = this.state.findPlayerTeam(player);
                if (!team || !game.scores[team]) continue;
                if (!game.playerStats[player]) continue;
                game.scores[team].score = Math.max(0, game.scores[team].score + delta);
            }
            el.dataset.original = String(next);
            this.state.syncToStorage();
            this.state.addLog(`Updated ${player}'s ${gamemode} score to ${next}`, 'success');
            this.statsView.renderAll();
        }

        // ================= settings =================
        saveSettings() {
            this.settingsView.collectFromDom();
            this.points.save();
            this.updateGamemodeDropdowns();
            alert('Settings saved successfully!');
            this.state.addLog('Settings updated', 'success');
        }

        addNewGamemode() {
            const name = prompt('Enter new gamemode name:');
            if (!name || !name.trim()) return;
            const trimmed = name.trim();
            if (this.points.pointSystems[trimmed]) { alert('Gamemode already exists!'); return; }
            this.points.pointSystems[trimmed] = { '1st place': 4, '2nd place': 3, '3rd place': 2 };
            this.points.gamemodeFeatures[trimmed] = { kills: false, bedBreaks: false, individualFinish: false, teamFinish: false, individualSurvival: false };
            this.updateGamemodeDropdowns();
            const sel = document.getElementById('settingsGamemode'); if (sel) sel.value = trimmed;
            this.settingsView.renderAll();
            alert(`Gamemode "${trimmed}" created! Configure its settings and save.`);
        }

        deleteGamemode() {
            const mode = this.settingsView.selectedGamemode();
            if (H.PointSystem.DEFAULT_MODES.includes(mode)) { alert('Cannot delete default gamemodes!'); return; }
            if (!confirm(`Delete gamemode "${mode}"? This cannot be undone.`)) return;
            delete this.points.pointSystems[mode];
            delete this.points.gamemodeFeatures[mode];
            this.points.save();
            this.updateGamemodeDropdowns();
            this.settingsView.renderAll();
            alert(`Gamemode "${mode}" deleted!`);
        }

        exportSettingsJSON() {
            this.download(`hive-settings-${Date.now()}.json`, this.points.exportSettings());
            this.state.addLog('Settings exported', 'success');
        }

        importSettingsJSON(e) {
            const file = e.target.files[0]; if (!file) return;
            const reader = new FileReader();
            reader.onload = ev => {
                try {
                    this.points.importSettings(JSON.parse(ev.target.result));
                    this.updateGamemodeDropdowns();
                    this.settingsView.renderAll();
                    alert('Settings imported successfully!');
                    this.state.addLog('Settings imported', 'success');
                } catch (err) {
                    alert('Error importing settings: Invalid file format');
                    console.error(err);
                }
            };
            reader.readAsText(file);
            e.target.value = '';
        }

        // ================= JSON save/load =================
        saveData() {
            this.download(`hive-event-${Date.now()}.json`, this.state.serialize({ saveDate: new Date().toISOString() }));
            this.state.addLog('Data saved to JSON file', 'success');
        }

        importJSON(e) {
            const file = e.target.files[0]; if (!file) return;
            const reader = new FileReader();
            reader.onload = ev => {
                try {
                    this.state.applyData(JSON.parse(ev.target.result), { includeTeams: true });
                    this.state.syncToStorage();
                    this.applySavedGamemodeSelection();
                    this.updateUI();
                    this.teamsView.render();
                    this.statsView.renderAll();
                    alert('Data loaded successfully!');
                    this.state.addLog('Data imported from JSON file', 'success');
                } catch (err) {
                    alert('Error loading data: Invalid JSON file format');
                    console.error(err);
                    this.state.addLog('Failed to import data', 'error');
                }
            };
            reader.readAsText(file);
            e.target.value = '';
        }

        download(filename, obj) {
            const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = filename; a.click();
            URL.revokeObjectURL(url);
        }

        // ================= emergency autosave =================
        emergencySave() {
            try {
                if (typeof localStorage === 'undefined') return;
                localStorage.setItem('hive_emergency_backup', JSON.stringify(this.state.serialize({ timestamp: new Date().toISOString() })));
            } catch (err) { console.error('Emergency save failed:', err); }
        }

        loadEmergencySave() {
            try {
                if (typeof localStorage === 'undefined') return;
                const saved = localStorage.getItem('hive_emergency_backup');
                if (!saved) return;
                const data = JSON.parse(saved);
                const hours = (Date.now() - new Date(data.timestamp).getTime()) / 3.6e6;
                const hasData = (data.playerStats && Object.keys(data.playerStats).length) ||
                    (data.scores && Object.keys(data.scores).length) ||
                    (data.gameHistory && data.gameHistory.length);
                if (hours < 24 && hasData &&
                    confirm(`Found an emergency backup from ${new Date(data.timestamp).toLocaleString()}. Restore it?`)) {
                    this.state.applyData(data, { includeTeams: true });
                    this.state.addLog('Emergency backup restored', 'success');
                    alert('Your data has been recovered from the emergency backup!');
                }
            } catch (err) { console.error('Error loading emergency save:', err); }
        }

        // ================= gamemode dropdowns =================
        updateGamemodeDropdowns() {
            const fill = (id, includeBlank) => {
                const sel = document.getElementById(id);
                if (!sel) return;
                const current = sel.value;
                sel.innerHTML = includeBlank ? '<option value="">-- Choose a Gamemode --</option>' : '';
                Object.keys(this.points.pointSystems).forEach(mode => {
                    const opt = document.createElement('option');
                    opt.value = mode; opt.textContent = mode;
                    sel.appendChild(opt);
                });
                if (current && this.points.pointSystems[current]) sel.value = current;
            };
            fill('gamemode', true);
            fill('settingsGamemode', false);
            this.applySavedGamemodeSelection();
            this.syncGamemodeFromSelection();
        }

        normalize(g) { return g ? String(g).replace(/\s+/g, '').toLowerCase() : ''; }

        applySavedGamemodeSelection() {
            if (!this.state.gamemode) return;
            const norm = this.normalize(this.state.gamemode);
            for (const id of ['gamemode', 'settingsGamemode']) {
                const sel = document.getElementById(id);
                if (!sel) continue;
                const match = Array.from(sel.options).find(o => this.normalize(o.value) === norm);
                if (match) { sel.value = match.value; if (id === 'gamemode') this.state.gamemode = match.value; }
            }
        }

        syncGamemodeFromSelection() {
            const sel = document.getElementById('gamemode');
            if (!sel) return;
            if (sel.value && this.state.gamemode !== sel.value) this.state.gamemode = sel.value;
        }

        // ================= top-level render =================
        updateUI() {
            this.scoreboard.renderAll();
            this.updateUndoRedoButtons();
            const cm = document.getElementById('currentGamemode');
            if (cm) cm.textContent = this.state.gamemode || 'None';
        }
    }

    H.HiveEventScorer = HiveEventScorer;

    document.addEventListener('DOMContentLoaded', () => {
        window.scorer = new HiveEventScorer();
    });
})(typeof window !== 'undefined' ? window : globalThis);
