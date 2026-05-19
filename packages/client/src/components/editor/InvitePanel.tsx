import React from "react";
import { Invite } from "../../hooks/useInvites";
import "./InvitePanel.css";

interface Props {
  invites: Invite[];
  loading: boolean;
  onAccept: (id: string) => Promise<void>;
  onReject: (id: string) => Promise<void>;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function InvitePanel({ invites, loading, onAccept, onReject }: Props) {
  const [responding, setResponding] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const handle = async (id: string, action: "accept" | "reject") => {
    setResponding(id);
    setError(null);
    try {
      if (action === "accept") {
        await onAccept(id);
        // Navigation + doc refetch is handled by Dashboard.handleAccept
      } else {
        await onReject(id);
      }
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setResponding(null);
    }
  };

  if (loading || invites.length === 0) return null;

  return (
    <div className="ip-root">
      <div className="ip-heading">
        <span className="ip-bell">🔔</span>
        <h2 className="ip-title">Pending Invites</h2>
        <span className="ip-badge">{invites.length}</span>
      </div>

      {error && <p className="ip-error">{error}</p>}

      <div className="ip-list">
        {invites.map((invite) => (
          <div key={invite._id} className="ip-card">
            <div className="ip-card-icon">📄</div>
            <div className="ip-card-body">
              <p className="ip-card-doc">"{invite.documentTitle}"</p>
              <p className="ip-card-meta">
                invited by <strong>@{invite.invitedBy?.username ?? "someone"}</strong>
                <span className="ip-card-dot">·</span>
                {timeAgo(invite.createdAt)}
              </p>
            </div>
            <div className="ip-card-actions">
              <button
                className="ip-btn ip-btn-accept"
                onClick={() => handle(invite._id, "accept")}
                disabled={responding !== null}
              >
                {responding === invite._id ? <span className="ip-spinner" /> : "Accept"}
              </button>
              <button
                className="ip-btn ip-btn-reject"
                onClick={() => handle(invite._id, "reject")}
                disabled={responding !== null}
              >
                Decline
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
