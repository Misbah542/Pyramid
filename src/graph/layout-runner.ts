/**
 * Schedules layout work off the main thread when the graph is big enough to
 * justify it, and falls back to a synchronous pass when workers are
 * unavailable (or the graph is small enough not to care).
 */

import { computeLayout } from './layouts';
import type { LayoutRequest, LayoutResult } from './layouts/types';
import type { LayoutWorkerRequest, LayoutWorkerResponse } from './layout.worker';

const WORKER_THRESHOLD = 400;

let worker: Worker | null = null;
let workerBroken = false;
let nextRequestId = 1;

const pending = new Map<number, { resolve: (result: LayoutResult) => void; reject: (error: Error) => void }>();

function ensureWorker(): Worker | null {
  if (workerBroken) return null;
  if (worker) return worker;
  if (typeof Worker === 'undefined') {
    workerBroken = true;
    return null;
  }
  try {
    worker = new Worker(new URL('./layout.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<LayoutWorkerResponse>) => {
      const entry = pending.get(event.data.id);
      if (!entry) return;
      pending.delete(event.data.id);
      if (event.data.result) entry.resolve(event.data.result);
      else entry.reject(new Error(event.data.error ?? 'Layout failed'));
    };
    worker.onerror = () => {
      workerBroken = true;
      for (const entry of pending.values()) entry.reject(new Error('Layout worker crashed'));
      pending.clear();
      worker?.terminate();
      worker = null;
    };
    return worker;
  } catch {
    workerBroken = true;
    return null;
  }
}

export async function runLayout(request: LayoutRequest): Promise<LayoutResult> {
  if (request.nodes.length < WORKER_THRESHOLD) {
    return computeLayout(request);
  }

  const instance = ensureWorker();
  if (!instance) return computeLayout(request);

  const id = nextRequestId;
  nextRequestId += 1;

  return new Promise<LayoutResult>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    const message: LayoutWorkerRequest = { id, request };
    instance.postMessage(message);
  }).catch(() => computeLayout(request));
}

export function disposeLayoutWorker(): void {
  worker?.terminate();
  worker = null;
  pending.clear();
}
