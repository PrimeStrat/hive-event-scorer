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
