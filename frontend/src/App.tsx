import { useState, useEffect, useCallback } from "react";

// ─── API Client ───────────────────────────────────────────────────────────────
const API = import.meta.env.VITE_API_URL || "http://localhost:3001";

const apiFetch = async (path: string, opts: RequestInit = {}) => {
  const token = localStorage.getItem("token");
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...opts.headers,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Erreur réseau" }));
    throw new Error(err.error || "Erreur");
  }
  return res.json();
};

// ─── Types ────────────────────────────────────────────────────────────────────
interface Lead {
  id: string; fullName: string | null; email: string | null;
  emailValid: boolean | null; jobTitle: string | null;
  company: string | null; companySize: string | null;
  linkedinUrl: string | null; phone: string | null;
}

interface Search {
  id: string; input: string; status: "PENDING" | "DONE" | "FAILED";
  createdAt: string; _count?: { leads: number }; leads?: Lead[];
}

interface Me {
  email: string;
  subscription: { plan: string; status: string; leadsUsed: number; leadsLimit: number; renewsAt: string } | null;
}

// ─── App Shell ────────────────────────────────────────────────────────────────
export default function App() {
  const [token, setToken] = useState(localStorage.getItem("token"));
  const [page, setPage] = useState<"auth" | "dashboard" | "pricing">(token ? "dashboard" : "auth");

  const logout = () => {
    localStorage.removeItem("token");
    setToken(null);
    setPage("auth");
  };

  if (page === "auth") return <AuthPage onLogin={(t) => { setToken(t); setPage("dashboard"); }} />;
  if (page === "pricing") return <PricingPage onBack={() => setPage("dashboard")} />;
  return <Dashboard onLogout={logout} onUpgrade={() => setPage("pricing")} />;
}

