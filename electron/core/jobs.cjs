const crypto = require('crypto');

/**
 * Long-running content jobs (modpack/template installs) the renderer shows in a floating panel.
 * Game installs are separate (GameSession) because only one game can run at a time.
 */
function createJobs(send, onFinished) {
  const jobs = new Map();
  const publish = () => send([...jobs.values()]);

  function start(title, run) {
    const job = { id: crypto.randomBytes(4).toString('hex'), title, stage: 'Hazırlanıyor', done: 0, total: 0, status: 'running' };
    jobs.set(job.id, job);
    publish();

    const report = (patch) => {
      Object.assign(job, patch);
      publish();
    };

    run(report)
      .then((result) => {
        Object.assign(job, { status: 'done', stage: 'Tamamlandı', result });
        onFinished?.(job);
      })
      .catch((e) => {
        Object.assign(job, { status: 'error', stage: 'Başarısız', message: e?.message || String(e) });
        onFinished?.(job);
      })
      .finally(() => {
        publish();
        // Finished jobs linger briefly so the user sees the outcome.
        setTimeout(() => {
          jobs.delete(job.id);
          publish();
        }, job.status === 'error' ? 30000 : 8000);
      });
    return job.id;
  }

  return { start, list: () => [...jobs.values()], dismiss: (id) => { jobs.delete(id); publish(); } };
}

/** Run `fn` over items with at most `limit` in flight. */
async function pool(items, limit, fn) {
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const index = i++;
      await fn(items[index], index);
    }
  });
  await Promise.all(workers);
}

module.exports = { createJobs, pool };
