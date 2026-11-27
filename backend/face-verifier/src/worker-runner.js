'use strict';
const { fork } = require('node:child_process');
const { performance } = require('node:perf_hooks');
// Private transport. The public wrapper fixes the worker path and bounds the deadline.
function createRunner(workerPath, env = process.env) {
    let busy = false;
    return function run(request, timeoutMs) {
        if (busy) return Promise.resolve({ ok: false, code: 'VERIFIER_BUSY' });
        busy = true;
        return new Promise(resolve => {
            const started = performance.now();
            let child, timer, settled = false, reply;
            const finish = result => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                if (child && child.exitCode === null && child.signalCode === null) {
                    try { child.kill('SIGKILL'); } catch { /* remain busy until exit */ }
                }
                resolve(result);
            };
            try {
                child = fork(workerPath, [], { env, serialization: 'advanced', execArgv: [], stdio: ['ignore','ignore','ignore','ipc'] });
            } catch { busy = false; finish({ ok: false, code: 'WORKER_ERROR' }); return; }
            child.once('close', () => { busy = false; finish(performance.now() - started >= timeoutMs ? { ok: false, code: 'INFERENCE_TIMEOUT' } : (reply ?? { ok: false, code: 'WORKER_ERROR' })); });
            child.once('error', () => finish({ ok: false, code: 'WORKER_ERROR' }));
            child.once('message', msg => {
                if (performance.now() - started >= timeoutMs) finish({ ok: false, code: 'INFERENCE_TIMEOUT' });
                else { reply = msg; try { child.kill('SIGKILL'); } catch { finish({ ok: false, code: 'WORKER_ERROR' }); } }
            });
            const remaining = Math.max(0, timeoutMs - (performance.now() - started));
            timer = setTimeout(() => finish({ ok: false, code: 'INFERENCE_TIMEOUT' }), remaining);
            try { child.send(request, err => { if (err) finish({ ok: false, code: 'WORKER_ERROR' }); }); }
            catch { finish({ ok: false, code: 'WORKER_ERROR' }); }
        });
    };
}
module.exports = { createRunner };
