/**
 * TeamsRenderer - the Teams tab: a Teams/Subs view switcher; mutations delegate
 * to the app controller.
 */
(function (global) {
    'use strict';
    const Base = global.Hive.renderers.Renderer;

    class TeamsRenderer extends Base {
        /**
         * @param {HiveEventScorer} app App controller.
         */
        constructor(app) {
            super(app);
            this.activeView = 'teams';
        }

        /**
         * Render the Teams tab (view switcher + active panel).
         * @returns {void}
         */
        render() {
            const grid = this.$('teamsGrid');
            if (!grid) return;

            grid.innerHTML = `
                <div class="team-view-tabs">
                    <button type="button" class="team-view-tab ${this.activeView === 'teams' ? 'active' : ''}" data-team-view="teams">Teams</button>
                    <button type="button" class="team-view-tab ${this.activeView === 'subs' ? 'active' : ''}" data-team-view="subs">Subs</button>
                </div>
                <div class="team-view-panel ${this.activeView === 'teams' ? '' : 'hidden'}" data-team-panel="teams">
                    ${this.renderTeamsView()}
                </div>
                <div class="team-view-panel ${this.activeView === 'subs' ? '' : 'hidden'}" data-team-panel="subs">
                    ${this.renderSubsView()}
                </div>`;

            this.attachListeners();
        }

        /**
         * Build the team-cards grid HTML.
         * @returns {string} HTML.
         */
        renderTeamsView() {
            if (Object.keys(this.state.teams).length === 0) {
                return `
                    <div class="teams-empty-state">
                        <h3>No players assigned yet</h3>
                        <p>Add players to teams using the form above!</p>
                    </div>`;
            }
            const sorted = Object.entries(this.state.teams).sort((a, b) => a[0].localeCompare(b[0]));
            return '<div class="teams-cards">' + sorted.map(([teamName, data]) => `
                <div class="team-card" style="border-left: 4px solid ${data.color}">
                    <div class="team-card-header">
                        <div class="team-card-name" style="color: ${data.color}">${this.escapeHtml(teamName)}</div>
                        <span class="team-color-code">${data.colorCode}</span>
                    </div>
                    <div class="team-card-players">${this.renderPlayerList(teamName, data.players)}</div>
                    <div class="team-card-stats">${data.players.length} player${data.players.length !== 1 ? 's' : ''}</div>
                </div>`).join('') + '</div>';
        }

        /**
         * Build the substitutes panel HTML.
         * @returns {string} HTML.
         */
        renderSubsView() {
            const roster = Object.entries(this.state.teams)
                .filter(([t]) => t !== 'UNKNOWN')
                .flatMap(([, team]) => team.players || [])
                .sort((a, b) => a.localeCompare(b));
            const options = roster.map(p =>
                `<option value="${this.escapeHtml(p)}">${this.escapeHtml(p)}</option>`).join('');

            const subs = Object.entries(this.state.substitutions || {});
            const rows = subs.length === 0
                ? '<p class="empty-state">No substitutes assigned. A sub\'s kills and placements count for the player they replace.</p>'
                : '<div class="player-list">' + subs.map(([subName, original]) => {
                    const safeSub = this.escapeHtml(subName);
                    const targetOptions = roster.map(p =>
                        `<option value="${this.escapeHtml(p)}" ${p === original ? 'selected' : ''}>${this.escapeHtml(p)}</option>`).join('');
                    return `
                        <div class="player-item sub-item">
                            <div class="player-item-left">
                                <span class="player-name">${safeSub}</span>
                                <span class="sub-arrow">plays for</span>
                                <select class="change-sub-target" data-sub="${safeSub}">${targetOptions}</select>
                            </div>
                            <button class="remove-sub-btn" data-sub="${safeSub}" title="Remove substitute">&times;</button>
                        </div>`;
                }).join('') + '</div>';

            return `
                <div class="sub-creator">
                    <div>
                        <label for="subPlayerName">Substitute IGN:</label>
                        <input type="text" id="subPlayerName" placeholder="Substitute username">
                    </div>
                    <div>
                        <label for="subForPlayer">Playing for:</label>
                        <select id="subForPlayer">
                            <option value="">-- Playing for --</option>
                            ${options}
                        </select>
                    </div>
                    <div class="create-team-button">
                        <button type="button" id="addSubstitution" class="btn btn-primary">Add Sub</button>
                    </div>
                </div>
                ${rows}`;
        }

        /**
         * Build the player rows for one team card.
         * @param {string} teamName Team name.
         * @param {string[]} players Player names.
         * @returns {string} HTML.
         */
        renderPlayerList(teamName, players) {
            if (!players || players.length === 0) return '<p class="no-players">No players</p>';
            return '<div class="player-list">' + players.map(player => {
                const options = Object.keys(this.state.predefinedTeams).map(t =>
                    `<option value="${t}" ${t === teamName ? 'selected' : ''}>${t}</option>`).join('');
                const safe = this.escapeHtml(player);
                return `
                    <div class="player-item">
                        <div class="player-item-left">
                            <span class="player-name">${safe}</span>
                            <select class="change-team-select" data-player="${safe}" data-current-team="${this.escapeHtml(teamName)}">
                                ${options}
                            </select>
                        </div>
                        <button class="remove-player-btn" data-team="${this.escapeHtml(teamName)}" data-player="${safe}" title="Remove player">&times;</button>
                    </div>`;
            }).join('') + '</div>';
        }

        /**
         * Wire the view switcher, roster controls, and sub controls.
         * @returns {void}
         */
        attachListeners() {
            document.querySelectorAll('.team-view-tab').forEach(btn => {
                btn.addEventListener('click', e => {
                    this.activeView = e.currentTarget.dataset.teamView;
                    this.render();
                });
            });

            document.querySelectorAll('.remove-player-btn').forEach(btn => {
                btn.addEventListener('click', e => {
                    this.app.removePlayer(e.currentTarget.dataset.team, e.currentTarget.dataset.player);
                });
            });
            document.querySelectorAll('.change-team-select').forEach(sel => {
                sel.addEventListener('change', e => {
                    const player = e.currentTarget.dataset.player;
                    const cur = e.currentTarget.dataset.currentTeam;
                    const next = e.currentTarget.value;
                    if (cur !== next) this.app.changePlayerTeam(player, cur, next);
                });
            });

            const addSub = this.$('addSubstitution');
            if (addSub) {
                addSub.addEventListener('click', () => {
                    const subName = (this.$('subPlayerName') || {}).value || '';
                    const target = (this.$('subForPlayer') || {}).value || '';
                    if (!subName.trim() || !target) return;
                    this.activeView = 'subs';
                    this.app.addSubstitution(subName.trim(), target);
                });
            }
            document.querySelectorAll('.change-sub-target').forEach(sel => {
                sel.addEventListener('change', e => {
                    this.app.changeSubstitution(e.currentTarget.dataset.sub, e.currentTarget.value);
                });
            });
            document.querySelectorAll('.remove-sub-btn').forEach(btn => {
                btn.addEventListener('click', e => {
                    this.app.removeSubstitution(e.currentTarget.dataset.sub);
                });
            });
        }
    }

    global.Hive.renderers.TeamsRenderer = TeamsRenderer;
})(typeof window !== 'undefined' ? window : globalThis);
