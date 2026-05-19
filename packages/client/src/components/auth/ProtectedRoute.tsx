import { Navigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div style={{ color: "#64748b", padding: 40, fontFamily: "monospace" }}>Loading...</div>;
  return user ? <>{children}</> : <Navigate to="/auth" replace />;
}
