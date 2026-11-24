/**
 * Renderer - shared base for the tab renderers; pure view over app state.
 */
(function (global) {
    'use strict';

    class Renderer {
        /**
         * Create a renderer bound to the app controller.
         * @param {HiveEventScorer} app App controller.
         */
        constructor(app) {
            this.app = app;
            this.state = app.state;
            this.engine = app.engine;
            this.points = app.points;
        }

        /**
         * Escape text for safe HTML and attribute interpolation.
         * @param {*} text Value to escape.
         * @returns {string} Escaped HTML.
         */
        escapeHtml(text) {
            return String(text == null ? '' : text)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }

        /**
         * Shorthand for document.getElementById.
         * @param {string} id Element id.
         * @returns {HTMLElement|null} The element.
         */
        $(id) {
            return document.getElementById(id);
        }

        /**
         * Show a modal dialog.
         * @param {string} id Modal element id.
         * @returns {void}
         */
        openModal(id) {
            const m = this.$(id);
            if (!m) return;
            m.classList.add('open');
            m.setAttribute('aria-hidden', 'false');
        }
    }

    global.Hive = global.Hive || {};
    global.Hive.renderers = global.Hive.renderers || {};
    global.Hive.renderers.Renderer = Renderer;
})(typeof window !== 'undefined' ? window : globalThis);
