/**
 * Web Worker for heavy forensics computations.
 * Prevents main thread blocking during expensive operations.
 */

import { Transaction, ForensicsWorkerMessage, ForensicsWorkerResponse } from '../types';
import {
  getDeepTrace,
  findPathsBetween,
  getTaintAnalysis,
  detectPatterns,
  getAddressClusters,
} from '../utils/analytics';

// Message handler
self.onmessage = (e: MessageEvent<ForensicsWorkerMessage>) => {
  const { type, payload, requestId } = e.data;

  try {
    let result: any;

    switch (type) {
      case 'DEEP_TRACE':
        result = getDeepTrace(payload.transactions, payload.config);
        break;

      case 'FIND_PATHS':
        result = findPathsBetween(
          payload.transactions,
          payload.source,
          payload.target,
          payload.maxDepth,
          payload.maxPaths
        );
        break;

      case 'TAINT_ANALYSIS':
        result = getTaintAnalysis(
          payload.transactions,
          payload.source,
          payload.target,
          payload.maxHops
        );
        break;

      case 'DETECT_PATTERNS':
        result = detectPatterns(payload.transactions);
        break;

      case 'CLUSTER_ADDRESSES':
        result = getAddressClusters(payload.transactions);
        break;

      default:
        throw new Error(`Unknown worker task: ${type}`);
    }

    const response: ForensicsWorkerResponse = {
      type: 'SUCCESS',
      requestId,
      data: result,
    };

    self.postMessage(response);

  } catch (error) {
    const response: ForensicsWorkerResponse = {
      type: 'ERROR',
      requestId,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };

    self.postMessage(response);
  }
};

// Export empty object to make TypeScript happy
export {};
