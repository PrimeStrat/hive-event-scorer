/**
 * PointSystem - default scoring tables, gamemode feature flags, misc toggles,
 * and settings persistence.
 */
(function (global) {
    'use strict';

    /**
     * Default per-gamemode point tables.
     * @returns {Object} Gamemode name to point table.
     */
    function defaultPointSystems() {
        return {
            'DeathRun': { '1st place': 4, '2nd place': 3, '3rd place': 2, '4th place': 1, '5th place': 1, 'First full team finish': 1, 'Second full team finish': 0, 'Third full team finish': 0 },
            'SkyWars': { '1st place': 4, '2nd place': 3, '3rd place': 2, 'Kill': 1, 'Kill Leader': 0 },
            'Survival Games': { '1st place': 4, '2nd place': 3, '3rd place': 2, 'Kill': 1 },
            'BedWars': { '1st place': 4, '2nd place': 3, '3rd place': 2, 'Kill': 1, 'Bed Break': 1 },
            'Gravity': { '1st place': 4, '2nd place': 3, '3rd place': 2, '4th place': 1, '5th place': 1, 'First full team finish': 1, 'Second full team finish': 0, 'Third full team finish': 0 },
            'BlockDrop': { '1st place': 4, '2nd place': 3, '3rd place': 2, '4th place': 1, '5th place': 1, 'Last team standing': 1, 'Second last team standing': 0, 'Third last team standing': 0 },
            'Block Party': { '1st place': 4, '2nd place': 3, '3rd place': 2, '4th place': 1, '5th place': 1, 'Last team standing': 1, 'Second last team standing': 0, 'Third last team standing': 0 }
        };
    }

    /**
     * Default per-gamemode feature flags.
     * @returns {Object} Gamemode name to feature flags.
     */
    function defaultFeatures() {
        return {
            'DeathRun': { kills: false, bedBreaks: false, individualFinish: true, teamFinish: true, individualSurvival: false, teamElimination: false },
            'SkyWars': { kills: true, bedBreaks: false, individualFinish: false, teamFinish: false, individualSurvival: true, teamElimination: false },
            'Survival Games': { kills: true, bedBreaks: false, individualFinish: false, teamFinish: false, individualSurvival: true, teamElimination: false },
            'BedWars': { kills: true, bedBreaks: true, individualFinish: false, teamFinish: false, individualSurvival: true, teamElimination: false },
            'Gravity': { kills: false, bedBreaks: false, individualFinish: true, teamFinish: true, individualSurvival: false, teamElimination: false },
            'BlockDrop': { kills: false, bedBreaks: false, individualFinish: false, teamFinish: false, individualSurvival: true, teamElimination: false },
            'Block Party': { kills: false, bedBreaks: false, individualFinish: false, teamFinish: false, individualSurvival: true, teamElimination: false }
        };
    }

    /**
     * Default detection-pattern hint strings shown in Settings.
     * @returns {Object} Pattern hints.
     */
    function defaultDetectionPatterns() {
        return {
            teamElimination: '§c§l» [TEAM] Team has been ELIMINATED',
            winner: '§6§l» [TEAM] Team are the WINNERS',
            killPrefix: '§...§l»',
            bedBreak: "§c§l» Your bed was destroyed by [PLAYER]",
            individualFinish: '§a§l» [PLAYER] has finished in [N]th place'
        };
    }

    class PointSystem {
        constructor() {
            this.pointSystems = defaultPointSystems();
            this.gamemodeFeatures = defaultFeatures();
            this.detectionPatterns = defaultDetectionPatterns();
            this.myIgn = '';
            this.autoAddUnknownPlayers = true;
            this.enableKillLeader = false;
            this.enableExtendedTeamBonuses = false;
            this.STORAGE_KEY = 'hive_settings';
        }

        /**
         * Default gamemodes that cannot be deleted from the UI.
         * @returns {string[]} Gamemode names.
         */
        static get DEFAULT_MODES() {
            return Object.keys(defaultPointSystems());
        }

        /**
         * Load persisted settings from localStorage.
         * @returns {void}
         */
        load() {
            try {
                const raw = (typeof localStorage !== 'undefined') && localStorage.getItem(this.STORAGE_KEY);
                if (!raw) return;
                const settings = JSON.parse(raw);
                if (settings.pointSystems) this.pointSystems = PointSystem.mergePointSystems(settings.pointSystems);
                this.gamemodeFeatures = PointSystem.mergeFeatures(settings.gamemodeFeatures);
                if (settings.detectionPatterns) this.detectionPatterns = settings.detectionPatterns;
                if (typeof settings.myIgn === 'string') this.myIgn = settings.myIgn;
                if (typeof settings.autoAddUnknownPlayers === 'boolean') this.autoAddUnknownPlayers = settings.autoAddUnknownPlayers;
                if (typeof settings.enableKillLeader === 'boolean') this.enableKillLeader = settings.enableKillLeader;
                if (typeof settings.enableExtendedTeamBonuses === 'boolean') this.enableExtendedTeamBonuses = settings.enableExtendedTeamBonuses;
            } catch (err) {
                console.error('Error loading settings:', err);
                this.reset();
            }
        }

        /**
         * Persist settings to localStorage.
         * @returns {Object} The saved settings object.
         */
        save() {
            const settings = {
                pointSystems: this.pointSystems,
                gamemodeFeatures: this.gamemodeFeatures,
                detectionPatterns: this.detectionPatterns,
                myIgn: this.myIgn,
                autoAddUnknownPlayers: this.autoAddUnknownPlayers,
                enableKillLeader: this.enableKillLeader,
                enableExtendedTeamBonuses: this.enableExtendedTeamBonuses
            };
            if (typeof localStorage !== 'undefined') {
                localStorage.setItem(this.STORAGE_KEY, JSON.stringify(settings));
            }
            return settings;
        }

        /**
         * Restore all settings to code defaults and persist.
         * @returns {void}
         */
        reset() {
            this.pointSystems = defaultPointSystems();
            this.gamemodeFeatures = defaultFeatures();
            this.detectionPatterns = defaultDetectionPatterns();
            this.autoAddUnknownPlayers = true;
            this.enableKillLeader = false;
            this.enableExtendedTeamBonuses = false;
            this.save();
        }

        /**
         * Apply an imported settings object and persist.
         * @param {Object} settings Imported settings.
         * @returns {void}
         */
        importSettings(settings) {
            if (settings.pointSystems) this.pointSystems = PointSystem.mergePointSystems(settings.pointSystems);
            this.gamemodeFeatures = PointSystem.mergeFeatures(settings.gamemodeFeatures);
            if (settings.detectionPatterns) this.detectionPatterns = settings.detectionPatterns;
            if (typeof settings.myIgn === 'string') this.myIgn = settings.myIgn;
            if (typeof settings.autoAddUnknownPlayers === 'boolean') this.autoAddUnknownPlayers = settings.autoAddUnknownPlayers;
            if (typeof settings.enableKillLeader === 'boolean') this.enableKillLeader = settings.enableKillLeader;
            if (typeof settings.enableExtendedTeamBonuses === 'boolean') this.enableExtendedTeamBonuses = settings.enableExtendedTeamBonuses;
            this.save();
        }

        /**
         * Merge saved feature flags with code defaults; defaults always win.
         * @param {Object} saved Persisted feature flags.
         * @returns {Object} Merged feature flags.
         */
        static mergeFeatures(saved) {
            return Object.assign({}, saved || {}, defaultFeatures());
        }

        /**
         * Merge saved point tables over code defaults so new default keys appear
         * while user values win; custom gamemodes pass through untouched.
         * @param {Object} saved Persisted pointSystems map.
         * @returns {Object} Merged pointSystems map.
         */
        static mergePointSystems(saved) {
            const defaults = defaultPointSystems();
            const merged = Object.assign({}, saved || {});
            for (const [mode, table] of Object.entries(defaults)) {
                merged[mode] = Object.assign({}, table, merged[mode] || {});
            }
            return merged;
        }

        /**
         * Build the exportable settings object.
         * @returns {Object} Settings for JSON export.
         */
        exportSettings() {
            return {
                pointSystems: this.pointSystems,
                gamemodeFeatures: this.gamemodeFeatures,
                detectionPatterns: this.detectionPatterns,
                myIgn: this.myIgn,
                autoAddUnknownPlayers: this.autoAddUnknownPlayers,
                enableKillLeader: this.enableKillLeader,
                enableExtendedTeamBonuses: this.enableExtendedTeamBonuses
            };
        }

        /**
         * Point table for a gamemode, tolerant of spacing/case differences.
         * @param {string} gamemode Gamemode name.
         * @returns {Object|null} Point table or null.
         */
        forGamemode(gamemode) {
            return PointSystem.tolerantLookup(this.pointSystems, gamemode);
        }

        /**
         * Feature flags for a gamemode, tolerant of spacing/case differences.
         * @param {string} gamemode Gamemode name.
         * @returns {Object|null} Feature flags or null.
         */
        featuresFor(gamemode) {
            return PointSystem.tolerantLookup(this.gamemodeFeatures, gamemode);
        }

        /**
         * Case/spacing-tolerant map lookup by gamemode name.
         * @param {Object} map Keyed map.
         * @param {string} gamemode Gamemode name.
         * @returns {*} The value or null.
         */
        static tolerantLookup(map, gamemode) {
            if (!gamemode) return null;
            if (map[gamemode]) return map[gamemode];
            const norm = String(gamemode).replace(/\s+/g, '').toLowerCase();
            for (const [key, val] of Object.entries(map)) {
                if (key.replace(/\s+/g, '').toLowerCase() === norm) return val;
            }
            return null;
        }
    }

    PointSystem.defaultPointSystems = defaultPointSystems;
    PointSystem.defaultFeatures = defaultFeatures;
    PointSystem.defaultDetectionPatterns = defaultDetectionPatterns;

    global.Hive = global.Hive || {};
    global.Hive.PointSystem = PointSystem;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = PointSystem;
    }
})(typeof window !== 'undefined' ? window : globalThis);
