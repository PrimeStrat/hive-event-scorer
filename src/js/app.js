/**
 * HiveEventScorer (controller) - wires the DOM to the state/engine/parsers/renderers.
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

        /**
         * Load persisted data, build parsers, and wire the UI.
         * @returns {void}
         */
        init() {
            this.state.loadFromStorage();
            this.points.load();
            H.parserRegistry.buildAll(this.state, this.engine, this.points);

            this.state.onLog = () => this.scoreboard.renderActivityLog();

            this.updateGamemodeDropdowns();
            this.setupEventListeners();
            this.applySavedGamemodeSelection();
            this.syncGamemodeFromSelection();
            this.updateUI();
            this.applyDefaultPreset();
        }

        /**
         * First run only (no saved settings): load the HiveSilly preset as the
         * default configuration. Desktop app only.
         * @returns {Promise<void>} Resolves when applied or skipped.
         */
        async applyDefaultPreset() {
            const bridge = global.hiveDesktop;
            if (!bridge || !bridge.presets) return;
            if (H.Storage.getItem(this.points.STORAGE_KEY)) return;
            const settings = await bridge.presets.read('HiveSilly');
            if (!settings) return;
            this.points.importSettings(settings);
            this.updateGamemodeDropdowns();
            this.settingsView.renderAll();
            const sel = document.getElementById('presetSelect');
            if (sel) sel.value = 'HiveSilly';
            this.state.addLog('Loaded default settings preset "HiveSilly"', 'info');
        }

        /**
         * Wire all static DOM controls.
         * @returns {void}
         */
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
            this.on('addBedBreak', 'click', () => this.addManualBedBreak());

            const gh = document.getElementById('gameHistory');
            if (gh) gh.addEventListener('click', e => this.handleGameHistoryActions(e));

            this.on('exportPlayersPng', 'click', () => this.openExportModal());
            this.on('exportWinnersPng', 'click', () => this.openExportModal());
            this.on('exportDoWinners', 'click', () => this.generatePoster('winners'));
            this.on('exportDoPlayers', 'click', () => this.generatePoster('players'));
            this.on('exportModalClose', 'click', () => this.closeModal('exportModal'));
            this.on('wipeStats', 'click', () => this.wipeStatistics());

            this.on('playerModalClose', 'click', () => this.closeModal('playerModal'));
            this.on(
                'teamPointsModalClose',
                'click',
                () => this.closeModal('teamPointsModal')
            );
            ['playerModal', 'teamPointsModal', 'exportModal'].forEach(id => {
                const m = document.getElementById(id);
                if (m) m.addEventListener('click', e => { if (e.target === m) this.closeModal(id); });
            });
            document.addEventListener('keydown', e => {
                if (e.key === 'Escape') {
                    this.closeModal('playerModal');
                    this.closeModal('teamPointsModal');
                    this.closeModal('exportModal');
                }
            });

            this.setupTeamManagement();
            this.setupSettingsManagement();
            this.setupDragAndDrop();
            this.setupLiveCapture();
        }

        /**
         * Wire the live-capture toggle; hidden outside the desktop app.
         * @returns {void}
         */
        setupLiveCapture() {
            const bridge = global.hiveDesktop;
            const btn = document.getElementById('liveCaptureBtn');
            if (!bridge || !btn) return;

            this.liveCaptureOn = false;
            btn.classList.remove('hidden');
            bridge.onLines(lines => this.handleLiveLines(lines));

            btn.addEventListener('click', async () => {
                if (this.liveCaptureOn) {
                    await bridge.stopCapture();
                    this.setLiveCaptureState(false);
                    this.state.addLog('Live capture stopped', 'info');
                    return;
                }
                if (!this.state.gamemode) {
                    H.Toast.show('Select a gamemode before turning on live capture.',
                        { title: 'Live capture', type: 'warning', duration: 5000 });
                    return;
                }
                const res = await bridge.startCapture();
                if (!res.ok) {
                    H.Toast.show(`Could not open the chat log at ${res.path}. Is the client installed?`,
                        { title: 'Live capture', type: 'warning', duration: 7000 });
                    return;
                }
                this.state.pushUndo('liveCapture');
                this.setLiveCaptureState(true);
                this.state.addLog(`Live capture started (${res.path})`, 'success');
            });
        }

        /**
         * Update the live-capture toggle state and button styling.
         * @param {boolean} on Whether capture is active.
         * @returns {void}
         */
        setLiveCaptureState(on) {
            this.liveCaptureOn = on;
            const btn = document.getElementById('liveCaptureBtn');
            if (!btn) return;
            btn.textContent = `Live Capture: ${on ? 'ON' : 'OFF'}`;
            btn.classList.toggle('btn-success', on);
            btn.classList.toggle('btn-secondary', !on);
        }

        /**
         * Append newly captured log lines to the chat input and score them.
         * @param {string[]} lines Newly appended complete log lines.
         * @returns {void}
         */
        handleLiveLines(lines) {
            if (!this.liveCaptureOn || !this.state.gamemode) return;
            const parser = this.engine.parserFor(this.state.gamemode);
            if (!parser) return;

            const input = document.getElementById('chatInput');
            if (input) {
                input.value = (input.value ? input.value + '\n' : '') + lines.join('\n');
                input.scrollTop = input.scrollHeight;
            }

            let processed = 0;
            for (const line of lines) { if (parser.parseLine(line)) processed++; }
            if (processed > 0) this.state.addLog(`Live: scored ${processed} event(s)`, 'info');

            if (this.state.currentGameCompleted && this.state.currentGame && this.state.hasActiveScores()) {
                this.saveGameToHistory();
            }
            this.state.syncToStorage();
            this.updateUI();
        }

        /**
         * Add a listener to an element by id when it exists.
         * @param {string} id Element id.
         * @param {string} evt Event name.
         * @param {Function} handler Event handler.
         * @returns {void}
         */
        on(id, evt, handler) {
            const el = document.getElementById(id);
            if (el) el.addEventListener(evt, handler);
        }

        /**
         * Wire window-level drag-and-drop file import.
         * @returns {void}
         */
        setupDragAndDrop() {
            const overlay = document.getElementById('dropOverlay');
            let depth = 0;

            const showOverlay = on => { if (overlay) overlay.classList.toggle('show', on); };

            window.addEventListener('dragenter', e => {
                if (!this.hasFiles(e)) return;
                e.preventDefault(); depth++; showOverlay(true);
            });
            window.addEventListener('dragover', e => { if (this.hasFiles(e)) e.preventDefault(); });
            window.addEventListener('dragleave', e => {
                if (!this.hasFiles(e)) return;
                depth = Math.max(0, depth - 1);
                if (depth === 0) showOverlay(false);
            });
            window.addEventListener('drop', e => {
                if (!this.hasFiles(e)) return;
                e.preventDefault(); depth = 0; showOverlay(false);
                const files = Array.from(e.dataTransfer.files || []);
                files.forEach(f => this.handleDroppedFile(f));
            });
        }

        /**
         * True when a drag event carries files.
         * @param {DragEvent} e Drag event.
         * @returns {boolean} Whether files are present.
         */
        hasFiles(e) {
            return e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');
        }

        /**
         * Import a dropped file: .json as save data, .txt as a chat log.
         * @param {File} file Dropped file.
         * @returns {void}
         */
        handleDroppedFile(file) {
            if (/\.json$/i.test(file.name)) {
                const reader = new FileReader();
                reader.onload = ev => this.loadJsonText(ev.target.result);
                reader.readAsText(file);
                return;
            }
            if (!H.FileImport.isTextFile(file)) {
                H.Toast.show(`"${file.name}" isn't a .txt or .json file.`, { title: 'Unsupported file', type: 'warning' });
                return;
            }

            const reader = new FileReader();
            reader.onload = ev => {
                const text = ev.target.result;
                const known = Object.keys(this.points.pointSystems);
                const inferred = H.FileImport.inferGamemode(file.name, known);

                if (inferred) {
                    const sel = document.getElementById('gamemode');
                    if (sel) sel.value = inferred;
                    this.state.gamemode = inferred;
                    this.startNewGame();
                }

                const input = document.getElementById('chatInput');
                if (input) input.value = text;

                if (inferred) {
                    this.processChat(false);
                    H.Toast.show(`Detected ${inferred} from "${file.name}" and processed the log.`,
                        { title: 'Log imported', duration: 5000 });
                } else {
                    H.Toast.show(`Loaded "${file.name}". Pick a gamemode, then Process Chat. ` +
                        `(Couldn't detect the gamemode from the filename.)`,
                        { title: 'Log loaded', type: 'warning', duration: 7000 });
                    this.switchTab('scorer');
                }
            };
            reader.readAsText(file);
        }

        /**
         * Wire the Teams tab controls.
         * @returns {void}
         */
        setupTeamManagement() {
            this.on('addPlayer', 'click', () => this.addPlayerToTeam(false));
            this.on('playerName', 'keypress', e => { if (e.key === 'Enter') this.addPlayerToTeam(false); });
            this.on('addBulkPlayers', 'click', () => this.addPlayerToTeam(true));
            this.on('clearAllPlayers', 'click', () => {
                if (confirm('Remove all players from all teams? This can be undone.')) this.clearAllPlayers();
            });
        }

        /**
         * Wire the Settings tab controls; toggles apply immediately.
         * @returns {void}
         */
        setupSettingsManagement() {
            this.on('settingsGamemode', 'change', () => { this.settingsView.renderPoints(); this.settingsView.updatePatternVisibility(); });
            this.on('addNewGamemode', 'click', () => this.addNewGamemode());
            this.on('deleteGamemode', 'click', () => this.deleteGamemode());
            this.on('saveSettings', 'click', () => this.saveSettings());
            this.on('autoAddUnknownPlayers', 'change', e => {
                this.points.autoAddUnknownPlayers = e.target.checked;
                this.points.save();
                this.state.addLog(`Auto-add unknown players ${e.target.checked ? 'enabled' : 'disabled'}`, 'info');
            });
            this.on('enableKillLeader', 'change', e => {
                this.points.enableKillLeader = e.target.checked;
                this.points.save();
                this.settingsView.renderPoints();
                this.state.addLog(`Kill Leader bonus ${e.target.checked ? 'enabled' : 'disabled'}`, 'info');
            });
            this.on('enableExtendedTeamBonuses', 'change', e => {
                this.points.enableExtendedTeamBonuses = e.target.checked;
                this.points.save();
                this.settingsView.renderPoints();
                this.state.addLog(`2nd/3rd team bonuses ${e.target.checked ? 'enabled' : 'disabled'}`, 'info');
            });
            this.on('enableSoloPlacements', 'change', e => {
                this.points.enableSoloPlacements = e.target.checked;
                this.points.save();
                this.settingsView.renderPoints();
                this.state.addLog(`Solo placements in PvP modes ${e.target.checked ? 'enabled' : 'disabled'}`, 'info');
            });
            this.on('enableChestPoints', 'change', e => {
                this.points.enableChestPoints = e.target.checked;
                this.points.save();
                this.settingsView.renderPoints();
                this.state.addLog(`Mystery Chest points ${e.target.checked ? 'enabled' : 'disabled'}`, 'info');
            });
            this.on('resetSettings', 'click', () => {
                if (confirm('Reset all settings to defaults? This cannot be undone.')) {
                    this.points.reset(); this.updateGamemodeDropdowns(); this.settingsView.renderAll();
                    alert('Settings reset to defaults!'); this.state.addLog('Settings reset', 'warning');
                }
            });
            this.on('exportSettings', 'click', () => this.exportSettingsJSON());
            this.on('importSettings', 'click', () => document.getElementById('settingsFileInput').click());
            this.on('settingsFileInput', 'change', e => this.importSettingsJSON(e));
            this.setupPresets();
            this.settingsView.renderAll();
        }

        /**
         * Wire the presets section (desktop app only).
         * @returns {void}
         */
        setupPresets() {
            const bridge = global.hiveDesktop;
            const section = document.getElementById('presetsSection');
            if (!bridge || !bridge.presets || !section) return;
            section.classList.remove('hidden');
            this.refreshPresetList();

            this.on('loadPreset', 'click', async () => {
                const name = (document.getElementById('presetSelect') || {}).value;
                if (!name) return;
                const settings = await bridge.presets.read(name);
                if (!settings) {
                    H.Toast.show(`Could not read preset "${name}".`, { title: 'Presets', type: 'warning' });
                    return;
                }
                this.points.importSettings(settings);
                this.updateGamemodeDropdowns();
                this.settingsView.renderAll();
                this.state.addLog(`Loaded settings preset "${name}"`, 'success');
                H.Toast.show(`Preset "${name}" loaded.`, { title: 'Presets', duration: 3500 });
            });

            this.on('savePreset', 'click', async () => {
                const name = prompt('Preset name:');
                if (!name || !name.trim()) return;
                this.settingsView.collectFromDom();
                this.points.save();
                const res = await bridge.presets.save(name.trim(), this.points.exportSettings());
                if (res.ok) {
                    await this.refreshPresetList(res.name);
                    this.state.addLog(`Saved settings preset "${res.name}"`, 'success');
                    H.Toast.show(`Preset "${res.name}" saved.`, { title: 'Presets', duration: 3500 });
                } else {
                    H.Toast.show('Could not save the preset.', { title: 'Presets', type: 'warning' });
                }
            });

            this.on('deletePreset', 'click', async () => {
                const name = (document.getElementById('presetSelect') || {}).value;
                if (!name) return;
                if (!confirm(`Delete preset "${name}"? Bundled presets cannot be deleted.`)) return;
                const res = await bridge.presets.remove(name);
                if (res.ok) {
                    await this.refreshPresetList();
                    this.state.addLog(`Deleted settings preset "${name}"`, 'warning');
                } else {
                    H.Toast.show('Only user-saved presets can be deleted.', { title: 'Presets', type: 'warning' });
                }
            });

            this.on('openPresetsFolder', 'click', () => bridge.presets.openFolder());
        }

        /**
         * Repopulate the preset dropdown.
         * @param {string} selectName Preset to select after refresh.
         * @returns {Promise<void>} Resolves when repopulated.
         */
        async refreshPresetList(selectName) {
            const bridge = global.hiveDesktop;
            const sel = document.getElementById('presetSelect');
            if (!bridge || !bridge.presets || !sel) return;
            const presets = await bridge.presets.list();
            const current = selectName || sel.value;
            sel.innerHTML = '<option value="">-- Choose a preset --</option>' + presets.map(p =>
                `<option value="${this.statsView.escapeHtml(p.name)}">${this.statsView.escapeHtml(p.name)}${p.source === 'bundled' ? ' (bundled)' : ''}</option>`
            ).join('');
            if (current) sel.value = current;
        }

        /**
         * Switch the visible tab and render its view.
         * @param {string} tabName Tab id.
         * @returns {void}
         */
        switchTab(tabName) {
            document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
            const content = document.getElementById(tabName);
            if (content) content.classList.add('active');
            const nav = document.querySelector(`.nav-tab[data-tab="${tabName}"]`);
            if (nav) nav.classList.add('active');

            if (tabName === 'teams') this.teamsView.render();
            else if (tabName === 'stats') this.statsView.renderAll();
            else if (tabName === 'history') this.statsView.renderGameHistory();
            else if (tabName === 'settings') this.settingsView.renderAll();
        }

        /**
         * Roll any active game into history and start a fresh one.
         * @returns {void}
         */
        startNewGame() {
            if (!this.state.gamemode) { alert('Please select a gamemode first!'); return; }

            const hadGame = this.state.currentGame && this.state.hasActiveScores();
            if (hadGame) this.saveGameToHistory();

            this.state.pushUndo('startNewGame');
            this.state.startNewGame(this.state.gamemode);
            this.state.syncToStorage();
            this.state.addLog(`Started new ${this.state.gamemode} game`, 'info');
            this.updateUI();

            if (hadGame) {
                H.Toast.show('Previous game saved to history. Remember to Save JSON to keep tournament progress.',
                    { title: 'New game started', type: 'warning', duration: 6000 });
            }
        }

        /**
         * Process the chat input through the active parser.
         * @param {boolean} lastLineOnly Process only the final line.
         * @returns {void}
         */
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

        /**
         * Persist the current game into history.
         * @returns {void}
         */
        saveGameToHistory() {
            this.state.pushUndo('saveGameToHistory');
            if (this.state.saveGameToHistory()) {
                this.state.syncToStorage();
                this.state.addLog(`Game saved to history: ${this.state.currentGame.gamemode}`, 'info');
            }
        }

        /**
         * Add one or more players to the selected team.
         * @param {boolean} bulk Read names from the bulk textarea.
         * @returns {void}
         */
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

            this.resyncScores();
            this.state.addLog(`Added ${toAdd.length} player(s) to ${teamName}`, 'info');
            this.state.saveTeams(); this.state.syncToStorage();
            this.teamsView.render(); this.updateUI();
        }

        /**
         * Remove a player from every team, dropping emptied teams.
         * @param {string} name Player name.
         * @returns {void}
         */
        removePlayerFromAllTeams(name) {
            for (const team of Object.keys(this.state.teams)) {
                const i = this.state.teams[team].players.indexOf(name);
                if (i > -1) {
                    this.state.teams[team].players.splice(i, 1);
                    if (this.state.teams[team].players.length === 0) delete this.state.teams[team];
                }
            }
        }

        /**
         * Remove a player from a specific team.
         * @param {string} teamName Team name.
         * @param {string} playerName Player name.
         * @returns {void}
         */
        removePlayer(teamName, playerName) {
            if (!this.state.teams[teamName]) return;
            this.state.pushUndo('removePlayer');
            const i = this.state.teams[teamName].players.indexOf(playerName);
            if (i > -1) this.state.teams[teamName].players.splice(i, 1);
            if (this.state.teams[teamName].players.length === 0) delete this.state.teams[teamName];
            this.resyncScores();
            this.state.saveTeams(); this.state.syncToStorage();
            this.teamsView.render(); this.updateUI();
        }

        /**
         * Move a player between teams and resync scores.
         * @param {string} playerName Player name.
         * @param {string} oldTeam Previous team.
         * @param {string} newTeam Destination team.
         * @returns {void}
         */
        changePlayerTeam(playerName, oldTeam, newTeam) {
            this.state.pushUndo('changePlayerTeam');
            this.removePlayerFromAllTeams(playerName);
            this.state.ensureTeam(newTeam);
            if (!this.state.teams[newTeam].players.includes(playerName)) this.state.teams[newTeam].players.push(playerName);
            if (this.state.playerStats[playerName]) this.state.playerStats[playerName].team = newTeam;
            this.resyncScores();
            this.state.saveTeams(); this.state.syncToStorage();
            this.teamsView.render(); this.updateUI();
            this.state.addLog(`${playerName} moved from ${oldTeam} to ${newTeam}`, 'info');
        }

        /**
         * Register a substitute whose events score for a rostered player.
         * @param {string} subName Substitute IGN.
         * @param {string} originalPlayer Rostered player they replace.
         * @returns {void}
         */
        addSubstitution(subName, originalPlayer) {
            if (this.state.findPlayerTeam(subName) && !this.state.substitutions[subName]) {
                H.Toast.show(`${subName} is already on a team roster.`, { title: 'Cannot add sub', type: 'warning' });
                return;
            }
            if (subName === originalPlayer) {
                H.Toast.show('A player cannot substitute for themselves.', { title: 'Cannot add sub', type: 'warning' });
                return;
            }
            this.state.pushUndo('addSubstitution');
            this.state.substitutions[subName] = originalPlayer;
            this.state.saveTeams(); this.state.syncToStorage();
            this.state.addLog(`${subName} now scores for ${originalPlayer}`, 'info');
            this.teamsView.render();
        }

        /**
         * Point an existing substitute at a different rostered player.
         * @param {string} subName Substitute IGN.
         * @param {string} originalPlayer New rostered player.
         * @returns {void}
         */
        changeSubstitution(subName, originalPlayer) {
            if (!this.state.substitutions[subName] || this.state.substitutions[subName] === originalPlayer) return;
            this.state.pushUndo('changeSubstitution');
            this.state.substitutions[subName] = originalPlayer;
            this.state.saveTeams(); this.state.syncToStorage();
            this.state.addLog(`${subName} now scores for ${originalPlayer}`, 'info');
            this.teamsView.render();
        }

        /**
         * Remove a substitute mapping.
         * @param {string} subName Substitute IGN.
         * @returns {void}
         */
        removeSubstitution(subName) {
            if (!this.state.substitutions[subName]) return;
            this.state.pushUndo('removeSubstitution');
            delete this.state.substitutions[subName];
            this.state.saveTeams(); this.state.syncToStorage();
            this.state.addLog(`Removed substitute ${subName}`, 'info');
            this.teamsView.render();
        }

        /**
         * Manually credit a bed break to a player (BedWars logs cannot attribute
         * breaks against other teams' beds).
         * @returns {void}
         */
        addManualBedBreak() {
            const sel = document.getElementById('bedBreakPlayer');
            const player = sel ? sel.value : '';
            if (!player) { alert('Pick the player who broke the bed.'); return; }
            const team = this.state.findPlayerTeam(player);
            if (!this.engine.isScorableTeam(team)) return;
            this.state.pushUndo('addBedBreak');
            const canonical = this.state.resolveCanonicalPlayer(player);
            this.state.getOrCreatePlayerStats(canonical, team).bedBreaks++;
            this.engine.awardPoints(team, 'Bed Break');
            this.state.ensureScore(team).bedBreaks.push({ player: canonical, time: new Date().toISOString() });
            this.state.addLog(`${team} - ${canonical} broke a bed (manual)`, 'success');
            this.state.syncToStorage();
            this.updateUI();
        }

        /**
         * Show and populate the manual bed-break control for bed-break gamemodes.
         * @returns {void}
         */
        updateManualEvents() {
            const row = document.getElementById('manualEvents');
            if (!row) return;
            const features = this.points.featuresFor(this.state.gamemode) || {};
            row.classList.toggle('hidden', !features.bedBreaks);
            if (!features.bedBreaks) return;

            const sel = document.getElementById('bedBreakPlayer');
            if (!sel) return;
            const current = sel.value;
            const groups = Object.entries(this.state.teams)
                .filter(([t]) => t !== 'UNKNOWN')
                .sort((a, b) => a[0].localeCompare(b[0]));
            sel.innerHTML = '<option value="">-- Player --</option>' + groups.map(([teamName, team]) => {
                const opts = (team.players || []).map(p =>
                    `<option value="${this.statsView.escapeHtml(p)}">${this.statsView.escapeHtml(p)}</option>`).join('');
                return `<optgroup label="${this.statsView.escapeHtml(teamName)}">${opts}</optgroup>`;
            }).join('');
            if (current) sel.value = current;
        }

        /**
         * Rebuild team scores from player records after a roster change.
         * @returns {void}
         */
        resyncScores() {
            if (this.state.hasActiveScores()) this.engine.recomputeScores();
        }

        /**
         * Remove every player from every team.
         * @returns {void}
         */
        clearAllPlayers() {
            this.state.pushUndo('clearAllPlayers');
            this.state.teams = {};
            this.state.playerStats = {};
            this.state.addLog('All players cleared from all teams', 'warning');
            this.state.saveTeams(); this.state.syncToStorage();
            this.teamsView.render(); this.updateUI();
        }

        /**
         * Undo the latest action.
         * @returns {void}
         */
        performUndo() {
            const action = this.state.undo();
            if (!action) { alert('Nothing to undo!'); return; }
            this.state.addLog(`Undo: ${action}`, 'info');
            this.state.saveTeams(); this.state.syncToStorage();
            this.teamsView.render(); this.updateUI();
        }

        /**
         * Redo the latest undone action.
         * @returns {void}
         */
        performRedo() {
            const action = this.state.redo();
            if (!action) { alert('Nothing to redo!'); return; }
            this.state.addLog(`Redo: ${action}`, 'info');
            this.state.saveTeams(); this.state.syncToStorage();
            this.teamsView.render(); this.updateUI();
        }

        /**
         * Enable/disable the undo/redo buttons from stack depth.
         * @returns {void}
         */
        updateUndoRedoButtons() {
            const u = document.getElementById('undoBtn'), r = document.getElementById('redoBtn');
            if (u) u.disabled = this.state.undoStack.length === 0;
            if (r) r.disabled = this.state.redoStack.length === 0;
        }

        /**
         * Delegate clicks inside the game-history list.
         * @param {MouseEvent} e Click event.
         * @returns {void}
         */
        handleGameHistoryActions(e) {
            const action = e.target.dataset.action;
            if (!action) return;
            const gameId = e.target.dataset.gameId;
            if (action === 'edit-game-scores') { this.state.editingGameId = gameId; this.statsView.renderAll(); }
            else if (action === 'cancel-game-scores') { this.state.editingGameId = null; this.statsView.renderAll(); }
            else if (action === 'save-game-scores') this.saveEditedGameScores(gameId);
        }

        /**
         * Persist manually edited team scores for a history game.
         * @param {string} gameId Game id.
         * @returns {void}
         */
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
         * Open the player-detail modal.
         * @param {string} name Player name.
         * @returns {void}
         */
        openPlayerModal(name) {
            const d = this.statsView.playerDetail(name);
            const titleEl = document.getElementById('playerModalTitle');
            const bodyEl = document.getElementById('playerModalBody');
            if (!titleEl || !bodyEl) return;
            const esc = s => this.statsView.escapeHtml(s);

            titleEl.textContent = d.name + (d.team ? `  (${d.team})` : '');

            const metric = (v, l) => `<div class="pd-metric"><div class="v">${v}</div><div class="l">${l}</div></div>`;
            const summary = `<div class="pd-summary">
                ${metric(d.totalPoints, 'Total Points')}
                ${metric(d.games.length, 'Games')}
                ${metric(d.wins, '1st Places')}
                ${metric(d.totalKills, 'Kills')}
            </div>`;

            const games = d.games.length ? d.games.map(g => `
                <div class="pd-game">
                    <div class="pd-game-head"><span>${esc(g.gamemode)}</span><span>${g.points} pts</span></div>
                    <div class="pd-game-stats">
                        <span>Placement: ${esc(g.placement)}</span>
                        ${g.features.kills ? `<span>K: ${g.kills}</span><span>D: ${g.deaths}</span><span>FK: ${g.finalKills}</span>` : ''}
                        ${g.features.bedBreaks && g.bedBreaks > 0 ? `<span>Beds: ${g.bedBreaks}</span>` : ''}
                        <span class="pd-date">${new Date(g.date).toLocaleString()}</span>
                    </div>
                </div>`).join('') : '<p class="empty-state">No completed games for this player yet.</p>';

            bodyEl.innerHTML = summary + '<h3 style="margin:8px 0 10px;">Per-Game Breakdown</h3>' + games;
            document.getElementById('playerModal').classList.add('open');
        }

        /**
         * Close a modal by id.
         * @param {string} id Modal element id.
         * @returns {void}
         */
        closeModal(id) {
            const m = document.getElementById(id);

            if (m) {
                m.classList.remove('open');
                m.setAttribute('aria-hidden', 'true');
            }
        }

        /**
         * Open the poster-export dialog with team-name override fields.
         * @returns {void}
         */
        openExportModal() {
            if (this.state.gameHistory.length === 0) {
                H.Toast.show('No completed games to export yet.', { title: 'Nothing to export', type: 'warning' });
                return;
            }
            const titleInput = document.getElementById('exportEventTitle');
            if (titleInput && !titleInput.value) titleInput.value = this._eventTitle || '';

            const host = document.getElementById('exportTeamNames');
            if (host) {
                const standings = this.statsView.aggregateTeamStandings();
                host.innerHTML = standings.map(t => `
                    <div class="export-team-row">
                        <span class="export-team-swatch" style="background:${t.teamColor}"></span>
                        <input type="text" class="export-team-input" data-team="${this.statsView.escapeHtml(t.team)}"
                            value="${this.statsView.escapeHtml(t.team)}" />
                        <span class="export-team-pts">${t.points} pts</span>
                    </div>`).join('');
            }
            document.getElementById('exportModal').classList.add('open');
        }

        /**
         * Produce one poster from the dialog's title and team-name overrides.
         * @param {string} kind 'winners' or 'players'.
         * @returns {void}
         */
        generatePoster(kind) {
            const titleInput = document.getElementById('exportEventTitle');
            const title = (titleInput && titleInput.value.trim()) || 'Hive Event';
            this._eventTitle = title;

            const labels = {};
            document.querySelectorAll('#exportTeamNames .export-team-input').forEach(inp => {
                labels[inp.dataset.team] = (inp.value.trim() || inp.dataset.team);
            });
            const relabelTeam = name => labels[name] || name;

            if (kind === 'winners') {
                const teams = this.statsView.aggregateTeamStandings().map(t => ({ ...t, team: relabelTeam(t.team) }));
                H.PosterExport.eventWinners(teams, title);
                this.state.addLog('Exported event winners PNG', 'success');
            } else {
                const players = this.statsView.playerStandingsList().map(p => ({ ...p, team: relabelTeam(p.team) }));
                H.PosterExport.playerStandings(players, title);
                this.state.addLog('Exported player standings PNG', 'success');
            }
        }

        /**
         * Wipe all statistics while keeping team rosters.
         * @returns {void}
         */
        wipeStatistics() {
            if (!confirm('Wipe all statistics? This clears the current game, all scores, player stats, and game ' +
                'history. Your teams are kept. This cannot be undone.')) return;
            this.state.wipeStatistics();
            this.state.syncToStorage();
            this.state.addLog('Statistics wiped (teams kept)', 'warning');
            this.statsView.renderAll();
            this.updateUI();
            H.Toast.show('All statistics wiped. Teams were kept.', { title: 'Statistics cleared', type: 'warning', duration: 5000 });
        }

        /**
         * Collect and persist the Settings tab values.
         * @returns {void}
         */
        saveSettings() {
            this.settingsView.collectFromDom();
            this.points.save();
            this.updateGamemodeDropdowns();
            alert('Settings saved successfully!');
            this.state.addLog('Settings updated', 'success');
        }

        /**
         * Create a custom gamemode with base point keys.
         * @returns {void}
         */
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

        /**
         * Delete the selected custom gamemode.
         * @returns {void}
         */
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

        /**
         * Download the current settings as JSON.
         * @returns {void}
         */
        exportSettingsJSON() {
            this.download(`hive-settings-${Date.now()}.json`, this.points.exportSettings());
            this.state.addLog('Settings exported', 'success');
        }

        /**
         * Import a settings JSON file chosen by the user.
         * @param {Event} e File-input change event.
         * @returns {void}
         */
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

        /**
         * Download the full tournament data as JSON.
         * @returns {void}
         */
        saveData() {
            this.download(`hive-event-${Date.now()}.json`, this.state.serialize({ saveDate: new Date().toISOString() }));
            this.state.addLog('Data saved to JSON file', 'success');
        }

        /**
         * Import a tournament JSON file chosen by the user.
         * @param {Event} e File-input change event.
         * @returns {void}
         */
        importJSON(e) {
            const file = e.target.files[0]; if (!file) return;
            const reader = new FileReader();
            reader.onload = ev => this.loadJsonText(ev.target.result);
            reader.readAsText(file);
            e.target.value = '';
        }

        /**
         * Apply tournament JSON text to the app state.
         * @param {string} text JSON text.
         * @returns {void}
         */
        loadJsonText(text) {
            try {
                this.state.applyData(JSON.parse(text), { includeTeams: true });
                this.state.syncToStorage();
                this.applySavedGamemodeSelection();
                this.updateUI();
                this.teamsView.render();
                this.statsView.renderAll();
                H.Toast.show('Tournament data loaded.', { title: 'Loaded', duration: 4000 });
                this.state.addLog('Data imported from JSON file', 'success');
            } catch (err) {
                alert('Error loading data: Invalid JSON file format');
                console.error(err);
                this.state.addLog('Failed to import data', 'error');
            }
        }

        /**
         * Save an object as pretty-printed JSON: into the app data saves folder on
         * desktop, or as a browser download otherwise.
         * @param {string} filename File name.
         * @param {Object} obj Data to save.
         * @returns {void}
         */
        download(filename, obj) {
            const text = JSON.stringify(obj, null, 2);
            const bridge = global.hiveDesktop;
            if (bridge && bridge.saveJson) {
                bridge.saveJson(filename, text).then(res => {
                    if (res.ok) {
                        H.Toast.show(`Saved to ${res.path}`, { title: 'Saved', duration: 6000 });
                    } else {
                        H.Toast.show('Could not write the save file.', { title: 'Save failed', type: 'warning' });
                    }
                });
                return;
            }
            const blob = new Blob([text], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = filename; a.click();
            URL.revokeObjectURL(url);
        }

        /**
         * Repopulate both gamemode dropdowns from the configured point systems.
         * @returns {void}
         */
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

        /**
         * Normalise a gamemode name for comparison.
         * @param {string} g Gamemode name.
         * @returns {string} Normalised name.
         */
        normalize(g) { return g ? String(g).replace(/\s+/g, '').toLowerCase() : ''; }

        /**
         * Select the saved gamemode in both dropdowns.
         * @returns {void}
         */
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

        /**
         * Adopt the dropdown's gamemode into state when they differ.
         * @returns {void}
         */
        syncGamemodeFromSelection() {
            const sel = document.getElementById('gamemode');
            if (!sel) return;
            if (sel.value && this.state.gamemode !== sel.value) this.state.gamemode = sel.value;
        }

        /**
         * Refresh the always-visible UI (scoreboard, undo buttons, mode label).
         * @returns {void}
         */
        updateUI() {
            this.scoreboard.renderAll();
            this.updateUndoRedoButtons();
            this.updateManualEvents();
            const cm = document.getElementById('currentGamemode');
            if (cm) cm.textContent = this.state.gamemode || 'None';
        }
    }

    H.HiveEventScorer = HiveEventScorer;

    document.addEventListener('DOMContentLoaded', () => {
        window.scorer = new HiveEventScorer();
    });
})(typeof window !== 'undefined' ? window : globalThis);
