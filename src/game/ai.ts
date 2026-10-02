import { CARDS } from "./cards.ts";
import { apply, attackTargets, listAttackActions, listPlayActions, other } from "./engine.ts";
import type { Action, GameState, MinionState, Side, SideState } from "./types.ts";

const OPP_BOARD = 1.5;
const FACE = 0.58;
const MY_HP = 0.9;
const MANA_W = 0.22;

function minionValue(m: MinionState): number {
  let v = m.attack * 1.05 + Math.max(0, m.health) * 0.9;
  if (m.taunt) v += 1.3;
  if (m.divine) v += 2.1;
  if (m.windfury) v += m.attack * 0.65;
  if (m.lifesteal) v += 1;
  if (m.charge || m.rush) v += 0.35;
  if (m.frozen) v -= 0.7;
  return v;
}

function handValue(p: SideState): number {
  let v = 0;
  for (const c of p.hand) {
    const d = CARDS[c.defId];
    if (!d) continue;
    v += 0.85 + d.cost * 0.42;
  }
  return v;
}

export function evaluate(s: GameState, me: Side): number {
  if (s.winner === me) return 100000;
  if (s.winner === "draw") return -80;
  if (s.winner) return -100000;
  const opp = other(me);
  const A = s.players[me];
  const B = s.players[opp];
  let score = A.hero.health * MY_HP - B.hero.health * FACE;
  for (const m of A.board) score += minionValue(m);
  for (const m of B.board) score -= minionValue(m) * OPP_BOARD;
  score += handValue(A);
  score -= handValue(B) * 0.3;
  if (A.weapon) score += A.weapon.attack * A.weapon.durability * 0.4;
  if (B.weapon) score -= B.weapon.attack * B.weapon.durability * 0.5;
  return score;
}

function firstGoodAttack(state: GameState): Action | null {
  let best: Action | null = null;
  let bestSc = evaluate(state, state.turn);
  for (const a of listAttackActions(state)) {
    const next = apply(state, a).state;
    const sc = evaluate(next, state.turn);
    if (sc > bestSc + 0.12) {
      bestSc = sc;
      best = a;
    }
  }
  return best;
}

function greedyAttacks(state: GameState): GameState {
  let s = state;
  for (let i = 0; i < 12; i++) {
    if (s.winner || s.turn !== state.turn) return s;
    const a = firstGoodAttack(s);
    if (!a) return s;
    s = apply(s, a).state;
  }
  return s;
}

function lineScore(s: GameState, me: Side): number {
  const done = greedyAttacks(s);
  return evaluate(done, me) - done.players[me].mana * MANA_W;
}

export function bestAction(state: GameState): Action {
  if (state.winner || state.phase !== "battle") return { t: "end" };
  const me = state.turn;
  for (const a of listAttackActions(state)) {
    if (apply(state, a).state.winner === me) return a;
  }
  const base = lineScore(state, me);
  let best: Action | null = null;
  let bestSc = base;
  const options = listPlayActions(state);
  const capped = options.length > 22 ? options.slice(0, 22) : options;
  for (const a of capped) {
    const s1 = apply(state, a).state;
    let sc = s1.winner ? evaluate(s1, me) : lineScore(s1, me);
    if (!s1.winner && s1.turn === me) {
      const more = listPlayActions(s1);
      const cap2 = more.length > 12 ? more.slice(0, 12) : more;
      for (const b of cap2) {
        const s2 = apply(s1, b).state;
        const sc2 = s2.winner || s2.turn !== me ? evaluate(s2, me) : lineScore(s2, me);
        if (sc2 > sc) sc = sc2;
      }
    }
    if (sc > bestSc + 0.05) {
      bestSc = sc;
      best = a;
    }
  }
  if (!best) return firstGoodAttack(state) ?? { t: "end" };
  return best;
}

export function canAttackNow(s: GameState, uid: string): boolean {
  return attackTargets(s, { k: "minion", uid }).length > 0;
}
