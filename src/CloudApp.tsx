import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import IntegratedApp from "./IntegratedApp";
import { cloudError, loadCloud, saveCloud, supabase, type CloudState } from "./cloud";
import { id, initial, today, type Data, type Work } from "./store";

export default function CloudApp() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [state, setState] = useState<CloudState | null>(null);
  const revision = useRef(-1);
  const generation = useRef(0);
  const [mode, setMode] = useState<"login" | "signup" | "forgot" | "recovery">("login");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [local, setLocal] = useState<Data | null>(null);
  const [appKey, setAppKey] = useState(0);
  useEffect(() => {
    try { const raw = localStorage.getItem("engenharia-integrada-v1"); if (raw) { const parsed = JSON.parse(raw); if (parsed.works?.length && Array.isArray(parsed.entries)) setLocal(parsed); } } catch { /* Preserve local data. */ }
    if (!supabase) { setReady(true); return; }
    let live = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, next) => {
      if (!live) return;
      if (event === "PASSWORD_RECOVERY") setMode("recovery");
      setSession(next); setReady(true);
    });
    supabase.auth.getSession().then(({ data, error: authError }) => { if (live) { if (authError) setError(cloudError(authError)); setSession(data.session); setReady(true); } }).catch(e => { if (live) { setError(cloudError(e)); setReady(true); } });
    return () => { live = false; subscription.unsubscribe(); };
  }, []);
  const userId = session?.user.id;
  useEffect(() => {
    const request = ++generation.current;
    setState(null); revision.current = -1; setError(""); setLoadFailed(false);
    if (!userId) { setLoading(false); return; }
    setLoading(true);
    loadCloud().then(result => { if (generation.current === request) { setState(result); revision.current = result?.revision ?? -1; setAppKey(k => k + 1); } }).catch(e => { if (generation.current === request) { setError(cloudError(e)); setLoadFailed(true); } }).finally(() => { if (generation.current === request) setLoading(false); });
    return () => { generation.current++; };
  }, [userId]);
  async function commit(data: Data): Promise<Data> {
    if (!userId) throw new Error("Entre na sua conta para salvar.");
    const active = generation.current;
    const result = await saveCloud(data, revision.current, userId);
    if (active !== generation.current) throw new Error("Sua sessão mudou. Entre novamente para carregar os dados.");
    revision.current = result.revision; setState(result); return result.data;
  }
  async function reload() {
    setLoading(true); setError(""); setLoadFailed(false);
    try { const result = await loadCloud(); revision.current = result?.revision ?? -1; setState(result); setAppKey(k => k + 1); } catch (e) { setError(cloudError(e)); setLoadFailed(true); } finally { setLoading(false); }
  }
  async function signout() { if (supabase) { const { error } = await supabase.auth.signOut(); if (error) setError(cloudError(error)); } }
  async function auth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!supabase || busy) return;
    setBusy(true); setError(""); setNotice("");
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") || "").trim(); const password = String(form.get("password") || "");
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } });
        if (error) throw error;
        if (!data.session) { setNotice("Confira seu e-mail e clique no link de confirmação. Depois volte aqui para entrar. Verifique também o spam."); setMode("login"); }
      } else if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin }); if (error) throw error;
        setNotice("Se o e-mail estiver cadastrado, você receberá um link para redefinir a senha.");
      } else if (mode === "recovery") {
        const { error } = await supabase.auth.updateUser({ password }); if (error) throw error;
        setMode("login"); setNotice("Senha atualizada.");
      } else { const { error } = await supabase.auth.signInWithPassword({ email, password }); if (error) throw error; }
    } catch (e) { setError(cloudError(e)); } finally { setBusy(false); }
  }
  async function start(data: Data) {
    if (busy) return; setBusy(true); setError("");
    try { await commit(data); setAppKey(k => k + 1); } catch (e) { setError(cloudError(e)); } finally { setBusy(false); }
  }
  function firstWork(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const f = new FormData(event.currentTarget); const s = (key: string) => String(f.get(key) || "").trim();
    if (!s("name") || !s("profile") || !s("client")) { setError("Preencha os campos obrigatórios."); return; }
    if (s("end") < s("start")) { setError("O término deve ser igual ou posterior ao início."); return; }
    const work: Work = { id: id(), name: s("name"), client: s("client"), address: s("address"), manager: s("profile"), start: s("start"), end: s("end"), budget: Number(s("budget")), status: "Planejamento" };
    void start({ profile: s("profile"), works: [work], entries: [] });
  }
  if (!ready) return <div className="auth-shell"><p>Verificando sessão…</p></div>;
  if (!supabase) return <div className="auth-shell"><div className="auth-card"><h1>Supabase não configurado</h1><p>Configure as variáveis VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY.</p></div></div>;
  if (!session || mode === "recovery") return <div className="auth-shell"><section className="auth-card"><div className="auth-brand">Engenharia <strong>Integrada</strong></div><h1>{mode === "signup" ? "Crie sua conta" : mode === "forgot" ? "Recuperar senha" : mode === "recovery" ? "Escolha uma nova senha" : "Bem-vindo de volta"}</h1><p>Gestão de obras com seus registros salvos na nuvem.</p><form onSubmit={auth} className="auth-form">{mode !== "recovery" && <label>E-mail<input name="email" type="email" required autoComplete="email" /></label>}{mode !== "forgot" && <label>Senha<input name="password" type="password" required minLength={mode === "login" ? 1 : 8} autoComplete={mode === "login" ? "current-password" : "new-password"} /></label>}{error && <p role="alert" className="form-error">{error}</p>}{notice && <p role="status" className="auth-notice">{notice}</p>}<button className="btn btn-primary" disabled={busy}>{busy ? "Aguarde…" : mode === "signup" ? "Criar conta" : mode === "forgot" ? "Enviar link" : mode === "recovery" ? "Salvar nova senha" : "Entrar"}</button></form><div className="auth-links">{mode === "login" && <button onClick={() => { setMode("forgot"); setError(""); setNotice(""); }}>Esqueci minha senha</button>}{mode !== "recovery" && <button onClick={() => { setMode(mode === "signup" || mode === "forgot" ? "login" : "signup"); setError(""); setNotice(""); }}>{mode === "login" ? "Ainda não tem conta? Cadastre-se" : "Voltar para entrar"}</button>}</div></section></div>;
  if (loading) return <div className="auth-shell"><p>Carregando registros do Supabase…</p></div>;
  if (loadFailed) return <div className="auth-shell"><div className="auth-card"><h1>Não foi possível carregar os dados</h1><p className="form-error" role="alert">{error}</p><button className="btn btn-primary" onClick={() => void reload()}>Tentar novamente</button><button className="btn btn-secondary" onClick={() => void signout()}>Sair</button></div></div>;
  if (!state?.data.works.length) return <div className="auth-shell"><section className="auth-card onboarding"><h1>Vamos cadastrar sua primeira obra</h1><p>Conta: {session.user.email}. Seus registros ficam privados nesta conta.</p><form className="auth-form" onSubmit={firstWork}><label>Seu nome<input name="profile" required maxLength={120} /></label><label>Nome da obra<input name="name" required /></label><label>Cliente<input name="client" required /></label><label>Endereço<input name="address" required /></label><div className="form-grid"><label>Início<input name="start" type="date" defaultValue={today()} required /></label><label>Término<input name="end" type="date" required /></label></div><label>Orçamento de referência (R$)<input name="budget" type="number" min={0} step="0.01" required /></label>{error && <p className="form-error" role="alert">{error}</p>}<button className="btn btn-primary" disabled={busy}>{busy ? "Salvando…" : "Cadastrar obra e começar"}</button></form><div className="onboarding-options">{local && <button className="btn btn-secondary" disabled={busy} onClick={() => void start(local)}>Importar meus registros deste navegador ({local.works.length} obras)</button>}<button className="btn btn-secondary" disabled={busy} onClick={() => void start(initial)}>Começar com dados fictícios de demonstração</button><button className="text-button" disabled={busy} onClick={() => void signout()}>Sair da conta</button></div></section></div>;
  return <IntegratedApp key={`${userId}-${appKey}`} initialData={state.data} onCommit={commit} onReload={() => void reload()} onSignOut={() => void signout()} accountEmail={session.user.email} />;
}
