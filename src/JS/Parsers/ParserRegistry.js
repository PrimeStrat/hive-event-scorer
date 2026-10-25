/**
 * ParserRegistry - maps gamemode names to parser classes and builds instances.
 */
(function (global) {
    'use strict';
    const P = global.Hive.parsers;
    const ChatUtils = global.Hive.ChatUtils;

    const REGISTRY = {
        'BedWars': P.BedWars,
        'SkyWars': P.SkyWars,
        'Survival Games': P['Survival Games'],
        'DeathRun': P.DeathRun,
        'Gravity': P.Gravity,
        'BlockDrop': P.BlockDrop,
        'Block Party': P['Block Party']
    };

    class ParserRegistry {
        /**
         * Parser class for a gamemode; custom gamemodes get the base parser.
         * @param {string} gamemode Gamemode name.
         * @returns {Function} Parser class.
         */
        static classFor(gamemode) {
            return ChatUtils.lookupMode(REGISTRY, gamemode) || P.GamemodeParser;
        }

        /**
         * Build and register a parser instance per gamemode.
         * @param {GameState} state Shared game state.
         * @param {ScoringEngine} engine Scoring engine.
         * @param {PointSystem} points Point tables and toggles.
         * @returns {Object<string, GamemodeParser>} Gamemode name to parser instance.
         */
        static buildAll(state, engine, points) {
            const built = {};
            for (const [name, ParserClass] of Object.entries(REGISTRY)) {
                built[name] = new ParserClass(state, engine, points);
                engine.registerParser(name, built[name]);
            }
            return built;
        }
    }

    ParserRegistry.REGISTRY = REGISTRY;

    global.Hive.parserRegistry = ParserRegistry;

    if (typeof module !== 'undefined' && module.exports) module.exports = ParserRegistry;
})(typeof window !== 'undefined' ? window : globalThis);
