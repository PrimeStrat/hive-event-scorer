/**
 * Toast - non-blocking notification in the top-right corner.
 */
(function (global) {
    'use strict';

    class Toast {
        static stack = null;

        /**
         * Return the toast container, creating it on first use.
         * @returns {HTMLElement} The stack element.
         */
        static ensureStack() {
            if (Toast.stack && document.body.contains(Toast.stack)) return Toast.stack;
            let el = document.querySelector('.toast-stack');
            if (!el) {
                el = document.createElement('div');
                el.className = 'toast-stack';
                document.body.appendChild(el);
            }
            Toast.stack = el;
            return el;
        }

        /**
         * Show a toast that auto-dismisses and can be clicked away.
         * @param {string} message Body text.
         * @param {string} title Bold heading, or '' for none.
         * @param {string} type '' for info, or 'warning'.
         * @param {number} duration Milliseconds before auto-dismiss; 0 keeps it open.
         * @returns {void}
         */
        static show(message, title = '', type = '', duration = 5000) {
            const stack = Toast.ensureStack();
            const toast = document.createElement('div');
            toast.className = 'toast' + (type ? ' ' + type : '');
            if (title) {
                const strong = document.createElement('strong');
                strong.textContent = title;
                toast.appendChild(strong);
            }
            const body = document.createElement('span');
            body.textContent = message;
            toast.appendChild(body);

            const remove = () => {
                toast.classList.remove('show');
                setTimeout(() => toast.remove(), 220);
            };
            toast.addEventListener('click', remove);

            stack.appendChild(toast);
            requestAnimationFrame(() => toast.classList.add('show'));

            if (duration > 0) setTimeout(remove, duration);
        }
    }

    global.Hive = global.Hive || {};
    global.Hive.Toast = Toast;

    if (typeof module !== 'undefined' && module.exports) module.exports = Toast;
})(typeof window !== 'undefined' ? window : globalThis);
