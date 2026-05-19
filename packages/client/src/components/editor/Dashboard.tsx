import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth, API } from "../../context/AuthContext";
import { useInvites } from "../../hooks/useInvites";
import InvitePanel from "./InvitePanel";
import "./Dashboard.css";

interface Doc {
  roomId: string;
  title: string;
  updatedAt: string;
  owner: { _id: string; username: string };
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

export default function Dashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const { incoming, loading: invitesLoading, accept, reject } = useInvites();

  const fetchDocs = useCallback(async () => {
    try {
      const r = await API.get("/documents");
      setDocs(r.data.documents ?? []);
    } catch (err) {
      console.error("[dashboard] fetchDocs", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchDocs(); }, [fetchDocs]);

  const handleAccept = async (id: string) => {
    const roomId = await accept(id);
    await fetchDocs();
    if (roomId) navigate(`/editor/${roomId}`);
  };

  const handleReject = async (id: string) => {
    await reject(id);
  };

  const createDoc = async () => {
    setCreating(true);
    try {
      const r = await API.post("/documents", { title: "Untitled Document" });
      navigate(`/editor/${r.data.document.roomId}`);
    } catch (err) {
      console.error(err);
      setCreating(false);
    }
  };

  // FIX: stopPropagation on the wrapper div + use onPointerDown to beat the card click
  const handleCopyLink = (roomId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const url = `${window.location.origin}/editor/${roomId}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedId(roomId);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  const handleDeleteClick = (roomId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setActionMessage(null);
    setDeleteConfirm(roomId);
  };

  const confirmDelete = async (roomId: string) => {
    setDeleteConfirm(null);
    try {
      await API.delete(`/documents/${roomId}`);
      setDocs((d) => d.filter((doc) => doc.roomId !== roomId));
      setActionMessage("Document deleted.");
    } catch (err) {
      const status = (err as any)?.response?.status;
      if (status === 403) {
        setActionMessage("You can only delete documents you own.");
      } else {
        setActionMessage("Failed to delete document.");
      }
      console.error("[dashboard] delete", err);
    }
  };

  return (
    <div className="dash-root" onClick={() => setDeleteConfirm(null)}>
      {/* Delete confirmation overlay */}
      {deleteConfirm && (
        <div className="dash-confirm-backdrop" onClick={() => setDeleteConfirm(null)}>
          <div className="dash-confirm" onClick={(e) => e.stopPropagation()}>
            <p className="dash-confirm-title">Delete document?</p>
            <p className="dash-confirm-sub">This cannot be undone.</p>
            <div className="dash-confirm-btns">
              <button className="dash-confirm-cancel" onClick={() => setDeleteConfirm(null)}>Cancel</button>
              <button className="dash-confirm-delete" onClick={() => confirmDelete(deleteConfirm)}>Delete</button>
            </div>
          </div>
        </div>
      )}

      <header className="dash-header">
        <div className="dash-brand">
          <span className="dash-brand-icon">⌘</span>
          <span className="dash-brand-text">doc<em>sync</em></span>
        </div>
        <div className="dash-header-right">
          <div className="dash-user-pill">
            <div className="dash-avatar">{user?.username?.[0].toUpperCase()}</div>
            <span className="dash-username">@{user?.username}</span>
          </div>
          {incoming.length > 0 && (
            <div className="dash-notif-badge">
              🔔 <span>{incoming.length}</span>
            </div>
          )}
          <button className="dash-logout" onClick={logout}>Sign out</button>
        </div>
      </header>

      <main className="dash-main">
        {actionMessage && <p className="dash-action-message">{actionMessage}</p>}

        <InvitePanel
          invites={incoming}
          loading={invitesLoading}
          onAccept={handleAccept}
          onReject={handleReject}
        />

        <div className="dash-top">
          <div>
            <h1 className="dash-heading">Your Documents</h1>
            <p className="dash-subheading">{docs.length} document{docs.length !== 1 ? "s" : ""}</p>
          </div>
          <button className="dash-create" onClick={createDoc} disabled={creating}>
            {creating ? <span className="spinner-sm" /> : <><span className="dash-create-plus">＋</span> New Document</>}
          </button>
        </div>

        {loading ? (
          <div className="dash-empty"><span className="spinner-lg" /></div>
        ) : docs.length === 0 ? (
          <div className="dash-empty">
            <div className="dash-empty-icon">📄</div>
            <p className="dash-empty-title">No documents yet</p>
            <p className="dash-empty-sub">Create your first document to get started</p>
            <button className="dash-create" onClick={createDoc}>＋ Create Document</button>
          </div>
        ) : (
          <div className="dash-grid">
            {docs.map((doc) => (
              (() => {
                const isOwner = String(doc.owner?._id ?? "") === String(user?.id ?? "");

                return (
              <div
                key={doc.roomId}
                className="dash-card"
                onClick={() => navigate(`/editor/${doc.roomId}`)}
              >
                <div className="dash-card-icon">📝</div>
                <div className="dash-card-body">
                  <h3 className="dash-card-title">{doc.title}</h3>
                  <p className="dash-card-meta">
                    <span className="dash-card-owner">by {doc.owner?.username}</span>
                    <span className="dash-card-dot">·</span>
                    <span>{timeAgo(doc.updatedAt)}</span>
                  </p>
                </div>

                {/* FIX: Isolated action zone — pointer events stopped here */}
                <div
                  className="dash-card-actions"
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <button
                    className={`dash-card-action ${copiedId === doc.roomId ? "copied" : ""}`}
                    onClick={(e) => handleCopyLink(doc.roomId, e)}
                    title="Copy share link"
                  >
                    {copiedId === doc.roomId ? "✓" : "⎘"}
                  </button>
                  {isOwner && (
                    <button
                      className="dash-card-action danger"
                      onClick={(e) => handleDeleteClick(doc.roomId, e)}
                      title="Delete document"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
                );
              })()
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
