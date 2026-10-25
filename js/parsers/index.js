/**
 * Parser registry - maps gamemode names to parser classes and builds instances.
 */
(function (global) {
    'use strict';
    const P = global.Hive.parsers;

    const REGISTRY = {
        'BedWars': P.BedWars,
        'SkyWars': P.SkyWars,
        'Survival Games': P['Survival Games'],
        'DeathRun': P.DeathRun,
        'Gravity': P.Gravity,
        'BlockDrop': P.BlockDrop,
        'Block Party': P['Block Party']
    };

    /**
     * Parser class for a gamemode; custom gamemodes get the base parser.
     * @param {string} gamemode Gamemode name.
     * @returns {Function} Parser class.
     */
    function classFor(gamemode) {
        if (REGISTRY[gamemode]) return REGISTRY[gamemode];
        const norm = String(gamemode || '').replace(/\s+/g, '').toLowerCase();
        for (const [name, cls] of Object.entries(REGISTRY)) {
            if (name.replace(/\s+/g, '').toLowerCase() === norm) return cls;
        }
        return P.GamemodeParser;
    }

    /**
     * Build and register a parser instance per gamemode.
     * @param {GameState} state Shared game state.
     * @param {ScoringEngine} engine Scoring engine.
     * @param {PointSystem} points Point tables and toggles.
     * @returns {Object} Gamemode name to parser instance.
     */
    function buildAll(state, engine, points) {
        const built = {};
        for (const name of Object.keys(REGISTRY)) {
            built[name] = new REGISTRY[name](state, engine, points);
            engine.registerParser(name, built[name]);
        }
        return built;
    }

    global.Hive.parserRegistry = { REGISTRY, classFor, buildAll };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { REGISTRY, classFor, buildAll };
    }
})(typeof window !== 'undefined' ? window : globalThis);
