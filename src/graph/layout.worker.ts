/// <reference lib="webworker" />

/**
 * Layout worker.
 *
 * Force simulation on a few thousand nodes would block the main thread long
 * enough to drop frames and freeze the UI, so the whole layout pass runs here
 * and the positions come back as a transferable Float32Array.
 */

import { computeLayout } from './layouts';
import type { LayoutRequest, LayoutResult } from './layouts/types';

export interface LayoutWorkerRequest {
  id: number;
  request: LayoutRequest;
}

export interface LayoutWorkerResponse {
  id: number;
  result?: LayoutResult;
  error?: string;
}

self.onmessage = (event: MessageEvent<LayoutWorkerRequest>) => {
  const { id, request } = event.data;
  try {
    const result = computeLayout(request);
    const response: LayoutWorkerResponse = { id, result };
    (self as unknown as Worker).postMessage(response, [result.positions.buffer]);
  } catch (error) {
    const response: LayoutWorkerResponse = {
      id,
      error: error instanceof Error ? error.message : 'Layout failed',
    };
    (self as unknown as Worker).postMessage(response);
  }
};
