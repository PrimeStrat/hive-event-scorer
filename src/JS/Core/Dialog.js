/**
 * Dialog - in-page confirm and text prompts built on the native dialog element.
 */
(function (global) {
    'use strict';

    class Dialog {
        /**
         * Show the dialog and wait for an answer.
         * @param {string} message Question to show.
         * @param {string} confirmLabel Text on the confirm button.
         * @param {string|null} inputValue Starting text, or null to hide the text box.
         * @returns {Promise<string|null>} Entered text ('' without a text box), or null when canceled.
         */
        static ask(message, confirmLabel, inputValue) {
            const dlg = document.getElementById('appDialog');
            const input = document.getElementById('appDialogInput');
            document.getElementById('appDialogMessage').textContent = message;
            document.getElementById('appDialogOk').textContent = confirmLabel;
            input.classList.toggle('hidden', inputValue === null);
            input.required = inputValue !== null;
            input.value = inputValue || '';
            dlg.returnValue = '';
            dlg.showModal();
            if (inputValue !== null) input.select();
            return new Promise(resolve => {
                dlg.addEventListener('close', () => {
                    resolve(dlg.returnValue === 'ok' ? input.value.trim() : null);
                }, { once: true });
            });
        }

        /**
         * Ask a yes or no question.
         * @param {string} message Question to show.
         * @param {string} confirmLabel Text on the confirm button.
         * @returns {Promise<boolean>} True when confirmed.
         */
        static async confirm(message, confirmLabel = 'Confirm') {
            return (await Dialog.ask(message, confirmLabel, null)) !== null;
        }

        /**
         * Ask for one line of text.
         * @param {string} message Question to show.
         * @param {string} confirmLabel Text on the confirm button.
         * @returns {Promise<string|null>} Trimmed text, or null when canceled.
         */
        static prompt(message, confirmLabel = 'Save') {
            return Dialog.ask(message, confirmLabel, '');
        }
    }

    global.Hive = global.Hive || {};
    global.Hive.Dialog = Dialog;
})(typeof window !== 'undefined' ? window : globalThis);
