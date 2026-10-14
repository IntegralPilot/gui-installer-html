import { readJSON } from './i18n.js';

const stages = [
  { name: 'preparing', seconds: 3, log: 'Preparing installation' },
  { name: 'resizing', seconds: 5, log: 'Resizing storage' },
  { name: 'writing', seconds: 13, log: 'Writing system files' },
  { name: 'finalising', seconds: 4, log: 'Preparing the next step' },
];
const jobs = new Map();
let pending;

function fail(status, message) {
  throw Object.assign(new Error(message), { status });
}

function running(job) {
  const seconds = job.stages.reduce((sum, stage) => sum + stage.seconds, 0);
  return performance.now() < job.started + seconds * 1000;
}

async function createJob(selection, options) {
  const readOptions = { cache: 'no-store', signal: options.signal };
  const [disk, required] = await Promise.all([
    mockJSON('/api/partitions', readOptions),
    mockJSON(
      `/api/edition/${encodeURIComponent(selection.edition)}/size`,
      readOptions,
    ),
  ]);
  const target = disk.partitions.find((part) => part.id === selection.target);
  if (!target || !['free', 'apfs'].includes(target.kind)) {
    fail(422, 'Invalid installation location');
  }
  const maxGB = target.kind === 'free' ? target.sizeGB : target.maxGB;
  if (
    !Number.isFinite(selection.sizeGB) ||
    !Number.isFinite(maxGB) ||
    selection.sizeGB < required.minGB ||
    selection.sizeGB > maxGB
  ) {
    fail(422, 'Invalid installation size');
  }
  return {
    started: performance.now(),
    stages: stages.filter(
      (stage) => stage.name !== 'resizing' || target.kind === 'apfs',
    ),
  };
}

export async function mockJSON(path, options = {}) {
  options.signal?.throwIfAborted();
  const url = new URL(path, location.href);
  const method = options.method || 'GET';

  if (
    method === 'GET' &&
    (['/api/info', '/api/partitions', '/api/telemetry'].includes(url.pathname) ||
      /^\/api\/edition\/[^/]+\/size$/.test(url.pathname))
  ) {
    url.pathname += '.json';
    return readJSON(url, options);
  }

  if (url.pathname === '/api/install' && method === 'POST') {
    const selection = JSON.parse(options.body);
    if (jobs.has(selection.id)) return;
    if (pending) {
      if (pending.id !== selection.id) {
        fail(409, 'Another installation is running');
      }
      await pending.promise;
      return;
    }
    if ([...jobs.values()].some(running)) {
      fail(409, 'Another installation is running');
    }
    pending = { id: selection.id, promise: createJob(selection, options) };
    try {
      jobs.set(selection.id, await pending.promise);
      return { id: selection.id };
    } finally {
      pending = undefined;
    }
  }

  if (url.pathname === '/api/progress' && method === 'GET') {
    const id = url.searchParams.get('id');
    const job = jobs.get(id);
    if (!job) fail(404, 'Unknown installation');

    const elapsed = (performance.now() - job.started) / 1000;
    const duration = job.stages.reduce((sum, stage) => sum + stage.seconds, 0);
    let boundary = 0;
    let step = 0;
    const log = ['This is a preview.'];
    for (const stage of job.stages) {
      step++;
      boundary += stage.seconds;
      log.push(stage.log);
      if (elapsed < boundary) break;
    }
    const complete = elapsed >= duration;
    if (complete) log.push('Preview complete.');
    return {
      id,
      status: complete ? 'complete' : 'running',
      stage: job.stages[step - 1].name,
      percent: Math.min(100, Math.floor((elapsed / duration) * 100)),
      step,
      total: job.stages.length,
      log: log.join('\n'),
    };
  }

  if (url.pathname === '/api/shutdown' && method === 'POST') {
    const { id, shareAnonymousStatistics } = JSON.parse(options.body);
    const job = jobs.get(id);
    if (!job) fail(404, 'Unknown installation');
    if (running(job)) fail(409, 'Installation is still running');
    if (typeof shareAnonymousStatistics !== 'boolean') {
      fail(400, 'A statistics choice is required');
    }
    if (
      job.shutdown !== undefined &&
      job.shutdown !== shareAnonymousStatistics
    ) {
      fail(409, 'Statistics choice already submitted');
    }
    job.shutdown = shareAnonymousStatistics;
    return { id, status: 'shutting-down' };
  }

  throw new Error(`No preview response for ${method} ${url.pathname}`);
}
