(function attachRequestControl(globalScope) {
    function createRequestController(defaultDebounceMs) {
        const state = {
            timers: {},
            controllers: {}
        };

        const resolveDelay = (delayMs) => Math.max(0, Number(delayMs) || 0);
        const fallbackDelay = resolveDelay(defaultDebounceMs);

        function schedule(key, action, delayMs = fallbackDelay) {
            if (state.timers[key]) {
                clearTimeout(state.timers[key]);
            }

            state.timers[key] = setTimeout(async () => {
                state.timers[key] = null;
                try {
                    await action();
                } catch (error) {
                    console.error('Debounced action hiba:', error);
                }
            }, resolveDelay(delayMs));
        }

        function withAbortSignal(key) {
            const previousController = state.controllers[key];
            if (previousController) {
                previousController.abort();
            }

            const controller = new AbortController();
            state.controllers[key] = controller;
            return controller.signal;
        }

        function clearSignal(key) {
            state.controllers[key] = null;
        }

        function cancelScheduled(key) {
            if (!state.timers[key]) {
                return;
            }

            clearTimeout(state.timers[key]);
            state.timers[key] = null;
        }

        function cancelAll() {
            Object.keys(state.timers).forEach((key) => {
                if (state.timers[key]) {
                    clearTimeout(state.timers[key]);
                    state.timers[key] = null;
                }
            });

            Object.keys(state.controllers).forEach((key) => {
                const controller = state.controllers[key];
                if (controller) {
                    controller.abort();
                }
                state.controllers[key] = null;
            });
        }

        return {
            schedule,
            withAbortSignal,
            clearSignal,
            cancelScheduled,
            cancelAll
        };
    }

    globalScope.createRequestController = createRequestController;
})(window);
