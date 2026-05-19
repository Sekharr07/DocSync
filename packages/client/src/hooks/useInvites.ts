import { useState, useEffect, useCallback } from "react";
import { API } from "../context/AuthContext";

export interface Invite {
  _id: string;
  roomId: string;
  documentTitle: string;
  invitedBy: { username: string; email: string };
  invitedEmail: string;
  status: "pending" | "accepted" | "rejected";
  createdAt: string;
}

export function useInvites() {
  const [incoming, setIncoming] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchIncoming = useCallback(async () => {
    try {
      const r = await API.get("/invites/incoming");
      setIncoming(r.data.invites ?? []);
    } catch (err: any) {
      // Don't crash if invites endpoint fails — just show empty
      console.error("[invites fetch]", err?.response?.data || err.message);
      setIncoming([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchIncoming();
    const timer = setInterval(fetchIncoming, 30000);
    return () => clearInterval(timer);
  }, [fetchIncoming]);

  // Returns roomId on success so caller can navigate
  const accept = useCallback(async (inviteId: string): Promise<string | null> => {
    try {
      const r = await API.post(`/invites/${inviteId}/accept`);
      setIncoming((prev) => prev.filter((i) => i._id !== inviteId));
      return r.data.roomId ?? null;
    } catch (err: any) {
      console.error("[invite accept]", err?.response?.data || err.message);
      throw new Error(err?.response?.data?.error || "Failed to accept invite");
    }
  }, []);

  const reject = useCallback(async (inviteId: string): Promise<void> => {
    try {
      await API.post(`/invites/${inviteId}/reject`);
      setIncoming((prev) => prev.filter((i) => i._id !== inviteId));
    } catch (err: any) {
      console.error("[invite reject]", err?.response?.data || err.message);
      throw new Error(err?.response?.data?.error || "Failed to decline invite");
    }
  }, []);

  const sendInvite = useCallback(async (roomId: string, email: string): Promise<string> => {
    const r = await API.post("/invites", { roomId, email });
    return r.data.message;
  }, []);

  return { incoming, loading, accept, reject, sendInvite, refetch: fetchIncoming };
}
