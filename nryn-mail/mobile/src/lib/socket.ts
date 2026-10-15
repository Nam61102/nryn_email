import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';

import { API_URL, tokenStore } from './api';

type Handlers = {
  onSynced?: (p: { count: number }) => void;
  onNewInsight?: (p: {
    emailId: string;
    priority: string;
    fromName: string;
    subject: string;
    insight: string;
  }) => void;
  onReplySent?: (p: { emailId: string }) => void;
};

/**
 * The backend authenticates the handshake from the token and joins the socket
 * to a room named after the user id, so these events are per-user — never a
 * global broadcast, which would leak one user's mail metadata to every client.
 */
export function useLiveUpdates(enabled: boolean, handlers: Handlers) {
  const socketRef = useRef<Socket | null>(null);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let socket: Socket | null = null;

    (async () => {
      const token = await tokenStore.get();
      if (!token || cancelled) return;

      socket = io(API_URL, {
        transports: ['websocket'], // RN has no reliable long-polling fallback
        auth: { token },
        reconnectionDelay: 2000,
      });
      socketRef.current = socket;

      socket.on('email:synced', (p) => handlersRef.current.onSynced?.(p));
      socket.on('email:new_insight', (p) => handlersRef.current.onNewInsight?.(p));
      socket.on('email:reply_sent', (p) => handlersRef.current.onReplySent?.(p));
    })();

    return () => {
      cancelled = true;
      if (socket) {
        socket.removeAllListeners();
        socket.disconnect();
      }
      socketRef.current = null;
    };
  }, [enabled]);

  return socketRef;
}
