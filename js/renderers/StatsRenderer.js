/**
 * StatsRenderer - the Statistics tab: current-game player performance, the point
 * record, completed game history (with inline score editing), and the overall
 * player leaderboard (with inline per-gamemode score editing).
 */
(function (global) {
    'use strict';
    const Base = global.Hive.renderers.Renderer;
    const ChatUtils = global.Hive.ChatUtils;

    class StatsRenderer extends Base {
        constructor(app) {
            super(app);
            this.sortMode = 'points';
        }

        renderAll() {
            this.renderPlayerStats();
            this.renderPointRecord();
            this.renderGameHistory();
            this.renderOverallStats();
        }

        // ---- current-game player performance -----------------------------
        renderPlayerStats() {
            const host = this.$('playerStats');
            if (!host) return;
            const features = this.points.featuresFor(this.state.gamemode) || {};
            const showCombat = !!features.kills;
            const showBeds = !!features.bedBreaks;

            const rows = Object.entries(this.state.playerStats)
                .filter(([name]) => this.state.findPlayerTeam(name))
                .map(([name, data]) => ({ name, data, contribution: this.engine.currentPlayerContribution(name, data) }));

            if (rows.length === 0) {
                host.innerHTML = '<p class="empty-state">No player data yet! Process some chat to see stats.</p>';
                return;
            }

            rows.sort((a, b) => this.compareRows(a, b));

            host.innerHTML = '<div class="player-stats-grid">' + rows.map(({ name, data, contribution }) => {
                const color = this.state.teams[data.team]?.color || '#888';
                return `
                    <div class="player-stat-card ${data.eliminated ? 'eliminated' : ''}" style="border-left: 4px solid ${color}">
                        <h3>${this.escapeHtml(name)}</h3>
                        <div class="stat-badge" style="background: ${color}">${this.escapeHtml(data.team)}</div>
                        <div class="stat-row highlight"><span>Points:</span><span>${contribution}</span></div>
                        <div class="stat-row"><span>Status:</span><span>${data.eliminated ? 'Eliminated' : 'Active'}</span></div>
                        ${showCombat ? `
                        <div class="stat-row"><span>Kills:</span><span>${data.kills}</span></div>
                        <div class="stat-row"><span>Deaths:</span><span>${data.deaths}</span></div>
                        <div class="stat-row"><span>Final Kills:</span><span>${data.finalKills}</span></div>` : ''}
                        ${showBeds && data.bedBreaks > 0 ? `
                        <div class="stat-row"><span>Bed Breaks:</span><span>${data.bedBreaks}</span></div>` : ''}
                        ${data.placement ? `
                        <div class="stat-row highlight"><span>Placement:</span><span>${data.placement}</span></div>` : ''}
                    </div>`;
            }).join('') + '</div>';
        }

        compareRows(a, b) {
            switch (this.sortMode) {
                case 'kills': return b.data.kills - a.data.kills;
                case 'finalKills': return b.data.finalKills - a.data.finalKills;
                case 'bedBreaks': return (b.data.bedBreaks || 0) - (a.data.bedBreaks || 0);
                case 'deathsLow': return a.data.deaths - b.data.deaths;
                case 'deathsHigh': return b.data.deaths - a.data.deaths;
                case 'placement': {
                    const n = p => { const m = String(p || '').match(/\d+/); return m ? +m[0] : Number.MAX_SAFE_INTEGER; };
                    return n(a.data.placement) - n(b.data.placement);
                }
                default: return b.contribution - a.contribution;
            }
        }

        // ---- point record (current game events) --------------------------
        renderPointRecord() {
            const host = this.$('pointRecord');
            if (!host) return;
            if (!this.state.hasActiveScores()) {
                host.innerHTML = '<p class="empty-state">No point records yet!</p>';
                return;
            }
            const sorted = Object.entries(this.state.scores).sort((a, b) => b[1].score - a[1].score);
            host.innerHTML = sorted.map(([teamName, data]) => {
                const color = this.state.teams[teamName]?.color || '#888';
                const events = (data.events || []).slice().reverse().slice(0, 12);
                const eventHtml = events.length
                    ? events.map(e => `<li>${this.escapeHtml(e.type)} <span class="pr-pts">+${e.points}</span></li>`).join('')
                    : '<li class="empty-state">No events</li>';
                return `
                    <div class="point-record-team" style="border-left: 3px solid ${color}">
                        <div class="pr-head"><span class="team-name" style="color:${color}">${this.escapeHtml(teamName)}</span><span class="pr-total">${data.score} pts</span></div>
                        <ul class="pr-events">${eventHtml}</ul>
                    </div>`;
            }).join('');
        }

        // ---- completed game history --------------------------------------
        renderGameHistory() {
            const host = this.$('gameHistory');
            if (!host) return;
            if (this.state.gameHistory.length === 0) {
                host.innerHTML = '<p class="empty-state">No completed games yet! Start a new game after playing to save it to history.</p>';
                return;
            }
            const games = [...this.state.gameHistory].reverse();
            host.innerHTML = games.map(game => this.renderGameCard(game)).join('');
        }

        renderGameCard(game) {
            const start = new Date(game.startTime);
            const end = new Date(game.endTime);
            const duration = isFinite(end) ? Math.round((end - start) / 60000) : 0;
            const editing = String(this.state.editingGameId) === String(game.id);
            const teams = Object.entries(game.scores).sort((a, b) => b[1].score - a[1].score);
            const winner = teams[0];
            const features = this.points.featuresFor(game.gamemode) || {};
            const showCombat = !!features.kills, showBeds = !!features.bedBreaks;

            return `
                <div class="game-history-card ${editing ? 'editing' : ''}" data-game-id="${game.id}">
                    <div class="game-header">
                        <h3>${this.escapeHtml(game.gamemode)}</h3>
                        <span class="game-date">${start.toLocaleString()}</span>
                    </div>
                    <div class="game-info">
                        <span>Duration: ${duration} min</span>
                        <span>Winner: ${winner ? this.escapeHtml(winner[0]) + ' (' + winner[1].score + ' pts)' : '-'}</span>
                    </div>
                    <details class="game-details">
                        <summary>View Full Scores &amp; Player Stats</summary>
                        <div class="game-scores">
                            <div class="game-scores-header">
                                <h4>Team Scores</h4>
                                ${editing ? `
                                <div class="game-score-editor-actions">
                                    <button type="button" class="btn btn-success btn-small" data-action="save-game-scores" data-game-id="${game.id}">Save Scores</button>
                                    <button type="button" class="btn btn-secondary btn-small" data-action="cancel-game-scores" data-game-id="${game.id}">Cancel</button>
                                </div>` : `
                                <button type="button" class="btn btn-info btn-small" data-action="edit-game-scores" data-game-id="${game.id}">Edit Scores</button>`}
                            </div>
                            ${editing ? '<p class="game-score-editor-help">Adjust the saved score for any team. Totals refresh on save.</p>' : ''}
                            ${teams.map(([teamName, data], i) => {
                                const color = this.state.teams[teamName]?.color || '#888';
                                return `
                                    <div class="score-row" style="border-left: 3px solid ${color}">
                                        <span class="rank">#${i + 1}</span>
                                        <span class="team-name">${this.escapeHtml(teamName)}</span>
                                        ${editing
                                            ? `<input type="number" class="score-editor-input" data-team="${this.escapeHtml(teamName)}" value="${data.score}" min="0" />`
                                            : `<span class="points">${data.score} pts</span>`}
                                    </div>`;
                            }).join('')}
                        </div>
                        <div class="game-player-stats">
                            <h4>Player Performance</h4>
                            <div class="player-stats-grid">
                                ${Object.entries(game.playerStats).map(([name, data]) => {
                                    const color = this.state.teams[data.team]?.color || '#888';
                                    const c = this.engine.gamePlayerContribution(game, name, data);
                                    return `
                                        <div class="player-stat-card mini" style="border-left: 4px solid ${color}">
                                            <strong>${this.escapeHtml(name)}</strong>
                                            <div class="stat-badge" style="background: ${color}">${this.escapeHtml(data.team)}</div>
                                            <div class="mini-stats">
                                                <span>Pts: ${c}</span>
                                                ${showCombat ? `<span>K: ${data.kills}</span><span>D: ${data.deaths}</span><span>FK: ${data.finalKills}</span>` : ''}
                                                ${showBeds && data.bedBreaks > 0 ? `<span>BB: ${data.bedBreaks}</span>` : ''}
                                                ${data.placement ? `<span>Pl: ${data.placement}</span>` : ''}
                                            </div>
                                        </div>`;
                                }).join('')}
                            </div>
                        </div>
                    </details>
                </div>`;
        }

        // ---- overall leaderboard -----------------------------------------
        renderOverallStats() {
            const host = this.$('overallStats');
            if (!host) return;
            if (this.state.gameHistory.length === 0) {
                host.innerHTML = '<p class="empty-state">No games played yet!</p>';
                return;
            }
            const scores = this.aggregatePlayerScores();
            const registered = Object.entries(scores).filter(([name]) => this.state.findPlayerTeam(name));
            if (registered.length === 0) {
                host.innerHTML = '<p class="empty-state">No registered player data yet!</p>';
                return;
            }
            const sorted = registered.sort((a, b) => b[1].totalPoints - a[1].totalPoints);

            host.innerHTML = `
                <div class="tutorial-tip"><strong>Tip:</strong> Click a per-gamemode score below to edit it. Press Enter or click away to save. Player and team totals stay in sync.</div>
                <div class="overall-summary">
                    <div class="summary-card"><div class="summary-value">${this.state.gameHistory.length}</div><div class="summary-label">Total Games</div></div>
                    <div class="summary-card"><div class="summary-value">${sorted.length}</div><div class="summary-label">Registered Players</div></div>
                </div>
                <div class="player-leaderboard">
                    <h3>Player Leaderboard (Total Points)</h3>
                    ${sorted.map(([name, data], i) => {
                        const teamName = this.state.findPlayerTeam(name);
                        const color = this.state.teams[teamName]?.color || '#888';
                        const breakdown = Object.entries(data.byGamemode).map(([mode, pts]) =>
                            `<span class="gamemode-score" data-player="${this.escapeHtml(name)}" data-gamemode="${this.escapeHtml(mode)}" contenteditable="true" data-original="${pts}">${pts}</span> <span class="gamemode-label">${this.escapeHtml(mode)}</span>`).join(', ');
                        return `
                            <div class="player-leaderboard-card" style="border-left: 4px solid ${color}">
                                <div class="leaderboard-rank">#${i + 1}</div>
                                <div class="leaderboard-player-info">
                                    <h3>${this.escapeHtml(name)}</h3>
                                    <div class="stat-badge" style="background: ${color}">${this.escapeHtml(teamName)}</div>
                                </div>
                                <div class="leaderboard-total">${data.totalPoints} pts</div>
                                <div class="leaderboard-breakdowns">${breakdown || '<em>No scores yet</em>'}</div>
                            </div>`;
                    }).join('')}
                </div>`;

            host.querySelectorAll('.gamemode-score').forEach(el => {
                el.addEventListener('blur', e => this.app.savePlayerGamemodeScore(e));
                el.addEventListener('keypress', e => {
                    if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); }
                });
            });
        }

        /**
         * Aggregate each player's points across all completed games. Team scores are
         * split among the players on that team who appear in the game. The previous
         * version used Math.floor and silently dropped the remainder, so player sums
         * never reconciled with team totals; we now give the remainder to the
         * highest-contributing player so per-player sums equal the team score.
         */
        aggregatePlayerScores() {
            const result = {};
            for (const game of this.state.gameHistory) {
                for (const [teamName, teamScore] of Object.entries(game.scores)) {
                    const team = this.state.teams[teamName];
                    if (!team || !team.players) continue;
                    const players = team.players.filter(p => game.playerStats[p]);
                    if (players.length === 0) continue;

                    const base = Math.floor(teamScore.score / players.length);
                    let remainder = teamScore.score - base * players.length;
                    // Distribute remainder to the players with the highest contribution first.
                    const ranked = players.slice().sort((a, b) =>
                        this.engine.gamePlayerContribution(game, b, game.playerStats[b]) -
                        this.engine.gamePlayerContribution(game, a, game.playerStats[a]));

                    for (const name of ranked) {
                        let pts = base;
                        if (remainder > 0) { pts += 1; remainder--; }
                        if (!result[name]) result[name] = { totalPoints: 0, byGamemode: {} };
                        result[name].totalPoints += pts;
                        result[name].byGamemode[game.gamemode] = (result[name].byGamemode[game.gamemode] || 0) + pts;
                    }
                }
            }
            return result;
        }
    }

    global.Hive.renderers.StatsRenderer = StatsRenderer;
})(typeof window !== 'undefined' ? window : globalThis);
