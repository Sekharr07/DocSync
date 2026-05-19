import React, { useRef, useState, useCallback, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import MonacoEditor from "@monaco-editor/react";
import { editor as monacoEditor } from "monaco-editor";
import { useAuth } from "../../context/AuthContext";
import { useWebSocket } from "../../hooks/useWebSocket";
import { useCrdt } from "../../hooks/useCrdt";
import { useInvites } from "../../hooks/useInvites";
import InviteModal from "./InviteModal";
import { Operation } from "@crdts/crdt-core";
import "./Editor.css";

export default function EditorPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const { user, token, logout } = useAuth();
  const navigate = useNavigate();

  const editorRef = useRef<monacoEditor.IStandaloneCodeEditor | null>(null);
  // Disposable for the content change listener — we remove it before remote edits
  const listenerRef = useRef<monacoEditor.IDisposable | null>(null);
  const sendRef = useRef<((msg: object) => void) | null>(null);

  const [title, setTitle] = useState("Untitled Document");
  const [editingTitle, setEditingTitle] = useState(false);
  const [connected, setConnected] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [remoteUsersList, setRemoteUsersList] = useState<any[]>([]);
  const initializedRoomRef = useRef<string | undefined>(undefined);

  const { getText, localInsert, localDelete, applyRemote, remoteUsers, init, addUser, removeUser, updateCursor } = useCrdt();
  const { sendInvite } = useInvites();

  // Sync remoteUsers map → array for rendering
  useEffect(() => {
    setRemoteUsersList(Array.from(remoteUsers.values()));
  }, [remoteUsers]);

  // ── THE DEFINITIVE FIX ───────────────────────────────────────────────────────
  // Instead of a flag that races with async events, we REMOVE the change
  // listener entirely before writing to Monaco, then RE-ADD it after.
  // This is 100% reliable because there is literally no listener to fire.
  // ────────────────────────────────────────────────────────────────────────────

  const attachListener = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;

    // Remove old listener first to avoid duplicates
    listenerRef.current?.dispose();

    listenerRef.current = editor.onDidChangeModelContent((event) => {
      for (const change of event.changes) {
        const { rangeOffset, rangeLength, text: newText } = change;

        for (let i = 0; i < rangeLength; i++) {
          const op = localDelete(rangeOffset);
          if (op) sendRef.current?.({ type: "operation", operation: op });
        }

        for (let i = 0; i < newText.length; i++) {
          const op = localInsert(rangeOffset + i, newText[i]);
          if (op) sendRef.current?.({ type: "operation", operation: op });
        }
      }
    });
  }, [localDelete, localInsert]);

  const writeToMonaco = useCallback((text: string) => {
    const editor = editorRef.current;
    if (!editor) return;

    // Step 1: Remove the listener — nothing can fire during our write
    listenerRef.current?.dispose();
    listenerRef.current = null;

    // Step 2: Write the new text
    const pos = editor.getPosition();
    editor.setValue(text);
    if (pos) editor.setPosition(pos);

    // Step 3: Re-attach the listener
    attachListener();
  }, [attachListener]);

  const onMessage = useCallback((msg: any) => {
    if (msg.type === "init") {
      init(msg.siteId, msg.color, msg.opLog || []);
      if (msg.title) setTitle(msg.title);
      writeToMonaco(getText());
      (msg.presence || []).forEach((u: any) => addUser(u));
      setInitialized(true);

    } else if (msg.type === "operation") {
      const newText = applyRemote(msg.operation as Operation);
      if (newText !== null) writeToMonaco(newText);

    } else if (msg.type === "presence") {
      if (msg.action === "join") addUser({ siteId: msg.siteId, username: msg.username, color: msg.color });
      else if (msg.action === "leave") removeUser(msg.siteId);

    } else if (msg.type === "cursor") {
      updateCursor(msg.siteId, msg.cursor);

    } else if (msg.type === "title") {
      setTitle(msg.title);
    }
  }, [init, getText, writeToMonaco, applyRemote, addUser, removeUser, updateCursor]);

  const { send } = useWebSocket({
    roomId: roomId!,
    token: token!,
    onMessage,
    onOpen: () => setConnected(true),
    onClose: () => setConnected(false),
  });

  // Keep sendRef current so the listener closure always has the latest send
  useEffect(() => { sendRef.current = send; }, [send]);

  // Reset when roomId changes (navigating between docs)
  useEffect(() => {
    if (initializedRoomRef.current !== roomId) {
      initializedRoomRef.current = roomId;
      setInitialized(false);
      setTitle("Untitled Document");
      setShowInviteModal(false);
      setRemoteUsersList([]);
      writeToMonaco("");
    }
  }, [roomId, writeToMonaco]);

  const handleEditorMount = (editor: monacoEditor.IStandaloneCodeEditor) => {
    editorRef.current = editor;
    attachListener();

    editor.onDidChangeCursorPosition((e) => {
      sendRef.current?.({
        type: "cursor",
        cursor: { line: e.position.lineNumber, column: e.position.column },
      });
    });
  };

  const saveTitle = () => {
    setEditingTitle(false);
    send({ type: "title", title });
  };

  if (!token) { navigate("/auth"); return null; }

  const onlineCount = remoteUsersList.length + 1;

  return (
    <div className="editor-root">
      <header className="editor-header">
        <button className="editor-back" onClick={() => navigate("/")}>← Docs</button>

        <div className="editor-title-wrap">
          {editingTitle ? (
            <input
              className="editor-title-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={saveTitle}
              onKeyDown={(e) => e.key === "Enter" && saveTitle()}
              autoFocus
            />
          ) : (
            <span className="editor-title" onDoubleClick={() => setEditingTitle(true)} title="Double-click to rename">
              {title} <span className="edit-hint">✎</span>
            </span>
          )}
        </div>

        <div className="editor-meta">
          <div className="online-badge">
            <span className={`editor-dot ${connected ? "online" : "offline"}`} />
            <span className="online-text">{connected ? `${onlineCount} online` : "reconnecting"}</span>
          </div>

          <div className="editor-presence">
            {remoteUsersList.map((u) => (
              <div key={u.siteId} className="presence-avatar" style={{ background: u.color }} title={u.username}>
                {u.username[0].toUpperCase()}
              </div>
            ))}
            <div className="presence-avatar presence-me" title={`You — ${user?.username}`}>
              {user?.username?.[0].toUpperCase()}
            </div>
          </div>

          <button className="invite-btn" onClick={() => setShowInviteModal(true)}>＋ Share</button>
          <span className="editor-username">@{user?.username}</span>
          <button className="editor-signout" onClick={logout}>Sign out</button>
        </div>
      </header>

      <div className="editor-body">
        {!initialized && (
          <div className="editor-loading">
            <span className="spinner-lg" />
            <p>Loading document…</p>
          </div>
        )}
        <div style={{ height: "100%", display: initialized ? "block" : "none" }}>
          <MonacoEditor
            height="100%"
            defaultLanguage="plaintext"
            defaultValue=""
            theme="vs-dark"
            onMount={handleEditorMount}
            options={{
              fontSize: 14,
              fontFamily: "'JetBrains Mono', 'Fira Code', 'Courier New', monospace",
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              lineNumbers: "on",
              wordWrap: "on",
              padding: { top: 24, bottom: 24 },
              smoothScrolling: true,
              cursorBlinking: "smooth",
              renderLineHighlight: "gutter",
              quickSuggestions: false,
              suggestOnTriggerCharacters: false,
              acceptSuggestionOnEnter: "off",
              tabCompletion: "off",
              wordBasedSuggestions: "off",
              parameterHints: { enabled: false },
              autoClosingBrackets: "never",
              autoClosingQuotes: "never",
              formatOnType: false,
              formatOnPaste: false,
            }}
          />
        </div>
      </div>

      {showInviteModal && (
        <InviteModal
          roomId={roomId!}
          onSend={(email) => sendInvite(roomId!, email)}
          onClose={() => setShowInviteModal(false)}
        />
      )}
    </div>
  );
}
