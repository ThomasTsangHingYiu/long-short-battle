import { create } from "zustand";
import { bestAction } from "./ai.ts";
import { setMuted, sfx, unlockAudio } from "./audio.ts";
import { CARDS } from "./cards.ts";
import {
  apply,
  attackTargets,
  createMatch,
  heroHint,
  playHint,
  sameTarget,
  suggestMulligan,
} from "./engine.ts";
import type { Action, Desk, GameEvent, GameState, Seat, TargetRef } from "./types.ts";

const STATS_KEY = "duokong-v1";

export interface Stats {
  w: number;
  l: number;
  d: number;
}

export type Pending =
  | { t: "play"; uid: string; targets: TargetRef[] }
  | { t: "attack"; from: TargetRef; targets: TargetRef[] }
  | { t: "hero"; targets: TargetRef[] };

interface Pulse {
  n: number;
  kind: "dmg" | "heal" | "shield";
  nonce: number;
}

export interface Lunge {
  id: string;
  dir: "up" | "down";
  n: number;
}

interface MatchStore {
  view: "menu" | "rules" | "table";
  desk: Desk;
  seat: Seat;
  game: GameState | null;
  pending: Pending | null;
  history: GameState[];
  pulses: Record<string, Pulse>;
  lunge: Lunge | null;
  shake: number;
  toast: string;
  toastN: number;
  sound: boolean;
  stats: Stats;
  hydrated: boolean;
  coach: boolean;
  mulligan: string[];
  recorded: boolean;
  logOpen: boolean;
  hydrate: () => void;
  setDesk: (desk: Desk) => void;
  setSeat: (seat: Seat) => void;
  openRules: () => void;
  backMenu: () => void;
  start: () => void;
  toggleMulligan: (uid: string) => void;
  confirmMulligan: () => void;
  clickHand: (uid: string) => void;
  clickMinion: (uid: string) => void;
  clickHero: (side: "player" | "enemy") => void;
  pressPower: () => void;
  endTurn: () => void;
  undo: () => void;
  cancel: () => void;
  commitAi: (action: Action) => void;
  toggleSound: () => void;
  toggleLog: () => void;
  dismissCoach: () => void;
  ping: (toast: string) => void;
  commit: (action: Action) => void;
  noteEnd: (g: GameState) => void;
}

function readStats(): Stats {
  if (typeof window === "undefined") return { w: 0, l: 0, d: 0 };
  try {
    const raw = localStorage.getItem(STATS_KEY);
    if (!raw) return { w: 0, l: 0, d: 0 };
    const p = JSON.parse(raw) as Partial<Stats>;
    return { w: Number(p.w) || 0, l: Number(p.l) || 0, d: Number(p.d) || 0 };
  } catch {
    return { w: 0, l: 0, d: 0 };
  }
}

function strikeOf(g: GameState, action: Action): Lunge | null {
  if (action.t !== "attack") return null;
  const n = Date.now();
  if (action.from.k === "hero") {
    return { id: `hero:${action.from.side}`, dir: action.from.side === "player" ? "up" : "down", n };
  }
  const uid = action.from.uid;
  const side = g.players.player.board.some((m) => m.uid === uid) ? "player" : "enemy";
  return { id: uid, dir: side === "player" ? "up" : "down", n };
}

function yourTurn(g: GameState | null): g is GameState {
  return !!g && g.phase === "battle" && !g.winner && g.turn === "player";
}

function fingerprint(g: GameState): string {
  const pack = (side: "player" | "enemy") => {
    const p = g.players[side];
    return [
      p.mana,
      p.maxMana,
      p.hero.health,
      p.hero.powerUsed ? 1 : 0,
      p.hero.attacksLeft,
      p.weapon ? `${p.weapon.attack}/${p.weapon.durability}` : "-",
      p.hand.map((c) => c.uid).join("."),
      p.board.map((m) => `${m.uid}:${m.attack}:${m.health}:${m.attacksLeft}:${m.divine ? 1 : 0}`).join("."),
    ].join("/");
  };
  return `${g.turn}|${g.phase}|${g.winner}|${pack("player")}|${pack("enemy")}`;
}

function absorb(events: GameEvent[], prev: Record<string, Pulse>, shake: number) {
  const pulses = { ...prev };
  let nextShake = shake;
  for (const e of events) {
    if (e.t === "shake") nextShake += 1;
    if ((e.t === "dmg" || e.t === "heal" || e.t === "shield") && e.id) {
      const prevPulse = pulses[e.id];
      pulses[e.id] = {
        n: e.n ?? 0,
        kind: e.t === "shield" ? "shield" : e.t,
        nonce: (prevPulse?.nonce ?? 0) + 1,
      };
    }
  }
  return { pulses, shake: nextShake };
}

