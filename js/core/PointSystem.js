/**
 * PointSystem - default scoring tables, gamemode feature flags, detection-pattern
 * defaults, and settings persistence (localStorage + JSON import/export).
 *
 * Point values mirror The Hive event scoring. `features` declares which event
 * categories a gamemode supports so the UI and parsers can branch off one source.
 */
(function (global) {
    'use strict';

    function defaultPointSystems() {
        return {
            'DeathRun': { '1st place': 4, '2nd place': 3, '3rd place': 2, '4th place': 1, '5th place': 1, 'First full team finish': 1 },
            'SkyWars': { '1st place': 4, '2nd place': 3, '3rd place': 2, 'Kill': 1 },
            'Survival Games': { '1st place': 4, '2nd place': 3, '3rd place': 2, 'Kill': 1 },
            'BedWars': { '1st place': 4, '2nd place': 3, '3rd place': 2, 'Kill': 1, 'Bed Break': 1 },
            'Gravity': { '1st place': 4, '2nd place': 3, '3rd place': 2, '4th place': 1, '5th place': 1, 'First full team finish': 1 },
            'BlockDrop': { '1st place': 4, '2nd place': 3, '3rd place': 2, '4th place': 1, '5th place': 1, 'Last team standing': 1 },
            'Block Party': { '1st place': 4, '2nd place': 3, '3rd place': 2, '4th place': 1, '5th place': 1, 'Last team standing': 1 }
        };
    }

    function defaultFeatures() {
        return {
            // kills: combat kills score; bedBreaks: bed-break events score;
            // individualFinish: per-player placement lines; teamFinish: full-team-finish bonus;
            // individualSurvival: last-player-standing placement from elimination order.
            'DeathRun': { kills: false, bedBreaks: false, individualFinish: true, teamFinish: true, individualSurvival: false },
            'SkyWars': { kills: true, bedBreaks: false, individualFinish: false, teamFinish: false, individualSurvival: false },
            'Survival Games': { kills: true, bedBreaks: false, individualFinish: false, teamFinish: false, individualSurvival: false },
            'BedWars': { kills: true, bedBreaks: true, individualFinish: false, teamFinish: false, individualSurvival: false },
            'Gravity': { kills: false, bedBreaks: false, individualFinish: true, teamFinish: true, individualSurvival: false },
            'BlockDrop': { kills: false, bedBreaks: false, individualFinish: false, teamFinish: false, individualSurvival: true },
            'Block Party': { kills: false, bedBreaks: false, individualFinish: false, teamFinish: false, individualSurvival: true }
        };
    }

    function defaultDetectionPatterns() {
        // Documentation-only hints shown in Settings. Parsers use their own robust
        // regexes; these strings describe the in-game formats for the user.
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
            this.STORAGE_KEY = 'hive_settings';
        }

        /** Default/protected gamemodes that cannot be deleted from the UI. */
        static get DEFAULT_MODES() {
            return Object.keys(defaultPointSystems());
        }

        load() {
            try {
                const raw = (typeof localStorage !== 'undefined') && localStorage.getItem(this.STORAGE_KEY);
                if (!raw) return;
                const settings = JSON.parse(raw);
                if (settings.pointSystems) this.pointSystems = settings.pointSystems;
                if (settings.gamemodeFeatures) this.gamemodeFeatures = settings.gamemodeFeatures;
                if (settings.detectionPatterns) this.detectionPatterns = settings.detectionPatterns;
                if (typeof settings.myIgn === 'string') this.myIgn = settings.myIgn;
            } catch (err) {
                console.error('Error loading settings:', err);
                this.reset();
            }
        }

        save() {
            const settings = {
                pointSystems: this.pointSystems,
                gamemodeFeatures: this.gamemodeFeatures,
                detectionPatterns: this.detectionPatterns,
                myIgn: this.myIgn
            };
            if (typeof localStorage !== 'undefined') {
                localStorage.setItem(this.STORAGE_KEY, JSON.stringify(settings));
            }
            return settings;
        }

        reset() {
            this.pointSystems = defaultPointSystems();
            this.gamemodeFeatures = defaultFeatures();
            this.detectionPatterns = defaultDetectionPatterns();
            this.save();
        }

        importSettings(settings) {
            if (settings.pointSystems) this.pointSystems = settings.pointSystems;
            if (settings.gamemodeFeatures) this.gamemodeFeatures = settings.gamemodeFeatures;
            if (settings.detectionPatterns) this.detectionPatterns = settings.detectionPatterns;
            if (typeof settings.myIgn === 'string') this.myIgn = settings.myIgn;
            this.save();
        }

        exportSettings() {
            return {
                pointSystems: this.pointSystems,
                gamemodeFeatures: this.gamemodeFeatures,
                detectionPatterns: this.detectionPatterns,
                myIgn: this.myIgn
            };
        }

        /** Look up a point table tolerant of spacing/case ("Block Drop" == "BlockDrop"). */
        forGamemode(gamemode) {
            return PointSystem._tolerantLookup(this.pointSystems, gamemode);
        }

        featuresFor(gamemode) {
            return PointSystem._tolerantLookup(this.gamemodeFeatures, gamemode);
        }

        static _tolerantLookup(map, gamemode) {
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
