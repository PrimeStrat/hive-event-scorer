/**
 * SettingsRenderer - the Settings tab: per-gamemode point values (placements
 * windowed to 12 with a show-all expander, up to 50), detection-pattern hints,
 * the "My IGN" field, and the misc scoring toggles.
 */
(function (global) {
    'use strict';
    const Base = global.Hive.renderers.Renderer;
    const ChatUtils = global.Hive.ChatUtils;

    const MAX_PLACEMENTS = 50;
    const VISIBLE_PLACEMENTS = 12;
    const PLACEMENT_RE = /^(\d+)(?:st|nd|rd|th) place$/;
    const INDIV_PLACEMENT_RE = /^Indiv (\d+)(?:st|nd|rd|th) place$/;
    const PATTERN_FIELDS = {
        patternTeamElim: 'teamElimination',
        patternWinner: 'winner',
        patternKillPrefix: 'killPrefix',
        patternBedBreak: 'bedBreak',
        patternIndividualFinish: 'individualFinish'
    };
    const TOGGLE_FIELDS = ['autoAddUnknownPlayers', 'enableKillLeader', 'enableExtendedTeamBonuses', 'enableSoloPlacements', 'enableChestPoints'];

    class SettingsRenderer extends Base {
        /**
         * Gamemode chosen in the settings dropdown.
         * @returns {string} Gamemode name or ''.
         */
        selectedGamemode() {
            const sel = this.$('settingsGamemode');
            return sel ? sel.value : '';
        }

        /**
         * Non-placement keys hidden while their misc toggle is off.
         * @param {string} action Point-table key.
         * @returns {boolean} True when the key should be hidden.
         */
        isToggledOffKey(action) {
            if (action === 'Kill Leader') return !this.points.enableKillLeader;
            if (action === 'Mystery Chest') return !this.points.enableChestPoints;
            if (/^(Second|Third) (full team finish|last team standing)$/.test(action)) {
                return !this.points.enableExtendedTeamBonuses;
            }
            return false;
        }

        /**
         * One labelled number input for a point-table key.
         * @param {string} action Point-table key.
         * @param {number} value Current points.
         * @param {string} extraAttr Extra attribute markup for the row, or ''.
         * @returns {string} HTML.
         */
        pointRow(action, value, extraAttr) {
            return `
                <div class="point-item"${extraAttr}>
                    <label>${this.escapeHtml(action)}</label>
                    <input type="number" data-action="${this.escapeHtml(action)}" value="${value}" min="0" max="1000">
                </div>`;
        }

        /**
         * A placement section: visible rows, hidden extra rows and a show-all toggle.
         * @param {Object<string, number>} table Point table.
         * @param {string} prefix Key prefix, '' or 'Indiv '.
         * @param {string} heading Section heading.
         * @param {string} idPart Id suffix for the extra rows and toggle button.
         * @param {string} label Word used on the toggle button.
         * @returns {string} HTML.
         */
        placementSection(table, prefix, heading, idPart, label) {
            let visible = '', hidden = '';
            for (let i = 1; i <= MAX_PLACEMENTS; i++) {
                const key = prefix + ChatUtils.ordinal(i) + ' place';
                const row = this.pointRow(key, table[key] || 0, ' data-placement="1"');
                if (i <= VISIBLE_PLACEMENTS) visible += row;
                else hidden += row;
            }
            return `<h4 class="placement-heading">${heading}</h4>${visible}
                <div id="extra${idPart}" class="extra-placements hidden">${hidden}</div>
                <button type="button" id="toggle${idPart}" class="btn btn-secondary btn-small">Show all ${MAX_PLACEMENTS} ${label}</button>`;
        }

        /**
         * Wire one show-all placements toggle.
         * @param {string} idPart Id suffix used by placementSection.
         * @param {string} label Word used on the toggle button.
         * @returns {void}
         */
        wirePlacementToggle(idPart, label) {
            const btn = this.$(`toggle${idPart}`);
            if (!btn) return;
            btn.addEventListener('click', () => {
                const extra = this.$(`extra${idPart}`);
                if (!extra) return;
                const nowHidden = extra.classList.toggle('hidden');
                btn.textContent = nowHidden ? `Show all ${MAX_PLACEMENTS} ${label}` : `Show fewer ${label}`;
            });
        }

        /**
         * Tie-handling dropdown bound to a PointSystem tie-mode field.
         * @param {string} id Select id and PointSystem field name.
         * @param {string} label Row label.
         * @returns {string} HTML.
         */
        tieModeRow(id, label) {
            const current = this.points[id];
            return `
                <div class="point-item">
                    <label for="${id}">${label}</label>
                    <select id="${id}">
                        <option value="shared-first" ${current === 'shared-first' ? 'selected' : ''}>Multiple 1st Places</option>
                        <option value="shared-placement" ${current === 'shared-placement' ? 'selected' : ''}>Shared Next Placement</option>
                    </select>
                </div>`;
        }

        /**
         * Render the point inputs for the selected gamemode.
         * @returns {void}
         */
        renderPoints() {
            const host = this.$('pointsSettings');
            if (!host) return;
            const mode = this.selectedGamemode();
            const table = this.points.pointSystems[mode];
            if (!table) {
                host.innerHTML = '<p class="empty-state">Invalid gamemode selected</p>';
                return;
            }
            const features = this.points.featuresFor(mode) || {};
            const soloPvp = features.pvp && this.points.enableSoloPlacements;

            const otherRows = Object.entries(table)
                .filter(([action]) => !PLACEMENT_RE.test(action) && !INDIV_PLACEMENT_RE.test(action) && !this.isToggledOffKey(action))
                .map(([action, value]) => this.pointRow(action, value, ''))
                .join('');
            let tieRow = '';
            if (mode === 'Block Party') tieRow = this.tieModeRow('blockPartyTieMode', 'Tie Handling');
            else if (features.pvp) tieRow = this.tieModeRow('pvpTeamTieMode', 'Team Tie Handling');

            host.innerHTML = `<h3>Point Values for ${this.escapeHtml(mode)}</h3>` + otherRows + tieRow +
                this.placementSection(table, '', features.pvp ? 'Team Placement Points' : 'Placement Points', 'Placements', 'placements') +
                (soloPvp ? this.placementSection(table, 'Indiv ', 'Indiv Placement Points', 'IndivPlacements', 'indiv placements') : '');

            this.wirePlacementToggle('Placements', 'placements');
            this.wirePlacementToggle('IndivPlacements', 'indiv placements');
        }

        /**
         * Fill the pattern hints, IGN field and misc toggles from settings.
         * @returns {void}
         */
        renderPatterns() {
            const p = this.points.detectionPatterns || {};
            for (const [id, key] of Object.entries(PATTERN_FIELDS)) {
                const el = this.$(id);
                if (el) el.value = p[key] || '';
            }
            const ign = this.$('myIgn');
            if (ign) ign.value = this.points.myIgn || '';
            for (const id of TOGGLE_FIELDS) {
                const el = this.$(id);
                if (el) el.checked = id === 'autoAddUnknownPlayers' ? this.points[id] !== false : this.points[id] === true;
            }
            this.updatePatternVisibility();
        }

        /**
         * Show only the pattern fields the selected gamemode uses.
         * @returns {void}
         */
        updatePatternVisibility() {
            const features = this.points.featuresFor(this.selectedGamemode());
            if (!features) return;
            const toggle = (id, show) => {
                const el = this.$(id);
                if (el) el.classList.toggle('hidden', !show);
            };
            toggle('patternKillGroup', features.kills);
            toggle('patternBedBreakGroup', features.bedBreaks);
            toggle('patternIndividualFinishGroup', features.individualFinish);
        }

        /**
         * Read point inputs, patterns, IGN and misc toggles from the DOM back into
         * PointSystem. Zero-valued non-default placements stay out of the table.
         * @returns {void}
         */
        collectFromDom() {
            const mode = this.selectedGamemode();
            const table = this.points.pointSystems[mode];
            const host = this.$('pointsSettings');
            if (table && host) {
                const defaults = global.Hive.PointSystem.defaultPointSystems()[mode] || {};
                host.querySelectorAll('input[type="number"]').forEach(input => {
                    const action = input.dataset.action;
                    const value = parseInt(input.value, 10) || 0;
                    const isPlacement = PLACEMENT_RE.test(action) || INDIV_PLACEMENT_RE.test(action);
                    if (isPlacement && value === 0 && defaults[action] === undefined) delete table[action];
                    else table[action] = value;
                });
            }
            const patterns = {};
            for (const [id, key] of Object.entries(PATTERN_FIELDS)) {
                const el = this.$(id);
                patterns[key] = el ? el.value : '';
            }
            this.points.detectionPatterns = patterns;
            const ign = this.$('myIgn');
            if (ign) this.points.myIgn = ign.value.trim();
            for (const id of TOGGLE_FIELDS) {
                const el = this.$(id);
                if (el) this.points[id] = el.checked;
            }
            for (const id of ['blockPartyTieMode', 'pvpTeamTieMode']) {
                const el = this.$(id);
                if (el) this.points[id] = el.value;
            }
        }

        /**
         * Render the whole Settings tab.
         * @returns {void}
         */
        renderAll() {
            this.renderPoints();
            this.renderPatterns();
        }
    }

    global.Hive.renderers.SettingsRenderer = SettingsRenderer;
})(typeof window !== 'undefined' ? window : globalThis);
