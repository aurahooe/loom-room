'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase, hourKey } from '../lib/supabase';

const FALLBACKS = [
  { title: 'Warp and weft', kicker: 'The hour turns', body: 'Someone left the window open. The threads on the wall rearrange themselves. Write something and pin it if you want the room to keep it.' },
  { title: 'A quiet press', kicker: 'Edition', body: 'Nothing grand. Just the next hour, set down in type. Public threads hang here. Private ones stay in your drawer.' },
  { title: 'Copper hour', kicker: 'From the desk', body: 'The masthead is rewritten every sixty minutes. If a public thread is waiting, it may take the featured slot.' },
  { title: 'Left on the rail', kicker: 'Open room', body: 'Come back later and the kicker will have changed. That is the only promise this room makes.' },
];

function pickFallback(key) {
  let n = 0;
  for (let i = 0; i < key.length; i++) n = (n + key.charCodeAt(i) * (i + 3)) % 997;
  return FALLBACKS[n % FALLBACKS.length];
}

export default function Page() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [hour, setHour] = useState(null);
  const [publicThreads, setPublic] = useState([]);
  const [mine, setMine] = useState([]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [handle, setHandle] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [now, setNow] = useState(() => new Date());
  const key = useMemo(() => hourKey(now), [now]);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session || null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) { setProfile(null); setMine([]); return; }
    (async () => {
      const { data: p } = await supabase.from('loom_profiles').select('*').eq('id', session.user.id).maybeSingle();
      setProfile(p || null);
      const { data: rows } = await supabase.from('loom_threads').select('*').eq('author_id', session.user.id).order('created_at', { ascending: false });
      setMine(rows || []);
    })();
  }, [session]);

  useEffect(() => {
    (async () => {
      const { data: h } = await supabase.from('loom_hours').select('*').eq('hour_key', key).maybeSingle();
      if (h) setHour(h);
      else {
        const fb = pickFallback(key);
        const { data: pub } = await supabase.from('loom_threads').select('id').eq('is_public', true).order('created_at', { ascending: false }).limit(1);
        const row = { hour_key: key, title: fb.title, kicker: fb.kicker, body: fb.body, featured_id: pub?.[0]?.id || null };
        await supabase.from('loom_hours').insert(row);
        setHour(row);
      }
      const { data: wall } = await supabase.from('loom_threads').select('*').eq('is_public', true).order('created_at', { ascending: false }).limit(40);
      setPublic(wall || []);
    })();
  }, [key]);

  async function signUp(e) {
    e.preventDefault(); setErr(''); setMsg('');
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) return setErr(error.message);
    if (data.user) {
      const h = handle.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 24) || 'guest' + data.user.id.slice(0, 4);
      await supabase.from('loom_profiles').insert({ id: data.user.id, handle: h, display_name: h });
    }
    setMsg(data.session ? 'Signed in.' : 'Check your email to confirm, then sign in.');
  }

  async function signIn(e) {
    e.preventDefault(); setErr('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setErr(error.message);
  }

  async function saveProfile(e) {
    e.preventDefault(); setErr('');
    const h = handle.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 24);
    if (!h) return setErr('Need a handle.');
    const { error } = await supabase.from('loom_profiles').upsert({ id: session.user.id, handle: h, display_name: h });
    if (error) setErr(error.message);
    else setProfile({ id: session.user.id, handle: h, display_name: h });
  }

  async function publish(e) {
    e.preventDefault(); setErr(''); setMsg('');
    if (!title.trim() || !body.trim()) return setErr('Title and body, please.');
    const { error } = await supabase.from('loom_threads').insert({
      author_id: session.user.id,
      title: title.trim(),
      body: body.trim(),
      is_public: isPublic,
    });
    if (error) return setErr(error.message);
    setTitle(''); setBody(''); setMsg(isPublic ? 'On the wall.' : 'Saved in your drawer.');
    const { data: rows } = await supabase.from('loom_threads').select('*').eq('author_id', session.user.id).order('created_at', { ascending: false });
    setMine(rows || []);
    if (isPublic) {
      const { data: wall } = await supabase.from('loom_threads').select('*').eq('is_public', true).order('created_at', { ascending: false }).limit(40);
      setPublic(wall || []);
    }
  }

  async function togglePublic(row) {
    await supabase.from('loom_threads').update({ is_public: !row.is_public, updated_at: new Date().toISOString() }).eq('id', row.id);
    const { data: rows } = await supabase.from('loom_threads').select('*').eq('author_id', session.user.id).order('created_at', { ascending: false });
    setMine(rows || []);
    const { data: wall } = await supabase.from('loom_threads').select('*').eq('is_public', true).order('created_at', { ascending: false }).limit(40);
    setPublic(wall || []);
  }

  const featured = publicThreads.find((t) => t.id === hour?.featured_id);

  return (
    <div className="wrap">
      <header className="top">
        <div className="mark">Loom <em>Room</em></div>
        <div className="clock">{now.toUTCString().slice(0, 22)} · hour {key.slice(11, 13)}</div>
      </header>
      <div className="loom-line" />
      <section className="mast">
        <div>
          <div className="kicker">{hour?.kicker || 'This hour'}</div>
          <h1 className="ed">{hour?.title || 'The room is waking'}</h1>
          <p className="ed-body">{hour?.body}</p>
          {featured && (
            <p className="ed-body" style={{ marginTop: 16 }}>
              <em>On the hook: {featured.title}</em>
            </p>
          )}
        </div>
        <aside className="hour-card">
          <small>Next turn</small>
          <strong>{60 - now.getUTCMinutes()} min</strong>
          <p style={{ margin: '10px 0 0', fontSize: 13, color: 'var(--mute)' }}>
            The masthead is rewritten on the hour. Public threads stay on the wall until you take them down.
          </p>
        </aside>
      </section>
      <div className="grid">
        <section>
          <h2>The wall</h2>
          {publicThreads.length === 0 && <p className="meta">Nothing public yet. Pin a thread.</p>}
          {publicThreads.map((t) => (
            <article className="thread" key={t.id}>
              <h3>{t.title}</h3>
              <div className="meta">{new Date(t.created_at).toUTCString().slice(5, 22)}</div>
              <p>{t.body}</p>
            </article>
          ))}
        </section>
        <aside>
          {!session && (
            <>
              <h2>The desk</h2>
              <form className="auth" onSubmit={signIn}>
                <input type="email" placeholder="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                <input type="password" placeholder="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
                <input placeholder="handle (for new accounts)" value={handle} onChange={(e) => setHandle(e.target.value)} />
                <row>
                  <button type="submit">Sign in</button>
                  <button type="button" className="ghost" onClick={signUp}>Create desk</button>
                </row>
              </form>
            </>
          )}
          {session && !profile && (
            <form className="desk" onSubmit={saveProfile}>
              <h2>Claim a handle</h2>
              <input placeholder="handle" value={handle} onChange={(e) => setHandle(e.target.value)} />
              <button type="submit">Save</button>
            </form>
          )}
          {session && profile && (
            <>
              <h2>Your drawer</h2>
              <p className="meta">Signed in as @{profile.handle}</p>
              <form className="desk" onSubmit={publish}>
                <input placeholder="title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} />
                <textarea placeholder="write…" value={body} onChange={(e) => setBody(e.target.value)} maxLength={8000} />
                <label className="check">
                  <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />
                  Mark public — hangs on the wall
                </label>
                <row>
                  <button type="submit">Save thread</button>
                  <button type="button" className="ghost" onClick={() => supabase.auth.signOut()}>Leave</button>
                </row>
              </form>
              {mine.map((t) => (
                <article className="thread" key={t.id}>
                  <h3>{t.title}</h3>
                  <div className="meta">{t.is_public ? 'on the wall' : 'private'} · {new Date(t.created_at).toUTCString().slice(5, 16)}</div>
                  <p>{t.body}</p>
                  <button className="ghost" style={{ marginTop: 8 }} onClick={() => togglePublic(t)}>
                    {t.is_public ? 'Pull from wall' : 'Pin to wall'}
                  </button>
                </article>
              ))}
            </>
          )}
          {err && <p className="err">{err}</p>}
          {msg && <p className="ok">{msg}</p>}
        </aside>
      </div>
    </div>
  );
}
