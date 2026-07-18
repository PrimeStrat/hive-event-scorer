/**
 * TeamsRenderer - the Teams tab: the grid of team cards, per-player remove button,
 * and the per-player team-change dropdown. Mutations are delegated back to the app
 * controller (which owns undo/persistence).
 */
(function (global) {
    'use strict';
    const Base = global.Hive.renderers.Renderer;

    class TeamsRenderer extends Base {
        constructor(app) {
            super(app);
            this.activeView = 'teams';
        }
        render() {
            const grid = this.$('teamsGrid');
            if (!grid) return;

            const substitutions = this.state.substitutions || {};

            grid.innerHTML = `
                <div class="team-view-tabs">
                    <button
                        type="button"
                        class="team-view-tab ${this.activeView === 'teams' ? 'active' : ''}"
                        data-team-view="teams"
                    >
                        Teams
                    </button>

                    <button
                        type="button"
                        class="team-view-tab ${this.activeView === 'subs' ? 'active' : ''}"
                        data-team-view="subs"
                    >
                        Subs
                    </button>
                </div>

                <div
                    class="team-view-panel ${this.activeView !== 'teams' ? 'hidden' : ''}"
                    data-team-panel="teams"
                >
                    ${this.renderTeamsView()}
                </div>

                <div
                    class="team-view-panel ${this.activeView !== 'subs' ? 'hidden' : ''}"
                    data-team-panel="subs"
                >
                    ${this.renderSubsView(substitutions)}
                </div>
            `;

            this.attachListeners();
        }

        renderTeamsView() {
            if (Object.keys(this.state.teams).length === 0) {
                return `
                    <div class="teams-empty-state">
                        <h3>No players assigned yet</h3>
                        <p>Add players to teams using the form above!</p>
                    </div>
                `;
            }

            const sorted = Object.entries(this.state.teams)
                .sort((a, b) => a[0].localeCompare(b[0]));

            return sorted.map(([teamName, data]) => `
                <div class="team-card" style="border-left: 4px solid ${data.color}">
                    <div class="team-card-header">
                        <div class="team-card-name" style="color: ${data.color}">
                            ${this.escapeHtml(teamName)}
                        </div>

                        <span class="team-color-code">
                            ${data.colorCode}
                        </span>
                    </div>

                    <div class="team-card-players">
                        ${this.renderPlayerList(teamName, data.players)}
                    </div>

                    <div class="team-card-stats">
                        ${data.players.length} player${data.players.length !== 1 ? 's' : ''}
                    </div>
                </div>
            `).join('');
        }

        renderSubsView(substitutions) {
            const rosterPlayers = Object.values(this.state.teams)
                .flatMap(team => team.players || [])
                .sort((a, b) => a.localeCompare(b));

            const rows = Object.entries(substitutions);

            return `
                <div class="subs-section">
                    <div class="subs-add-row">
                        <input
                            type="text"
                            id="subPlayerName"
                            placeholder="Substitute username"
                        >

                        <select id="subForPlayer">
                            <option value="">-- Playing for --</option>

                            ${rosterPlayers.map(player => `
                                <option value="${this.escapeHtml(player)}">
                                    ${this.escapeHtml(player)}
                                </option>
                            `).join('')}
                        </select>

                        <button
                            type="button"
                            class="btn btn-primary"
                            id="addSubstitution"
                        >
                            Add Sub
                        </button>
                    </div>

                    <div class="subs-list">
                        ${rows.length === 0
                            ? `
                                <div class="teams-empty-state">
                                    <h3>No substitutes assigned</h3>
                                    <p>Add a substitute and choose the player they are playing for.</p>
                                </div>
                            `
                            : rows.map(([subName, originalPlayer]) => `
                                <div class="player-item sub-item">
                                    <div class="player-item-left">
                                        <span class="player-name">
                                            ${this.escapeHtml(subName)}
                                        </span>

                                        <span class="sub-arrow">→</span>

                                        <select
                                            class="change-sub-target"
                                            data-sub="${this.escapeHtml(subName)}"
                                        >
                                            ${rosterPlayers.map(player => `
                                                <option
                                                    value="${this.escapeHtml(player)}"
                                                    ${player === originalPlayer ? 'selected' : ''}
                                                >
                                                    ${this.escapeHtml(player)}
                                                </option>
                                            `).join('')}
                                        </select>
                                    </div>

                                    <button
                                        class="remove-sub-btn"
                                        data-sub="${this.escapeHtml(subName)}"
                                        title="Remove substitute"
                                    >
                                        ×
                                    </button>
                                </div>
                            `).join('')
                        }
                    </div>
                </div>
            `;
        }

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
                        <button class="remove-player-btn" data-team="${this.escapeHtml(teamName)}" data-player="${safe}" title="Remove player">×</button>
                    </div>`;
            }).join('') + '</div>';
        }

        attachListeners() {
            // ---------------- team view tabs ----------------

            document.querySelectorAll('.team-view-tab').forEach(btn => {
                btn.addEventListener('click', e => {
                    const view = e.currentTarget.dataset.teamView;

                    this.activeView = view;

                    document.querySelectorAll('.team-view-tab').forEach(tab => {
                        tab.classList.toggle(
                            'active',
                            tab.dataset.teamView === view
                        );
                    });

                    document.querySelectorAll('.team-view-panel').forEach(panel => {
                        panel.classList.toggle(
                            'hidden',
                            panel.dataset.teamPanel !== view
                        );
                    });
                });
            });

            // ---------------- existing team controls ----------------

            document.querySelectorAll('.remove-player-btn').forEach(btn => {
                btn.addEventListener('click', e => {
                    this.app.removePlayer(
                        e.currentTarget.dataset.team,
                        e.currentTarget.dataset.player
                    );
                });
            });

            document.querySelectorAll('.change-team-select').forEach(select => {
                select.addEventListener('change', e => {
                    const player = e.currentTarget.dataset.player;
                    const currentTeam = e.currentTarget.dataset.currentTeam;
                    const newTeam = e.currentTarget.value;

                    if (currentTeam !== newTeam) {
                        this.app.changePlayerTeam(
                            player,
                            currentTeam,
                            newTeam
                        );
                    }
                });
            });

            // ---------------- add substitution ----------------

            const addSubBtn = document.getElementById('addSubstitution');

            if (addSubBtn) {
                addSubBtn.addEventListener('click', () => {
                    const subInput =
                        document.getElementById('subPlayerName');

                    const targetSelect =
                        document.getElementById('subForPlayer');

                    const subName =
                        subInput ? subInput.value.trim() : '';

                    const targetPlayer =
                        targetSelect ? targetSelect.value : '';

                    if (!subName || !targetPlayer) return;

                    this.activeView = 'subs';

                    this.app.addSubstitution(
                        subName,
                        targetPlayer
                    );
                });
            }

            // ---------------- change substitution ----------------

            document.querySelectorAll('.change-sub-target').forEach(select => {
                select.addEventListener('change', e => {
                    this.activeView = 'subs';

                    this.app.changeSubstitution(
                        e.currentTarget.dataset.sub,
                        e.currentTarget.value
                    );
                });
            });

            // ---------------- remove substitution ----------------

            document.querySelectorAll('.remove-sub-btn').forEach(btn => {
                btn.addEventListener('click', e => {
                    this.activeView = 'subs';

                    this.app.removeSubstitution(
                        e.currentTarget.dataset.sub
                    );
                });
            });
        }
    }

    global.Hive.renderers.TeamsRenderer = TeamsRenderer;
})(typeof window !== 'undefined' ? window : globalThis);
