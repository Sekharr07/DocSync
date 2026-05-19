import { useEffect, useRef, useCallback } from "react";

interface Options {
  roomId: string;
  token: string;
  onMessage: (msg: any) => void;
  onOpen?: () => void;
  onClose?: () => void;
}

export function useWebSocket({ roomId, token, onMessage, onOpen, onClose }: Options) {
  const wsRef = useRef<WebSocket | null>(null);
  const intentionalClose = useRef(false);
  const retryCount = useRef(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onMessageRef = useRef(onMessage);
  const onOpenRef = useRef(onOpen);
  const onCloseRef = useRef(onClose);

  // Keep refs current without re-running the effect
  useEffect(() => { onMessageRef.current = onMessage; }, [onMessage]);
  useEffect(() => { onOpenRef.current = onOpen; }, [onOpen]);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  const connect = useCallback(() => {
    if (intentionalClose.current) return;

    // Clean up any existing connection first
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      wsRef.current.onmessage = null;
      wsRef.current.close();
      wsRef.current = null;
    }

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.hostname;
    const port = "3001";
    const url = `${protocol}//${host}:${port}?roomId=${encodeURIComponent(roomId)}&token=${encodeURIComponent(token)}`;

    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch (err) {
      console.error("[ws] Failed to create WebSocket:", err);
      scheduleRetry();
      return;
    }

    wsRef.current = ws;

    ws.onopen = () => {
      console.log("[ws] Connected");
      retryCount.current = 0; // reset backoff on success
      onOpenRef.current?.();
    };

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        onMessageRef.current(msg);
      } catch (err) {
        console.error("[ws] Failed to parse message:", err);
      }
    };

    ws.onclose = (ev) => {
      console.log(`[ws] Closed — code: ${ev.code}, intentional: ${intentionalClose.current}`);
      onCloseRef.current?.();
      if (!intentionalClose.current) scheduleRetry();
    };

    ws.onerror = (err) => {
      console.error("[ws] Error:", err);
      // onclose fires right after onerror — retry happens there
    };
  }, [roomId, token]);

  const scheduleRetry = useCallback(() => {
    if (intentionalClose.current) return;
    if (retryTimer.current) clearTimeout(retryTimer.current);

    // Exponential backoff: 1s, 2s, 4s, 8s, max 15s
    const delay = Math.min(1000 * Math.pow(2, retryCount.current), 15000);
    retryCount.current++;
    console.log(`[ws] Reconnecting in ${delay}ms (attempt ${retryCount.current})`);
    retryTimer.current = setTimeout(connect, delay);
  }, [connect]);

  useEffect(() => {
    intentionalClose.current = false;
    retryCount.current = 0;
    connect();

    return () => {
      intentionalClose.current = true;
      if (retryTimer.current) clearTimeout(retryTimer.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.onerror = null;
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect]);

  const send = useCallback((msg: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    } else {
      console.warn("[ws] Cannot send — socket not open");
    }
  }, []);

  return { send };
}
