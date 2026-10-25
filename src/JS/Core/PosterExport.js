/**
 * PosterExport - draws shareable PNG posters on a canvas and downloads them.
 */
(function (global) {
    'use strict';

    const C = {
        bg: '#15131F',
        panel: '#1E1B2E',
        row: '#272338',
        purple: '#7C3AED',
        yellow: '#FACC15',
        gold: '#F59E0B',
        text: '#F4F2FA',
        soft: '#C7C1DC',
        muted: '#8B83A6'
    };
    const FONT = "'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, sans-serif";

    /**
     * @typedef {Object} PosterPlayer
     * @property {string} name Player name.
     * @property {string} team Team display name.
     * @property {string} teamColor CSS color.
     * @property {number} points Total points.
     */

    /**
     * @typedef {Object} PosterTeam
     * @property {string} team Team display name.
     * @property {string} teamColor CSS color.
     * @property {number} points Total points.
     * @property {Array<{name: string, points: number}>} players Team players.
     */

    class PosterExport {
        /**
         * Save a canvas as a PNG: native save dialog on desktop, download otherwise.
         * @param {HTMLCanvasElement} canvas Canvas to save.
         * @param {string} filename Suggested file name.
         * @returns {void}
         */
        static save(canvas, filename) {
            canvas.toBlob(async blob => {
                const bridge = global.hiveDesktop;
                const Toast = global.Hive.Toast;
                if (bridge && bridge.saveImage) {
                    const bytes = new Uint8Array(await blob.arrayBuffer());
                    const res = await bridge.saveImage(filename, bytes);
                    if (res.ok) Toast.show(`Saved to ${res.path}`, 'Exported', '', 6000);
                    else if (!res.canceled) Toast.show('Could not save the image.', 'Export failed', 'warning');
                    return;
                }
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = filename;
                a.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
                Toast.show('Poster downloaded.', 'Exported', '', 3500);
            }, 'image/png');
        }

        /**
         * Create a filled canvas of the given size.
         * @param {number} w Width.
         * @param {number} h Height.
         * @returns {{canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D}} Canvas and context.
         */
        static createCanvas(w, h) {
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = C.bg;
            ctx.fillRect(0, 0, w, h);
            return { canvas, ctx };
        }

        /**
         * Draw the poster title bar.
         * @param {CanvasRenderingContext2D} ctx Canvas context.
         * @param {number} w Canvas width.
         * @param {string} title Main title.
         * @param {string} subtitle Subtitle line.
         * @returns {void}
         */
        static header(ctx, w, title, subtitle) {
            ctx.fillStyle = C.purple;
            ctx.fillRect(0, 0, w, 8);
            ctx.fillStyle = C.yellow;
            ctx.font = `700 40px ${FONT}`;
            ctx.textBaseline = 'alphabetic';
            ctx.fillText(title, 48, 78);
            ctx.fillStyle = C.soft;
            ctx.font = `400 20px ${FONT}`;
            ctx.fillText(subtitle, 48, 110);
        }

        /**
         * Draw the poster footer with branding and timestamp.
         * @param {CanvasRenderingContext2D} ctx Canvas context.
         * @param {number} w Canvas width.
         * @param {number} h Canvas height.
         * @returns {void}
         */
        static footer(ctx, w, h) {
            ctx.fillStyle = C.muted;
            ctx.font = `400 15px ${FONT}`;
            ctx.fillText('Hive Event Scorer | Not affiliated with The Hive', 48, h - 28);
            const stamp = new Date().toLocaleString();
            ctx.fillText(stamp, w - 48 - ctx.measureText(stamp).width, h - 28);
        }

        /**
         * Draw right-aligned text.
         * @param {CanvasRenderingContext2D} ctx Canvas context.
         * @param {string} text Text to draw.
         * @param {number} right Right edge x.
         * @param {number} y Baseline y.
         * @returns {void}
         */
        static rightText(ctx, text, right, y) {
            ctx.fillText(text, right - ctx.measureText(text).width, y);
        }

        /**
         * Medal color for a rank index.
         * @param {number} i Zero-based rank.
         * @returns {string|null} Color or null past 3rd.
         */
        static medal(i) {
            return [C.yellow, C.soft, C.gold][i] || null;
        }

        /**
         * Trace a rounded rectangle path.
         * @param {CanvasRenderingContext2D} ctx Canvas context.
         * @param {number} x Left.
         * @param {number} y Top.
         * @param {number} w Width.
         * @param {number} h Height.
         * @param {number} r Corner radius.
         * @returns {void}
         */
        static roundRect(ctx, x, y, w, h, r) {
            ctx.beginPath();
            ctx.moveTo(x + r, y);
            ctx.arcTo(x + w, y, x + w, y + h, r);
            ctx.arcTo(x + w, y + h, x, y + h, r);
            ctx.arcTo(x, y + h, x, y, r);
            ctx.arcTo(x, y, x + w, y, r);
            ctx.closePath();
        }

        /**
         * Draw and download the player-standings poster.
         * @param {PosterPlayer[]} players Sorted desc by points.
         * @param {string} eventTitle Poster title.
         * @returns {void}
         */
        static playerStandings(players, eventTitle = 'Event Standings') {
            const top = 150, rowH = 46, pad = 48, w = 900;
            const h = top + Math.max(players.length, 1) * rowH + 70;
            const { canvas, ctx } = PosterExport.createCanvas(w, h);
            PosterExport.header(ctx, w, eventTitle, 'Player Standings - total points');

            players.forEach((p, i) => {
                const y = top + i * rowH;
                ctx.fillStyle = C.row;
                PosterExport.roundRect(ctx, pad, y, w - pad * 2, rowH - 8, 8);
                ctx.fill();
                ctx.fillStyle = p.teamColor || C.purple;
                ctx.fillRect(pad, y, 6, rowH - 8);

                ctx.fillStyle = PosterExport.medal(i) || C.muted;
                ctx.font = `800 22px ${FONT}`;
                ctx.fillText(`#${i + 1}`, pad + 20, y + 27);

                ctx.fillStyle = C.text;
                ctx.font = `600 22px ${FONT}`;
                ctx.fillText(p.name, pad + 90, y + 27);

                ctx.fillStyle = C.yellow;
                ctx.font = `800 22px ${FONT}`;
                PosterExport.rightText(ctx, `${p.points} pts`, w - pad - 20, y + 27);
            });

            if (players.length === 0) {
                ctx.fillStyle = C.muted;
                ctx.font = `400 20px ${FONT}`;
                ctx.fillText('No player data yet.', pad + 10, top + 30);
            }

            PosterExport.footer(ctx, w, h);
            PosterExport.save(canvas, `event-player-standings-${Date.now()}.png`);
        }

        /**
         * Draw and download the team-winners poster.
         * @param {PosterTeam[]} teams Sorted desc by points.
         * @param {string} eventTitle Poster title.
         * @returns {void}
         */
        static eventWinners(teams, eventTitle = 'Event Champions') {
            const top = 150, pad = 48, w = 900;
            const blockH = t => 64 + (t.players ? t.players.length : 0) * 26 + 16;
            const h = Math.max(top + teams.reduce((s, t) => s + blockH(t), 0) + 70, top + 120);
            const { canvas, ctx } = PosterExport.createCanvas(w, h);
            PosterExport.header(ctx, w, eventTitle, 'Final team standings');

            let y = top;
            teams.forEach((t, i) => {
                const bh = blockH(t);
                ctx.fillStyle = C.panel;
                PosterExport.roundRect(ctx, pad, y, w - pad * 2, bh - 10, 10);
                ctx.fill();
                ctx.fillStyle = t.teamColor || C.purple;
                ctx.fillRect(pad, y, 8, bh - 10);

                ctx.fillStyle = PosterExport.medal(i) || C.muted;
                ctx.font = `800 26px ${FONT}`;
                ctx.fillText(i === 0 ? '1st' : `#${i + 1}`, pad + 24, y + 40);

                ctx.fillStyle = C.text;
                ctx.fillText(t.team, pad + 130, y + 40);

                ctx.fillStyle = C.yellow;
                PosterExport.rightText(ctx, `${t.points} pts`, w - pad - 24, y + 40);

                let py = y + 64;
                ctx.font = `400 17px ${FONT}`;
                (t.players || []).forEach(pl => {
                    ctx.fillStyle = C.soft;
                    ctx.fillText(pl.name, pad + 130, py + 14);
                    ctx.fillStyle = C.muted;
                    PosterExport.rightText(ctx, `${pl.points}`, w - pad - 24, py + 14);
                    py += 26;
                });

                y += bh;
            });

            if (teams.length === 0) {
                ctx.fillStyle = C.muted;
                ctx.font = `400 20px ${FONT}`;
                ctx.fillText('No completed games yet.', pad + 10, top + 30);
            }

            PosterExport.footer(ctx, w, h);
            PosterExport.save(canvas, `event-winners-${Date.now()}.png`);
        }
    }

    global.Hive = global.Hive || {};
    global.Hive.PosterExport = PosterExport;

    if (typeof module !== 'undefined' && module.exports) module.exports = PosterExport;
})(typeof window !== 'undefined' ? window : globalThis);