// ─── Auth Page ────────────────────────────────────────────────────────────────
function AuthPage({ onLogin }: { onLogin: (token: string) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError(""); setLoading(true);
    try {
      const data = await apiFetch(`/api/auth/${mode}`, {
        method: "POST", body: JSON.stringify({ email, password }),
      });
      localStorage.setItem("token", data.token);
      onLogin(data.token);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0f", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Mono', monospace" }}>
      <div style={{ width: 380, padding: "48px 40px", background: "#111118", border: "1px solid #1e1e2e", borderRadius: 16 }}>
        <div style={{ marginBottom: 32 }}>
          <span style={{ fontSize: 22, fontWeight: 700, color: "#e2e8f0", letterSpacing: "-0.5px" }}>
            ⚡ Lead<span style={{ color: "#6366f1" }}>Pulse</span>
          </span>
          <p style={{ marginTop: 8, color: "#64748b", fontSize: 14 }}>
            {mode === "login" ? "Connexion à ton compte" : "Créer ton compte"}
          </p>
        </div>

        {error && (
          <div style={{ padding: "10px 14px", background: "#2d1b1b", border: "1px solid #7f1d1d", borderRadius: 8, color: "#fca5a5", fontSize: 13, marginBottom: 16 }}>
            {error}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="email@domaine.com"
            style={inputStyle} />
          <input value={password} onChange={e => setPassword(e.target.value)} type="password" placeholder="Mot de passe (8+ chars)"
            onKeyDown={e => e.key === "Enter" && submit()} style={inputStyle} />
          <button onClick={submit} disabled={loading} style={btnPrimary}>
            {loading ? "Chargement…" : mode === "login" ? "Se connecter" : "Créer mon compte"}
          </button>
        </div>

        <p style={{ marginTop: 20, textAlign: "center", fontSize: 13, color: "#475569" }}>
          {mode === "login" ? "Pas encore de compte ? " : "Déjà un compte ? "}
          <button onClick={() => setMode(mode === "login" ? "register" : "login")}
            style={{ background: "none", border: "none", color: "#6366f1", cursor: "pointer", fontSize: 13 }}>
            {mode === "login" ? "S'inscrire" : "Se connecter"}
          </button>
        </p>
      </div>
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
function Dashboard({ onLogout, onUpgrade }: { onLogout: () => void; onUpgrade: () => void }) {
  const [me, setMe] = useState<Me | null>(null);
  const [searches, setSearches] = useState<Search[]>([]);
  const [activeSearch, setActiveSearch] = useState<Search | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [polling, setPolling] = useState<string | null>(null);

  const loadMe = useCallback(async () => {
    try { setMe(await apiFetch("/api/me")); } catch {}
  }, []);

  const loadSearches = useCallback(async () => {
    try { setSearches(await apiFetch("/api/searches")); } catch {}
  }, []);

  useEffect(() => { loadMe(); loadSearches(); }, []);

  // Polling sur la recherche en cours
  useEffect(() => {
    if (!polling) return;
    const interval = setInterval(async () => {
      try {
        const s: Search = await apiFetch(`/api/searches/${polling}`);
        if (s.status !== "PENDING") {
          setActiveSearch(s);
          setPolling(null);
          setLoading(false);
          loadMe();
          loadSearches();
          clearInterval(interval);
        }
      } catch {}
    }, 3000);
    return () => clearInterval(interval);
  }, [polling]);

  const launchSearch = async () => {
    if (!input.trim()) return;
    setError(""); setLoading(true); setActiveSearch(null);
    try {
      const s = await apiFetch("/api/searches", { method: "POST", body: JSON.stringify({ input }) });
      setPolling(s.searchId);
    } catch (e: any) {
      setError(e.message);
      setLoading(false);
    }
  };

  const exportCSV = (searchId: string) => {
    const token = localStorage.getItem("token");
    const a = document.createElement("a");
    a.href = `${API}/api/searches/${searchId}/export`;
    a.click();
  };

  const sub = me?.subscription;
  const usagePct = sub ? Math.min((sub.leadsUsed / sub.leadsLimit) * 100, 100) : 0;

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0f", fontFamily: "'DM Mono', monospace", color: "#e2e8f0" }}>
      {/* Header */}
      <div style={{ borderBottom: "1px solid #1e1e2e", padding: "16px 32px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 20, fontWeight: 700 }}>⚡ Lead<span style={{ color: "#6366f1" }}>Pulse</span></span>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <span style={{ fontSize: 13, color: "#475569" }}>{me?.email}</span>
          <button onClick={onUpgrade} style={{ ...btnSmall, background: "#1e1b4b", color: "#818cf8", border: "1px solid #312e81" }}>Upgrade</button>
          <button onClick={onLogout} style={{ ...btnSmall, background: "transparent", color: "#64748b", border: "1px solid #1e1e2e" }}>Déco</button>
        </div>
      </div>

      <div style={{ maxWidth: 960, margin: "0 auto", padding: "32px 24px" }}>

        {/* Quota bar */}
        {sub && (
          <div style={{ background: "#111118", border: "1px solid #1e1e2e", borderRadius: 12, padding: "20px 24px", marginBottom: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
              <span style={{ fontSize: 13, color: "#94a3b8" }}>
                Quota — <strong style={{ color: "#e2e8f0" }}>{sub.leadsUsed}</strong> / {sub.leadsLimit} leads
              </span>
              <span style={{ fontSize: 12, color: "#475569", textTransform: "uppercase" }}>
                {sub.plan} · {sub.status}
              </span>
            </div>
            <div style={{ height: 6, background: "#1e1e2e", borderRadius: 99 }}>
              <div style={{ height: "100%", width: `${usagePct}%`, background: usagePct > 80 ? "#ef4444" : "#6366f1", borderRadius: 99, transition: "width 0.5s ease" }} />
            </div>
          </div>
        )}

        {!sub && (
          <div style={{ background: "#1e1b4b", border: "1px solid #312e81", borderRadius: 12, padding: "16px 24px", marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 14, color: "#a5b4fc" }}>Tu n'as pas encore d'abonnement actif.</span>
            <button onClick={onUpgrade} style={btnPrimary}>Choisir un plan →</button>
          </div>
        )}

        {/* Search input */}
        <div style={{ display: "flex", gap: 12, marginBottom: 32 }}>
          <input value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && launchSearch()}
            placeholder="acme.com ou linkedin.com/company/acme"
            style={{ ...inputStyle, flex: 1, fontSize: 15 }} />
          <button onClick={launchSearch} disabled={loading || !sub}
            style={{ ...btnPrimary, width: 140, opacity: loading || !sub ? 0.5 : 1 }}>
            {loading ? "Analyse…" : "🔍 Analyser"}
          </button>
        </div>

        {error && (
          <div style={{ padding: "12px 16px", background: "#2d1b1b", border: "1px solid #7f1d1d", borderRadius: 8, color: "#fca5a5", fontSize: 13, marginBottom: 16 }}>
            {error}
          </div>
        )}

        {/* Résultats */}
        {loading && (
          <div style={{ textAlign: "center", padding: "60px 0", color: "#475569" }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
            <p>Extraction en cours… (rafraîchissement auto toutes les 3s)</p>
          </div>
        )}

        {activeSearch?.status === "DONE" && activeSearch.leads && (
          <div style={{ background: "#111118", border: "1px solid #1e1e2e", borderRadius: 12, overflow: "hidden" }}>
            <div style={{ padding: "16px 24px", borderBottom: "1px solid #1e1e2e", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 14, color: "#94a3b8" }}>
                <strong style={{ color: "#e2e8f0" }}>{activeSearch.leads.length}</strong> leads — {activeSearch.input}
              </span>
              <button onClick={() => exportCSV(activeSearch.id)} style={{ ...btnSmall, background: "#14532d", color: "#86efac", border: "1px solid #166534" }}>
                ⬇ Export CSV
              </button>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "#0d0d14" }}>
                    {["Nom", "Email", "✓", "Poste", "Entreprise", "Taille"].map(h => (
                      <th key={h} style={{ padding: "10px 16px", textAlign: "left", color: "#475569", fontWeight: 500, borderBottom: "1px solid #1e1e2e" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {activeSearch.leads.map(lead => (
                    <tr key={lead.id} style={{ borderBottom: "1px solid #13131e" }}>
                      <td style={tdStyle}>{lead.fullName || "—"}</td>
                      <td style={tdStyle}><span style={{ color: "#818cf8" }}>{lead.email || "—"}</span></td>
                      <td style={tdStyle}>{lead.emailValid === null ? "?" : lead.emailValid ? "✅" : "❌"}</td>
                      <td style={tdStyle}>{lead.jobTitle || "—"}</td>
                      <td style={tdStyle}>{lead.company || "—"}</td>
                      <td style={tdStyle}>{lead.companySize || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeSearch?.status === "FAILED" && (
          <div style={{ padding: "20px", background: "#2d1b1b", border: "1px solid #7f1d1d", borderRadius: 12, color: "#fca5a5", textAlign: "center" }}>
            Recherche échouée. Vérifie le domaine saisi et réessaie.
          </div>
        )}

        {/* Historique */}
        {searches.length > 0 && !activeSearch && !loading && (
          <div>
            <h3 style={{ fontSize: 13, color: "#475569", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.08em" }}>Historique</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {searches.map(s => (
                <div key={s.id} onClick={async () => {
                  const full = await apiFetch(`/api/searches/${s.id}`);
                  setActiveSearch(full);
                }} style={{ padding: "12px 16px", background: "#111118", border: "1px solid #1e1e2e", borderRadius: 8, display: "flex", justifyContent: "space-between", cursor: "pointer" }}>
                  <span style={{ color: "#94a3b8", fontSize: 14 }}>{s.input}</span>
                  <span style={{ fontSize: 12, color: s.status === "DONE" ? "#4ade80" : s.status === "FAILED" ? "#f87171" : "#fbbf24" }}>
                    {s.status} {s._count && `· ${s._count.leads} leads`}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Pricing Page ─────────────────────────────────────────────────────────────
function PricingPage({ onBack }: { onBack: () => void }) {
  const checkout = async (plan: "starter" | "pro") => {
    try {
      const { url } = await apiFetch("/api/billing/checkout", {
        method: "POST", body: JSON.stringify({ plan }),
      });
      window.location.href = url;
    } catch (e: any) { alert(e.message); }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0f", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "'DM Mono', monospace", padding: 24 }}>
      <button onClick={onBack} style={{ position: "fixed", top: 24, left: 24, ...btnSmall, background: "transparent", color: "#475569", border: "1px solid #1e1e2e" }}>← Retour</button>

      <h1 style={{ fontSize: 28, fontWeight: 700, color: "#e2e8f0", marginBottom: 8 }}>Choisis ton plan</h1>
      <p style={{ color: "#475569", marginBottom: 48, fontSize: 14 }}>Sans engagement. Annulation en 2 clics.</p>

      <div style={{ display: "flex", gap: 24, flexWrap: "wrap", justifyContent: "center" }}>
        {[
          { plan: "starter" as const, name: "Starter", price: "49€", leads: "500 leads/mois", desc: "Pour les solopreneurs et petites équipes sales." },
          { plan: "pro" as const, name: "Pro", price: "99€", leads: "2 000 leads/mois", desc: "Pour les agences et équipes commerciales actives.", featured: true },
        ].map(({ plan, name, price, leads, desc, featured }) => (
          <div key={plan} style={{ width: 300, padding: "32px 28px", background: featured ? "#1e1b4b" : "#111118", border: `1px solid ${featured ? "#4338ca" : "#1e1e2e"}`, borderRadius: 16 }}>
            {featured && <div style={{ fontSize: 11, color: "#818cf8", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>⭐ Populaire</div>}
            <div style={{ fontSize: 22, fontWeight: 700, color: "#e2e8f0" }}>{name}</div>
            <div style={{ fontSize: 36, fontWeight: 800, color: featured ? "#a5b4fc" : "#6366f1", margin: "12px 0" }}>{price}<span style={{ fontSize: 16, fontWeight: 400, color: "#475569" }}>/mois</span></div>
            <div style={{ fontSize: 14, color: "#94a3b8", marginBottom: 8 }}>✓ {leads}</div>
            <div style={{ fontSize: 13, color: "#475569", marginBottom: 24 }}>{desc}</div>
            <button onClick={() => checkout(plan)} style={{ ...btnPrimary, width: "100%", background: featured ? "#4338ca" : "#1e1b4b" }}>
              Commencer avec {name} →
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Styles utilitaires ───────────────────────────────────────────────────────
const inputStyle: React.CSSProperties = {
  padding: "11px 14px", background: "#0d0d14", border: "1px solid #1e1e2e",
  borderRadius: 8, color: "#e2e8f0", fontSize: 14, outline: "none",
  fontFamily: "'DM Mono', monospace",
};
const btnPrimary: React.CSSProperties = {
  padding: "11px 20px", background: "#4338ca", color: "#fff", border: "none",
  borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 14, fontFamily: "'DM Mono', monospace",
};
const btnSmall: React.CSSProperties = {
  padding: "6px 12px", borderRadius: 6, cursor: "pointer", fontSize: 12, fontFamily: "'DM Mono', monospace", border: "none",
};
const tdStyle: React.CSSProperties = {
  padding: "10px 16px", color: "#94a3b8", whiteSpace: "nowrap",
};