function soundFor(events: GameEvent[], winner: GameState["winner"]) {
  if (winner === "player") sfx("win");
  else if (winner === "enemy") sfx("lose");
  else if (events.some((e) => e.t === "dmg" || e.t === "shake")) sfx("hit");
  else if (events.some((e) => e.t === "heal")) sfx("heal");
  else if (events.some((e) => e.t === "play")) sfx("play");
}

export const useMatch = create<MatchStore>((set, get) => ({
  view: "menu",
  desk: "whale",
  seat: "house",
  game: null,
  pending: null,
  history: [],
  pulses: {},
  lunge: null,
  shake: 0,
  toast: "",
  toastN: 0,
  sound: true,
  stats: { w: 0, l: 0, d: 0 },
  hydrated: false,
  coach: true,
  mulligan: [],
  recorded: false,
  logOpen: false,

  hydrate: () => {
    if (get().hydrated) return;
    set({ stats: readStats(), hydrated: true });
  },

  setDesk: (desk) => set({ desk }),
  setSeat: (seat) => set({ seat }),

  openRules: () => set({ view: "rules" }),

  backMenu: () => set({ view: "menu", pending: null, game: null, history: [], mulligan: [] }),

  start: () => {
    unlockAudio();
    sfx("click");
    const game = createMatch({
      desk: get().desk,
      seat: get().seat,
      seed: (Date.now() ^ (Math.random() * 1e9)) >>> 0,
    });
    set({
      game,
      view: "table",
      pending: null,
      history: [],
      pulses: {},
      lunge: null,
      mulligan: [],
      recorded: false,
      coach: true,
      logOpen: false,
      toast: "",
    });
  },

  toggleMulligan: (uid) => {
    const g = get().game;
    if (!g || g.phase !== "mulligan") return;
    const has = get().mulligan.includes(uid);
    set({ mulligan: has ? get().mulligan.filter((id) => id !== uid) : [...get().mulligan, uid] });
  },

  confirmMulligan: () => {
    const g0 = get().game;
    if (!g0 || g0.phase !== "mulligan") return;
    unlockAudio();
    let g = apply(g0, { t: "mulligan", side: "player", uids: get().mulligan }).state;
    g = apply(g, { t: "mulligan", side: "enemy", uids: suggestMulligan(g, "enemy") }).state;
    const res = apply(g, { t: "begin" });
    set({ game: res.state, pending: null, history: [], mulligan: [], lunge: null, ...absorb(res.events, {}, get().shake) });
    soundFor(res.events, res.state.winner);
  },

  clickHand: (uid) => {
    const g = get().game;
    if (!yourTurn(g)) {
      get().ping("現在不是你的回合。");
      return;
    }
    const hint = playHint(g, uid);
    if (!hint.ok) {
      get().ping(hint.reason);
      return;
    }
    if (hint.targets) {
      set({ pending: { t: "play", uid, targets: hint.targets } });
      return;
    }
    get().commit({ t: "play", uid, target: null });
  },

  clickMinion: (uid) => {
    const g = get().game;
    if (!g || g.phase !== "battle" || g.winner) return;
    const ref: TargetRef = { k: "minion", uid };
    const pending = get().pending;
    if (pending && pending.targets.some((t) => sameTarget(t, ref))) {
      if (pending.t === "play") get().commit({ t: "play", uid: pending.uid, target: ref });
      else if (pending.t === "hero") get().commit({ t: "hero", target: ref });
      else get().commit({ t: "attack", from: pending.from, to: ref });
      return;
    }
    if (!yourTurn(g)) return;
    const own = g.players.player.board.find((m) => m.uid === uid);
    if (own) {
      const targets = attackTargets(g, ref);
      if (!targets.length) {
        get().ping(own.frozen ? "停牌中，不能攻擊。" : own.attacksLeft <= 0 ? (own.charge || own.rush || own.faceOk ? "這回合已經攻擊過了。" : "剛上場，下一回合才能攻擊。") : "當沖本回合不能攻擊對手。");
        return;
      }
      set({ pending: { t: "attack", from: ref, targets } });
      return;
    }
    if (pending) get().ping("這個目標不合法。");
  },

  clickHero: (side) => {
    const g = get().game;
    if (!g || g.phase !== "battle" || g.winner) return;
    const ref: TargetRef = { k: "hero", side };
    const pending = get().pending;
    if (pending && pending.targets.some((t) => sameTarget(t, ref))) {
      if (pending.t === "play") get().commit({ t: "play", uid: pending.uid, target: ref });
      else if (pending.t === "hero") get().commit({ t: "hero", target: ref });
      else get().commit({ t: "attack", from: pending.from, to: ref });
      return;
    }
    if (side === "player" && yourTurn(g)) {
      const targets = attackTargets(g, ref);
      if (!targets.length) {
        get().ping(g.players.player.weapon ? "這回合不能再攻擊。" : "要先裝備槓桿才能攻擊。");
        return;
      }
      set({ pending: { t: "attack", from: ref, targets } });
    }
  },

  pressPower: () => {
    const g = get().game;
    if (!yourTurn(g)) return;
    const hint = heroHint(g);
    if (!hint.ok) {
      get().ping(hint.reason);
      return;
    }
    if (hint.targets) {
      set({ pending: { t: "hero", targets: hint.targets } });
      return;
    }
    get().commit({ t: "hero", target: null });
  },

  endTurn: () => {
    const g = get().game;
    if (!yourTurn(g)) return;
    sfx("end");
    get().commit({ t: "end" });
  },

  undo: () => {
    const history = get().history;
    if (!history.length || !yourTurn(get().game)) return;
    const game = history[history.length - 1]!;
    set({ game, history: history.slice(0, -1), pending: null });
    sfx("click");
  },

  cancel: () => set({ pending: null }),

  commitAi: (action) => {
    const g = get().game;
    if (!g || g.turn !== "enemy" || g.winner || g.phase !== "battle") return;
    const res = apply(g, action);
    const fx = absorb(res.events, get().pulses, get().shake);
    set({ game: res.state, pending: null, lunge: strikeOf(g, action), ...fx });
    soundFor(res.events, res.state.winner);
    get().noteEnd(res.state);
  },

  toggleSound: () => {
    const sound = !get().sound;
    setMuted(!sound);
    set({ sound });
    if (sound) {
      unlockAudio();
      sfx("click");
    }
  },

  toggleLog: () => set({ logOpen: !get().logOpen }),
  dismissCoach: () => set({ coach: false }),

  ping: (toast: string) => {
    sfx("click");
    set({ toast, toastN: get().toastN + 1 });
  },

  commit: (action: Action) => {
    const g = get().game;
    if (!g) return;
    const res = apply(g, action);
    const changed = fingerprint(g) !== fingerprint(res.state);
    if (!changed) {
      const last = res.state.log[res.state.log.length - 1];
      if (last) get().ping(last);
      return;
    }
    const fx = absorb(res.events, get().pulses, get().shake);
    const history = action.t === "end" ? [] : [...get().history, g].slice(-20);
    set({ game: res.state, pending: null, history, lunge: strikeOf(g, action), ...fx });
    if (action.t !== "end") soundFor(res.events, res.state.winner);
    get().noteEnd(res.state);
  },

  noteEnd: (g: GameState) => {
    if (!g.winner || get().recorded) return;
    const stats = { ...get().stats };
    if (g.winner === "player") stats.w += 1;
    else if (g.winner === "enemy") stats.l += 1;
    else stats.d += 1;
    try {
      localStorage.setItem(STATS_KEY, JSON.stringify(stats));
    } catch {
      /* ignore quota */
    }
    set({ stats, recorded: true });
  },
}));

export function lookedCard(game: GameState, pending: Pending | null, hoverUid: string | null) {
  const uid =
    (pending?.t === "play" ? pending.uid : null) ||
    (pending?.t === "attack" && pending.from.k === "minion" ? pending.from.uid : null) ||
    hoverUid;
  if (!uid) return null;
  for (const side of ["player", "enemy"] as const) {
    const hand = game.players[side].hand.find((c) => c.uid === uid);
    if (hand) return { def: CARDS[hand.defId], attack: CARDS[hand.defId]?.attack, health: CARDS[hand.defId]?.health };
    const minion = game.players[side].board.find((m) => m.uid === uid);
    if (minion) return { def: CARDS[minion.defId], attack: minion.attack, health: minion.health, max: minion.maxHealth, frozen: minion.frozen, divine: minion.divine };
  }
  const weapon = game.players.player.weapon;
  if (weapon && weapon.defId === uid) return { def: CARDS[weapon.defId], attack: weapon.attack, health: undefined };
  return null;
}
