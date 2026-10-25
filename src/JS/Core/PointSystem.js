/**
 * PointSystem - default scoring tables, gamemode feature flags, misc toggles,
 * and settings persistence.
 */
(function (global) {
    'use strict';

    const ChatUtils = global.Hive.ChatUtils;

    const STORAGE_KEY = 'hive_settings';
    const TIE_MODES = ['shared-first', 'shared-placement'];
    const BOOLEAN_SETTINGS = ['autoAddUnknownPlayers', 'enableKillLeader', 'enableExtendedTeamBonuses', 'enableSoloPlacements', 'enableChestPoints'];

    /**
     * @typedef {Object} GamemodeFeatures
     * @property {boolean} kills Kills score points.
     * @property {boolean} bedBreaks Bed breaks score points.
     * @property {boolean} individualFinish Players finish a course in order.
     * @property {boolean} teamFinish Team bonus when every member finishes.
     * @property {boolean} individualSurvival Players are ranked by survival.
     * @property {boolean} teamElimination Teams are ranked by elimination.
     * @property {boolean} [pvp] PvP mode; placements switch with enableSoloPlacements.
     */

    /**
     * @typedef {Object} Settings
     * @property {Object<string, Object<string, number>>} pointSystems Gamemode to point table.
     * @property {Object<string, GamemodeFeatures>} gamemodeFeatures Gamemode to feature flags.
     * @property {Object<string, string>} detectionPatterns Pattern hint strings.
     * @property {string} myIgn Log owner's IGN.
     * @property {boolean} autoAddUnknownPlayers Add unrostered players to UNKNOWN.
     * @property {boolean} enableKillLeader Kill Leader bonus toggle.
     * @property {boolean} enableExtendedTeamBonuses 2nd/3rd team bonus toggle.
     * @property {boolean} enableSoloPlacements Solo PvP placements toggle.
     * @property {boolean} enableChestPoints Mystery Chest toggle.
     * @property {string} blockPartyTieMode 'shared-first' or 'shared-placement'.
     * @property {string} pvpTeamTieMode 'shared-first' or 'shared-placement'.
     */

    class PointSystem {
        /**
         * Create a point system holding code defaults.
         */
        constructor() {
            this.STORAGE_KEY = STORAGE_KEY;
            this.myIgn = '';
            this.applyDefaults();
        }

        /**
         * Default per-gamemode point tables.
         * @returns {Object<string, Object<string, number>>} Gamemode name to point table.
         */
        static defaultPointSystems() {
            return {
                'DeathRun': { '1st place': 4, '2nd place': 3, '3rd place': 2, '4th place': 1, '5th place': 1, 'First full team finish': 1, 'Second full team finish': 0, 'Third full team finish': 0 },
                'SkyWars': { '1st place': 4, '2nd place': 3, '3rd place': 2, 'Indiv 1st place': 4, 'Indiv 2nd place': 3, 'Indiv 3rd place': 2, 'Kill': 1, 'Kill Leader': 0, 'First Blood': 0, 'Mystery Chest': 0 },
                'Survival Games': { '1st place': 4, '2nd place': 3, '3rd place': 2, 'Kill': 1, 'First Blood': 0 },
                'BedWars': { '1st place': 4, '2nd place': 3, '3rd place': 2, 'Kill': 1, 'Bed Break': 1, 'First Blood': 0 },
                'Gravity': { '1st place': 4, '2nd place': 3, '3rd place': 2, '4th place': 1, '5th place': 1, 'First full team finish': 1, 'Second full team finish': 0, 'Third full team finish': 0 },
                'BlockDrop': { '1st place': 4, '2nd place': 3, '3rd place': 2, '4th place': 1, '5th place': 1, 'Last team standing': 1, 'Second last team standing': 0, 'Third last team standing': 0 },
                'Block Party': { '1st place': 4, '2nd place': 3, '3rd place': 2, '4th place': 1, '5th place': 1, 'Last team standing': 1, 'Second last team standing': 0, 'Third last team standing': 0 }
            };
        }

        /**
         * Default per-gamemode feature flags.
         * @returns {Object<string, GamemodeFeatures>} Gamemode name to feature flags.
         */
        static defaultFeatures() {
            return {
                'DeathRun': { kills: false, bedBreaks: false, individualFinish: true, teamFinish: true, individualSurvival: false, teamElimination: false },
                'SkyWars': { kills: true, bedBreaks: false, individualFinish: false, teamFinish: false, individualSurvival: false, teamElimination: true, pvp: true },
                'Survival Games': { kills: true, bedBreaks: false, individualFinish: false, teamFinish: false, individualSurvival: false, teamElimination: true, pvp: true },
                'BedWars': { kills: true, bedBreaks: true, individualFinish: false, teamFinish: false, individualSurvival: false, teamElimination: true, pvp: true },
                'Gravity': { kills: false, bedBreaks: false, individualFinish: true, teamFinish: true, individualSurvival: false, teamElimination: false },
                'BlockDrop': { kills: false, bedBreaks: false, individualFinish: false, teamFinish: false, individualSurvival: true, teamElimination: false },
                'Block Party': { kills: false, bedBreaks: false, individualFinish: false, teamFinish: false, individualSurvival: true, teamElimination: false }
            };
        }

        /**
         * Default detection-pattern hint strings shown in Settings.
         * @returns {Object<string, string>} Pattern hints.
         */
        static defaultDetectionPatterns() {
            return {
                teamElimination: '\u00A7c\u00A7l\u00BB [TEAM] Team has been ELIMINATED',
                winner: '\u00A76\u00A7l\u00BB [TEAM] Team are the WINNERS',
                killPrefix: '\u00A7...\u00A7l\u00BB',
                bedBreak: '\u00A7c\u00A7l\u00BB Your bed was destroyed by [PLAYER]',
                individualFinish: '\u00A7a\u00A7l\u00BB [PLAYER] has finished in [N]th place'
            };
        }

        /**
         * Default gamemodes that cannot be deleted from the UI.
         * @returns {string[]} Gamemode names.
         */
        static get DEFAULT_MODES() {
            return Object.keys(PointSystem.defaultPointSystems());
        }

        /**
         * Set every setting except "My IGN" to its code default.
         * @returns {void}
         */
        applyDefaults() {
            this.pointSystems = PointSystem.defaultPointSystems();
            this.gamemodeFeatures = PointSystem.defaultFeatures();
            this.detectionPatterns = PointSystem.defaultDetectionPatterns();
            this.autoAddUnknownPlayers = true;
            this.enableKillLeader = false;
            this.enableExtendedTeamBonuses = false;
            this.enableSoloPlacements = false;
            this.enableChestPoints = false;
            this.blockPartyTieMode = 'shared-first';
            this.pvpTeamTieMode = 'shared-first';
        }

        /**
         * Copy recognized values from a settings object, ignoring bad types.
         * @param {Settings} settings Saved or imported settings.
         * @returns {void}
         */
        applySettings(settings) {
            if (settings.pointSystems) this.pointSystems = PointSystem.mergePointSystems(settings.pointSystems);
            this.gamemodeFeatures = PointSystem.mergeFeatures(settings.gamemodeFeatures);
            if (settings.detectionPatterns) this.detectionPatterns = settings.detectionPatterns;
            if (typeof settings.myIgn === 'string') this.myIgn = settings.myIgn;
            for (const key of BOOLEAN_SETTINGS) {
                if (typeof settings[key] === 'boolean') this[key] = settings[key];
            }
            if (TIE_MODES.includes(settings.blockPartyTieMode)) this.blockPartyTieMode = settings.blockPartyTieMode;
            if (TIE_MODES.includes(settings.pvpTeamTieMode)) this.pvpTeamTieMode = settings.pvpTeamTieMode;
        }

        /**
         * Load persisted settings from storage.
         * @returns {void}
         */
        load() {
            try {
                const raw = global.Hive.Storage.getItem(STORAGE_KEY);
                if (raw) this.applySettings(JSON.parse(raw));
            } catch (err) {
                console.error('Error loading settings:', err);
                this.reset();
            }
        }

        /**
         * Persist settings to storage.
         * @returns {Settings} The saved settings object.
         */
        save() {
            const settings = this.exportSettings();
            global.Hive.Storage.setItem(STORAGE_KEY, JSON.stringify(settings));
            return settings;
        }

        /**
         * Restore all settings to code defaults and persist.
         * @returns {void}
         */
        reset() {
            this.applyDefaults();
            this.save();
        }

        /**
         * Apply an imported settings object and persist.
         * @param {Settings} settings Imported settings.
         * @returns {void}
         */
        importSettings(settings) {
            this.applySettings(settings);
            this.save();
        }

        /**
         * Build the exportable settings object.
         * @returns {Settings} Settings for JSON export.
         */
        exportSettings() {
            const settings = {
                pointSystems: this.pointSystems,
                gamemodeFeatures: this.gamemodeFeatures,
                detectionPatterns: this.detectionPatterns,
                myIgn: this.myIgn
            };
            for (const key of BOOLEAN_SETTINGS) settings[key] = this[key];
            settings.blockPartyTieMode = this.blockPartyTieMode;
            settings.pvpTeamTieMode = this.pvpTeamTieMode;
            return settings;
        }

        /**
         * Merge saved feature flags with code defaults; defaults always win.
         * @param {Object<string, GamemodeFeatures>} saved Persisted feature flags.
         * @returns {Object<string, GamemodeFeatures>} Merged feature flags.
         */
        static mergeFeatures(saved) {
            return Object.assign({}, saved || {}, PointSystem.defaultFeatures());
        }

        /**
         * Merge saved point tables over code defaults so new default keys appear
         * while user values win; custom gamemodes pass through untouched.
         * @param {Object<string, Object<string, number>>} saved Persisted pointSystems map.
         * @returns {Object<string, Object<string, number>>} Merged pointSystems map.
         */
        static mergePointSystems(saved) {
            const merged = Object.assign({}, saved || {});
            for (const [mode, table] of Object.entries(PointSystem.defaultPointSystems())) {
                merged[mode] = Object.assign({}, table, merged[mode] || {});
            }
            return merged;
        }

        /**
         * Point table for a gamemode, tolerant of spacing/case differences.
         * @param {string} gamemode Gamemode name.
         * @returns {Object<string, number>|null} Point table or null.
         */
        forGamemode(gamemode) {
            return ChatUtils.lookupMode(this.pointSystems, gamemode);
        }

        /**
         * Feature flags for a gamemode, tolerant of spacing/case differences.
         * PvP modes switch between team and solo placements via enableSoloPlacements.
         * @param {string} gamemode Gamemode name.
         * @returns {GamemodeFeatures|null} Feature flags or null.
         */
        featuresFor(gamemode) {
            const features = ChatUtils.lookupMode(this.gamemodeFeatures, gamemode);
            if (!features || !features.pvp) return features;
            return Object.assign({}, features, {
                individualSurvival: this.enableSoloPlacements,
                teamElimination: true
            });
        }
    }

    global.Hive = global.Hive || {};
    global.Hive.PointSystem = PointSystem;

    if (typeof module !== 'undefined' && module.exports) module.exports = PointSystem;
})(typeof window !== 'undefined' ? window : globalThis);
