/**
 * ScoreboardRenderer - the Scorer tab: quick stats, scoreboard, activity log.
 */
(function (global) {
    'use strict';
    const Base = global.Hive.renderers.Renderer;

    class ScoreboardRenderer extends Base {
        /**
         * Render the quick-stat cards; UNKNOWN is not a competitor.
         * @returns {void}
         */
        renderQuickStats() {
            const teamCount = Object.keys(this.state.teams).filter(t => t !== 'UNKNOWN').length;
            const playerCount = this.loggedPlayerCount();

            let placements = '-';
            if (this.state.hasActiveScores()) {
                const sorted = Object.entries(this.state.scores)
                    .filter(([t]) => t !== 'UNKNOWN')
                    .sort((a, b) => b[1].score - a[1].score)
                    .filter(([, d]) => d.score > 0);
                if (sorted.length) {
                    placements = sorted.slice(0, 3)
                        .map(([t, d]) => `${t.substring(0, 3)}:${d.score}`).join(' | ');
                }
            }

            this.animateNumber('totalTeams', teamCount);
            this.animateNumber('totalPlayers', playerCount);
            const tp = this.$('teamPlacements'); if (tp) tp.textContent = placements;
            const cm = this.$('currentGamemode'); if (cm) cm.textContent = this.state.gamemode || 'None';
        }

        /**
         * Unique players across rosters and stats.
         * @returns {number} Player count.
         */
        loggedPlayerCount() {
            const set = new Set();
            Object.values(this.state.teams).forEach(t => (t.players || []).forEach(p => set.add(p)));
            Object.keys(this.state.playerStats).forEach(p => set.add(p));
            return set.size;
        }

        /**
         * Render the live team scoreboard.
         * @returns {void}
         */
        renderScoreboard() {
            const board = this.$('scoreboard');
            if (!board) return;
            if (!this.state.hasActiveScores()) {
                board.innerHTML = '<p class="empty-state">No scores yet. Select a gamemode and process some chat text to begin!</p>';
                return;
            }
            const sorted = Object.entries(this.state.scores)
                .filter(([t]) => t !== 'UNKNOWN')
                .sort((a, b) => b[1].score - a[1].score);
            if (!sorted.length) {
                board.innerHTML = '<p class="empty-state">No team scores yet.</p>';
                return;
            }
            board.innerHTML = sorted.map(([teamName, data], i) => {
                const info = this.state.teams[teamName] || { color: '#FFFFFF' };
                const count = info.players ? info.players.length : 0;
                return `
                    <div class="score-item">
                        <div class="score-rank">${i + 1}</div>
                        <div class="score-info">
                            <div class="team-name" style="color: ${info.color}">${this.escapeHtml(teamName)}</div>
                            <div class="team-stats">${count} player${count !== 1 ? 's' : ''}</div>
                        </div>
                        <div class="score-value">${data.score} pts</div>
                    </div>`;
            }).join('');
        }

        /**
         * Render the most recent activity-log entries.
         * @returns {void}
         */
        renderActivityLog() {
            const log = this.$('activityLog');
            if (!log) return;
            if (this.state.activityLog.length === 0) {
                log.innerHTML = '<p class="empty-state">Activity will appear here...</p>';
                return;
            }
            const recent = this.state.activityLog.slice(-50).reverse();
            log.innerHTML = recent.map(e => `
                <div class="log-entry ${e.type || ''}">
                    <span class="log-time">${new Date(e.time).toLocaleTimeString()}</span>
                    <span class="log-message">${this.escapeHtml(e.message)}</span>
                </div>`).join('');
        }

        /**
         * Render the whole Scorer tab.
         * @returns {void}
         */
        renderAll() {
            this.renderQuickStats();
            this.renderScoreboard();
            this.renderActivityLog();
        }
    }

    global.Hive.renderers.ScoreboardRenderer = ScoreboardRenderer;
})(typeof window !== 'undefined' ? window : globalThis);
