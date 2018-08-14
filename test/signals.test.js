const test = require('ava');
const {
  sleep,
  push,
  mocked,
  mockServer
} = require('./_helper');
const Worker = require('../lib/worker');
const concurrency = 1;

function create(options = {}) {
  return new Worker(Object.assign({ concurrency }, options));
}

test.skip('.quiet() stops job fetching', async t => {

});

test('.stop() breaks the work loop', async t => {
  let called = 0;
  const { queue, jobtype } = await push();
  await push({ queue, jobtype });

  const stop = await new Promise((resolve, reject) => {
    const worker = create({
      queues: [queue],
      registry: {
        [jobtype]: async (...args) => {
          resolve(async () => worker.stop());
          called += 1;
        }
      }
    });

    worker.work();
  });
  await stop();
  t.is(called, 1, 'continued fetching after .stop');
});

test('.stop() allows in-progress jobs to finish', async t => {
  const { queue, jobtype } = await push();

  const stop = await new Promise(async (resolve) => {
    const worker = create({
      queues: [queue],
      timeout: 250,
      registry: {
        [jobtype]: async () => {
          resolve(async () => worker.stop());
          await sleep(100);
          t.pass();
        }
      }
    });

    worker.work();
  });
  await stop();
});

test('worker drains pool after stop timeout', async t => {
  const { queue, jobtype } = await push();

  await new Promise(async (resolve) => {
    const worker = create({
      queues: [queue],
      timeout: 0.05,
      registry: {
        [jobtype]: async () => {
          worker.stop();
          await sleep(100);
          t.truthy(worker.clients._draining);
          t.pass();
          resolve();
        }
      }
    });

    worker.work();
  });
});

test('SIGTERM stops the worker', async t => {
  t.plan(1);
  const worker = create();

  await worker.work();

  const originalStop = worker.stop.bind(worker);
  const promise = new Promise((resolve) => {
    worker.stop = () => {
      t.pass();
      originalStop();
      resolve();
    };
  });

  process.kill(process.pid, 'SIGTERM');

  return promise;
});

test('SIGINT stops the worker', async t => {
  t.plan(1);
  const worker = create();

  await worker.work();

  const originalStop = worker.stop.bind(worker);
  const promise = new Promise((resolve) => {
    worker.stop = () => {
      t.pass();
      originalStop();
      resolve();
    };
  });

  process.kill(process.pid, 'SIGINT');

  return promise;
});

test('SIGTSTP quiets the worker', async t => {
  t.plan(1);
  const worker = create();

  await worker.work();

  const originalQuiet = worker.quiet.bind(worker);
  const promise = new Promise((resolve) => {
    worker.quiet = () => {
      t.pass();
      originalQuiet();
      resolve();
    };
  });

  process.kill(process.pid, 'SIGTSTP');

  return promise;
});

test('quiets when the heartbeat response says so', async t => {
  t.plan(1);
  await mocked(async (server, port) => {
    server
      .once('BEAT', mocked.beat('quiet'))
      .on('FETCH', mocked.fetch(null));

    const worker = create({ port });

    const originalQuiet = worker.quiet.bind(worker);
    const promise = new Promise((resolve) => {
      worker.quiet = () => {
        t.pass();
        worker.quiet = originalQuiet;
        worker.stop();
        resolve();
      };
    });

    await worker.beat();
    await promise;
  });
});

test('quiets when the heartbeat response says so', async t => {
  t.plan(1);
  await mocked(async (server, port) => {
    server
      .on('BEAT', mocked.beat('terminate'))
      .on('FETCH', mocked.fetch(null));

    const worker = create({ port });

    const originalStop = worker.stop.bind(worker);
    const promise = new Promise((resolve) => {
      worker.stop = () => {
        t.pass();
        originalStop();
        resolve();
      };
    });

    await worker.beat();
    await promise;
  });
});