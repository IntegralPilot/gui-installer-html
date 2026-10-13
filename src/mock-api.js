import { readJSON } from './i18n.js';

const stages = [
  { name: 'preparing', seconds: 3, log: 'Preparing installation' },
  { name: 'resizing', seconds: 5, log: 'Resizing storage' },
  { name: 'writing', seconds: 13, log: 'Writing system files' },
  { name: 'finalising', seconds: 4, log: 'Preparing the next step' },
];
const jobs = new Map();

export async function mockJSON(path, options = {}) {
  options.signal?.throwIfAborted();
  const url = new URL(path, location.href);
  const method = options.method || 'GET';

  if (url.pathname === '/api/telemetry.json' && method === 'GET') {
    return readJSON(path, options);
  }

  if (url.pathname === '/api/install' && method === 'POST') {
    const selection = JSON.parse(options.body);
    let job = jobs.get(selection.id);
    if (job && job.request !== options.body) {
      throw new Error('Installation ID already used');
    }
    if (!job) {
      const disk = await readJSON('/api/partitions.json', {
        cache: 'no-store',
        signal: options.signal,
      });
      const target = disk.partitions.find((p) => p.id === selection.target);
      if (disk.id !== selection.disk || !target?.allocation) {
        throw new Error('Invalid installation location');
      }
      job = {
        request: options.body,
        started: performance.now(),
        stages: stages.filter(
          (stage) => stage.name !== 'resizing' || target.kind === 'apfs',
        ),
      };
      jobs.set(selection.id, job);
    }
    return { id: selection.id };
  }

  if (url.pathname === '/api/progress.json' && method === 'GET') {
    const id = url.searchParams.get('id');
    const job = jobs.get(id);
    if (!job) throw new Error('Unknown installation');

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
    job.complete = complete;
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
    if (!job?.complete || typeof shareAnonymousStatistics !== 'boolean') {
      throw new Error(
        'A completed installation and statistics choice are required',
      );
    }
    if (
      job.shutdown !== undefined &&
      job.shutdown !== shareAnonymousStatistics
    ) {
      throw new Error('Statistics choice already submitted');
    }
    job.shutdown = shareAnonymousStatistics;
    return { id, status: 'preview' };
  }

  throw new Error(`No preview response for ${method} ${url.pathname}`);
}
