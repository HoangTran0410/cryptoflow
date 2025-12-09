import { useEffect, useRef, useCallback, useState } from "react";
import { ForensicsWorkerMessage, ForensicsWorkerResponse } from "../types";

/**
 * React hook to manage Web Worker for forensics computations
 * Provides Promise-based API for executing heavy tasks without blocking UI
 */
export const useForensicsWorker = () => {
  const [isReady, setIsReady] = useState(false);
  const workerRef = useRef<Worker | null>(null);
  const pendingRequests = useRef<Map<string, (data: any) => void>>(new Map());

  useEffect(() => {
    // Initialize worker
    try {
      workerRef.current = new Worker(
        new URL("../workers/forensics.worker.ts", import.meta.url),
        { type: "module" }
      );

      setIsReady(true);

      workerRef.current.onmessage = (
        e: MessageEvent<ForensicsWorkerResponse>
      ) => {
        const { type, requestId, data, error } = e.data;

        const resolver = pendingRequests.current.get(requestId);
        if (!resolver) return;

        if (type === "SUCCESS") {
          resolver(data);
        } else if (type === "ERROR") {
          console.error("Forensics Worker error:", error);
          resolver(null);
        }

        pendingRequests.current.delete(requestId);
      };

      workerRef.current.onerror = (error) => {
        console.error("Worker error:", error);
      };
    } catch (error) {
      console.error("Failed to initialize forensics worker:", error);
    }

    return () => {
      workerRef.current?.terminate();
      pendingRequests.current.clear();
    };
  }, []);

  const executeTask = useCallback(
    <T>(message: Omit<ForensicsWorkerMessage, "requestId">): Promise<T> => {
      return new Promise((resolve) => {
        if (!workerRef.current) {
          console.warn("Worker not initialized, returning null");
          resolve(null as T);
          return;
        }

        const requestId = `req_${Date.now()}_${Math.random()
          .toString(36)
          .substr(2, 9)}`;
        pendingRequests.current.set(requestId, resolve);

        const workerMessage: ForensicsWorkerMessage = {
          ...message,
          requestId,
        };

        workerRef.current.postMessage(workerMessage);
      });
    },
    []
  );

  // const isReady = workerRef.current !== null;

  return { executeTask, isReady };
};
