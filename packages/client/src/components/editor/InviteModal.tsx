import React, { useState } from "react";
import "./InviteModal.css";

interface Props {
  roomId: string;
  onSend: (email: string) => Promise<string>;
  onClose: () => void;
}

export default function InviteModal({ roomId, onSend, onClose }: Props) {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [copied, setCopied] = useState(false);

  const inviteUrl = `${window.location.origin}/editor/${roomId}`;

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setSending(true);
    setMessage(null);
    try {
      const msg = await onSend(email.trim());
      setMessage({ text: msg, type: "success" });
      setEmail("");
    } catch (err: any) {
      setMessage({ text: err?.response?.data?.error || "Failed to send invite", type: "error" });
    } finally {
      setSending(false);
    }
  };

  const copyLink = () => {
    navigator.clipboard.writeText(inviteUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="im-backdrop" onClick={onClose}>
      <div className="im-modal" onClick={(e) => e.stopPropagation()}>
        <div className="im-header">
          <h2 className="im-title">Share document</h2>
          <button className="im-close" onClick={onClose}>✕</button>
        </div>

        {/* Email invite */}
        <div className="im-section">
          <p className="im-label">Invite by email</p>
          <p className="im-sub">They'll receive an invite in their dashboard when they log in.</p>
          <form onSubmit={handleSend} className="im-form">
            <input
              className="im-input"
              type="email"
              placeholder="colleague@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
            <button className="im-send" type="submit" disabled={sending || !email.trim()}>
              {sending ? <span className="im-spinner" /> : "Send invite"}
            </button>
          </form>
          {message && (
            <p className={`im-msg im-msg-${message.type}`}>{message.text}</p>
          )}
        </div>

        <div className="im-divider"><span>or share link</span></div>

        {/* Copy link */}
        <div className="im-section">
          <p className="im-label">Anyone with the link</p>
          <p className="im-sub">Anyone logged in who opens this link can collaborate.</p>
          <div className="im-link-row">
            <span className="im-link-url">{inviteUrl}</span>
            <button className={`im-copy ${copied ? "copied" : ""}`} onClick={copyLink}>
              {copied ? "✓ Copied!" : "Copy link"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
