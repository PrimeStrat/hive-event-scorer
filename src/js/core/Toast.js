/**
 * Toast - non-blocking notification in the top-right corner.
 */
(function (global) {
    'use strict';

    const Toast = {
        _stack: null,

        /**
         * Return the toast container, creating it on first use.
         * @returns {HTMLElement} The stack element.
         */
        ensureStack() {
            if (this._stack && document.body.contains(this._stack)) return this._stack;
            let el = document.querySelector('.toast-stack');
            if (!el) {
                el = document.createElement('div');
                el.className = 'toast-stack';
                document.body.appendChild(el);
            }
            this._stack = el;
            return el;
        },

        /**
         * Show a toast that auto-dismisses and can be clicked away.
         * @param {string} message Body text.
         * @param {{title: string, type: string, duration: number}} opts Optional title, 'info'|'warning' type, and ms duration.
         * @returns {void}
         */
        show(message, opts = {}) {
            const stack = this.ensureStack();
            const toast = document.createElement('div');
            toast.className = 'toast' + (opts.type ? ' ' + opts.type : '');
            toast.innerHTML = (opts.title ? `<strong>${opts.title}</strong>` : '') +
                `<span>${message}</span>`;

            const remove = () => {
                toast.classList.remove('show');
                setTimeout(() => toast.remove(), 220);
            };
            toast.addEventListener('click', remove);

            stack.appendChild(toast);
            requestAnimationFrame(() => toast.classList.add('show'));

            const duration = opts.duration === undefined ? 5000 : opts.duration;
            if (duration > 0) setTimeout(remove, duration);
        }
    };

    global.Hive = global.Hive || {};
    global.Hive.Toast = Toast;

    if (typeof module !== 'undefined' && module.exports) module.exports = Toast;
})(typeof window !== 'undefined' ? window : globalThis);
