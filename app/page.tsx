"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Team = "white" | "black" | "sub";

type Row = {
  id: number;
  created_at: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  team: Team;
  cancel_code: string;
  status: "active" | "cancelled";
};

const STORAGE_KEY = "hokejpwg_player";

function code(len = 8) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function shortName(r: Row) {
  const ln = (r.last_name || "").trim();
  return `${r.first_name} ${ln ? ln.slice(0, 1) + "." : ""}`.trim();
}

export default function Page() {
  const maxPerTeam = 6;
  const maxTotal = 12;

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);
  const [msg, setMsg] = useState<string>("");

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [teamPick, setTeamPick] = useState<"white" | "black">("white");
  const [remember, setRemember] = useState(true);

  // auto-predvyplnenie
  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      const s = JSON.parse(raw);
      setFirstName(s.firstName || "");
      setLastName(s.lastName || "");
      setEmail(s.email || "");
      setPhone(s.phone || "");
      setTeamPick(s.teamPick === "black" ? "black" : "white");
      setRemember(s.remember !== false);
    } catch {}
  }, []);

  async function load() {
    setLoading(true);
    setMsg("");
    const { data, error } = await supabase
      .from("registrations")
      .select("*")
      .eq("status", "active")
      .order("created_at", { ascending: true });

    if (error) {
      setMsg("Chyba: neviem načítať zoznam (skontroluj RLS policies SELECT/INSERT).");
      setLoading(false);
      return;
    }
    setRows((data as Row[]) || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, []);

  const { white, black, subs } = useMemo(() => {
    // hlavná zostava = prvých 12 podľa času
    const all = rows.slice(0);
    const main = all.slice(0, maxTotal);
    const rest = all.slice(maxTotal);

    const mainW = main.filter((x) => x.team === "white").slice(0, maxPerTeam);
    const mainB = main.filter((x) => x.team === "black").slice(0, maxPerTeam);

    const overflowW = main.filter((x) => x.team === "white").slice(maxPerTeam);
    const overflowB = main.filter((x) => x.team === "black").slice(maxPerTeam);

    return {
      white: mainW,
      black: mainB,
      subs: [...overflowW, ...overflowB, ...rest],
    };
  }, [rows]);

  const counts = {
    white: white.length,
    black: black.length,
    total: white.length + black.length,
  };

  async function signUp() {
    setMsg("");

    const fn = firstName.trim();
    const ln = lastName.trim();
    const em = email.trim().toLowerCase();

    if (!fn || !ln || !em) {
      setMsg("Doplň meno, priezvisko a email.");
      return;
    }

    // zapamätať
    if (remember) {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ firstName: fn, lastName: ln, email: em, phone, teamPick, remember })
      );
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }

    // ak tím plný, ide ako náhradník
    const targetTeam: Team =
      teamPick === "white"
        ? counts.white < maxPerTeam
          ? "white"
          : "sub"
        : counts.black < maxPerTeam
        ? "black"
        : "sub";

    const cancelCode = code(8);

    const { error } = await supabase.from("registrations").insert([
      {
        first_name: fn,
        last_name: ln,
        email: em,
        phone: phone.trim() || null,
        team: targetTeam,
        cancel_code: cancelCode,
        status: "active",
      },
    ]);

    if (error) {
      const m = String(error.message || "");
      if (m.toLowerCase().includes("duplicate") || m.toLowerCase().includes("unique")) {
        setMsg("Tento email je už prihlásený.");
      } else {
        setMsg("Nepodarilo sa prihlásiť. Skontroluj INSERT policy v Supabase.");
      }
      return;
    }

    setMsg(`Hotovo ✅ Si prihlásený. Odhlasovací kód: ${cancelCode}`);
    await load();
  }

  return (
    <main style={{ maxWidth: 520, margin: "0 auto", padding: 14, fontFamily: "Arial, sans-serif" }}>
      <div style={{ background: "#f6f7fb", borderRadius: 16, padding: 14 }}>
        <h1 style={{ margin: 0 }}>🏒 HokejPWG</h1>
        <div style={{ opacity: 0.8, marginTop: 4 }}>PWG Arena • Nedeľa 10:45 • Max 12</div>

        <div style={{ display: "flex", gap: 12, marginTop: 10 }}>
          <div>⚪ Biely: <b>{counts.white}/{maxPerTeam}</b></div>
          <div>⚫ Čierny: <b>{counts.black}/{maxPerTeam}</b></div>
        </div>

        <div style={{ marginTop: 12, background: "#fff", borderRadius: 14, padding: 12 }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Prihlásenie</div>

          <div style={{ display: "grid", gap: 8 }}>
            <input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Meno" />
            <input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Priezvisko" />
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" />
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Telefón (voliteľné)" />
          </div>

          <div style={{ display: "flex", gap: 12, marginTop: 10, alignItems: "center" }}>
            <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input type="radio" checked={teamPick === "white"} onChange={() => setTeamPick("white")} />
              Biely
            </label>
            <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input type="radio" checked={teamPick === "black"} onChange={() => setTeamPick("black")} />
              Čierny
            </label>

            <label style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
              Zapamätať
            </label>
          </div>

          <button
            onClick={signUp}
            style={{
              marginTop: 10,
              width: "100%",
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid #111",
              background: "#111",
              color: "#fff",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            PRIHLÁSIŤ SA
          </button>

          {msg && <div style={{ marginTop: 10 }}>{msg}</div>}
          {loading && <div style={{ marginTop: 8, opacity: 0.7 }}>Načítavam…</div>}
        </div>

        <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
          <div style={{ background: "#fff", borderRadius: 14, padding: 12 }}>
            <div style={{ fontWeight: 800, marginBottom: 8 }}>⚪ Biely tím</div>
            <ol style={{ margin: 0, paddingLeft: 18 }}>
              {Array.from({ length: 6 }).map((_, i) => (
                <li key={i} style={{ opacity: white[i] ? 1 : 0.5 }}>
                  {white[i] ? shortName(white[i]) : "Voľné miesto"}
                </li>
              ))}
            </ol>
          </div>

          <div style={{ background: "#fff", borderRadius: 14, padding: 12 }}>
            <div style={{ fontWeight: 800, marginBottom: 8 }}>⚫ Čierny tím</div>
            <ol style={{ margin: 0, paddingLeft: 18 }}>
              {Array.from({ length: 6 }).map((_, i) => (
                <li key={i} style={{ opacity: black[i] ? 1 : 0.5 }}>
                  {black[i] ? shortName(black[i]) : "Voľné miesto"}
                </li>
              ))}
            </ol>
          </div>

          <div style={{ background: "#fff", borderRadius: 14, padding: 12 }}>
            <div style={{ fontWeight: 800, marginBottom: 8 }}>❄️ Náhradníci</div>
            {subs.length === 0 ? (
              <div style={{ opacity: 0.7 }}>Zatiaľ nikto.</div>
            ) : (
              <ol style={{ margin: 0, paddingLeft: 18 }}>
                {subs.map((p) => (
                  <li key={p.id}>{shortName(p)} ({p.team === "white" ? "Biely" : p.team === "black" ? "Čierny" : "Náhradník"})</li>
                ))}
              </ol>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
