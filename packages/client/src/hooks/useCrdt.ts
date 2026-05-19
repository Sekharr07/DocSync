import { useRef, useState, useCallback } from "react";
import { RGA, Operation } from "@crdts/crdt-core";

export interface RemoteUser {
  siteId: string;
  username: string;
  color: string;
  cursor?: { line: number; column: number };
}

export function useCrdt() {
  const rgaRef = useRef<RGA | null>(null);
  const [remoteUsers, setRemoteUsers] = useState<Map<string, RemoteUser>>(new Map());

  const init = useCallback((siteId: string, color: string, opLog: Operation[]) => {
    rgaRef.current = RGA.fromOps(siteId, opLog);
  }, []);

  // Returns current RGA text synchronously — no React state involved
  const getText = useCallback((): string => {
    return rgaRef.current?.getText() ?? "";
  }, []);

  // Apply a local insert at flat index, return op to broadcast
  const localInsert = useCallback((index: number, char: string): Operation | null => {
    if (!rgaRef.current) return null;
    return rgaRef.current.localInsert(index, char);
  }, []);

  // Apply a local delete at flat index, return op to broadcast
  const localDelete = useCallback((index: number): Operation | null => {
    if (!rgaRef.current) return null;
    return rgaRef.current.localDelete(index);
  }, []);

  // Apply a remote op, return the new full text
  const applyRemote = useCallback((op: Operation): string | null => {
    if (!rgaRef.current) return null;
    rgaRef.current.applyOperation(op);
    return rgaRef.current.getText();
  }, []);

  const addUser = useCallback((user: RemoteUser) => {
    setRemoteUsers((prev) => new Map(prev).set(user.siteId, user));
  }, []);

  const removeUser = useCallback((siteId: string) => {
    setRemoteUsers((prev) => { const n = new Map(prev); n.delete(siteId); return n; });
  }, []);

  const updateCursor = useCallback((siteId: string, cursor: { line: number; column: number }) => {
    setRemoteUsers((prev) => {
      const u = prev.get(siteId);
      if (!u) return prev;
      return new Map(prev).set(siteId, { ...u, cursor });
    });
  }, []);

  return { rgaRef, getText, localInsert, localDelete, applyRemote, remoteUsers, init, addUser, removeUser, updateCursor };
}
