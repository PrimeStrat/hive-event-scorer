/**
 * Renderer - shared base for the tab renderers; pure view over app state.
 */
(function (global) {
    'use strict';

    class Renderer {
        /**
         * @param {HiveEventScorer} app App controller.
         */
        constructor(app) {
            this.app = app;
            this.state = app.state;
            this.engine = app.engine;
            this.points = app.points;
        }

        /**
         * Escape text for safe HTML interpolation.
         * @param {*} text Value to escape.
         * @returns {string} Escaped HTML.
         */
        escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text == null ? '' : String(text);
            return div.innerHTML;
        }

        /**
         * Shorthand for document.getElementById.
         * @param {string} id Element id.
         * @returns {HTMLElement|null} The element.
         */
        $(id) { return document.getElementById(id); }

        /**
         * Count up/down to a new value for the quick-stat cards.
         * @param {string} elementId Element id.
         * @param {number} newValue Target value.
         * @returns {void}
         */
        animateNumber(elementId, newValue) {
            const el = this.$(elementId);
            if (!el) return;
            const current = parseInt(el.textContent, 10) || 0;
            if (current === newValue) return;
            el.classList.add('updating');
            const steps = 20, duration = 500;
            const inc = (newValue - current) / steps;
            let val = current, step = 0;
            const timer = setInterval(() => {
                step++; val += inc;
                if (step >= steps) {
                    el.textContent = newValue;
                    clearInterval(timer);
                    setTimeout(() => el.classList.remove('updating'), 500);
                } else {
                    el.textContent = Math.round(val);
                }
            }, duration / steps);
        }
    }

    global.Hive = global.Hive || {};
    global.Hive.renderers = global.Hive.renderers || {};
    global.Hive.renderers.Renderer = Renderer;
})(typeof window !== 'undefined' ? window : globalThis);
