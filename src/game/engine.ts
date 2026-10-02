import { BOMBS, CARDS, DECKS, HEROES } from "./cards.ts";
import type {
  Action,
  CardDef,
  CardInst,
  Desk,
  Effect,
  GameEvent,
  GameResult,
  GameState,
  MinionState,
  Seat,
  Side,
  SideState,
  TargetRef,
} from "./types.ts";

export function other(side: Side): Side {
  return side === "player" ? "enemy" : "player";
}

function who(side: Side): string {
  return side === "player" ? "你" : "對手";
}

function pushLog(s: GameState, msg: string) {
  s.log = [...s.log, msg].slice(-40);
}

function rnd(s: GameState): number {
  let a = s.rng | 0;
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  s.rng = a;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function shuffle<T>(s: GameState, arr: T[]) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd(s) * (i + 1));
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
}

function nid(s: GameState): string {
  s.nextId += 1;
  return `c${s.nextId}`;
}

function otherDesk(desk: Desk): Desk {
  if (desk === "whale") return "maker";
  if (desk === "maker") return "whale";
  return "whale";
}

function otherSeat(seat: Seat): Seat {
  return seat === "house" ? "retail" : "house";
}

function seatName(seat: Seat): string {
  return seat === "house" ? "莊家" : "散戶";
}

function makeSide(desk: Desk, seat: Seat): SideState {
  const h = HEROES[desk];
  return {
    hero: {
      desk,
      seat,
      name: h.name,
      title: seatName(seat),
      health: 30,
      maxHealth: 30,
      powerUsed: false,
      attacksLeft: 0,
    },
    power: h.powers[seat],
    weapon: null,
    mana: 0,
    maxMana: 0,
    deck: [],
    hand: [],
    board: [],
    fatigue: 0,
    mulliganDone: false,
  };
}

function buildDeck(s: GameState, desk: Desk, seat: Seat): CardInst[] {
  const deck = [...DECKS[desk], ...BOMBS[desk][seat]].map((defId) => ({ uid: nid(s), defId }));
  shuffle(s, deck);
  return deck;
}

export function createMatch(opts: { desk: Desk; seat?: Seat; seed: number; first?: Side }): GameState {
  const seat = opts.seat ?? "house";
  const foeDesk = otherDesk(opts.desk);
  const foeSeat = otherSeat(seat);
  const s: GameState = {
    rng: opts.seed >>> 0 || 1,
    nextId: 0,
    sweeping: 0,
    players: {
      player: makeSide(opts.desk, seat),
      enemy: makeSide(foeDesk, foeSeat),
    },
    turn: "player",
    first: "player",
    round: 0,
    phase: "mulligan",
    winner: null,
    log: [],
    coinGiven: false,
  };
  s.players.player.deck = buildDeck(s, opts.desk, seat);
  s.players.enemy.deck = buildDeck(s, foeDesk, foeSeat);
  const first: Side = opts.first ?? (rnd(s) < 0.5 ? "player" : "enemy");
  s.first = first;
  s.turn = first;
  drawN(s, first, 3, [], true);
  drawN(s, other(first), 4, [], true);
  const you = s.players.player.hero;
  const foe = s.players.enemy.hero;
  pushLog(
    s,
    `你是${you.title} · ${you.name}，對手是${foe.title} · ${foe.name}。` +
      (first === "player" ? "你取得先手。點要換掉的牌，然後開盤。" : "對手取得先手。你是後手，開盤時會拿到「融資」。"),
  );
  return s;
}

export function cardName(defId: string): string {
  return CARDS[defId]?.name ?? "未知標的";
}

function findMinion(s: GameState, uid: string): { side: Side; m: MinionState } | null {
  for (const side of ["player", "enemy"] as Side[]) {
    const m = s.players[side].board.find((x) => x.uid === uid);
    if (m) return { side, m };
  }
  return null;
}

export function sameTarget(a: TargetRef, b: TargetRef): boolean {
  if (a.k !== b.k) return false;
  if (a.k === "hero" && b.k === "hero") return a.side === b.side;
  if (a.k === "minion" && b.k === "minion") return a.uid === b.uid;
  return false;
}

function maxAtkLimit(def: CardDef): number | null {
  for (const e of def.effects ?? []) {
    if (e.k === "destroy" && e.maxAtk != null) return e.maxAtk;
  }
  return null;
}

export function legalTargetsForCard(s: GameState, side: Side, def: CardDef): TargetRef[] {
  if (def.target === "none") return [];
  const mine = s.players[side].board;
  const theirs = s.players[other(side)].board;
  if (def.target === "friendlyMinion") return mine.map((m) => ({ k: "minion", uid: m.uid }));
  if (def.target === "enemyMinion") {
    const cap = maxAtkLimit(def);
    return theirs
      .filter((m) => cap == null || m.attack <= cap)
      .map((m) => ({ k: "minion", uid: m.uid }));
  }
  return [...mine, ...theirs].map((m) => ({ k: "minion", uid: m.uid }));
}

export function attackTargets(s: GameState, from: TargetRef): TargetRef[] {
  if (s.phase !== "battle" || s.winner) return [];
  const side = s.turn;
  let faceOk = true;
  if (from.k === "hero") {
    if (from.side !== side) return [];
    const p = s.players[side];
    if (!p.weapon || p.weapon.durability <= 0 || p.hero.attacksLeft <= 0) return [];
  } else {
    const f = findMinion(s, from.uid);
    if (!f || f.side !== side || f.m.attacksLeft <= 0 || f.m.frozen) return [];
    faceOk = f.m.faceOk;
  }
  const opp = other(side);
  const enemies = s.players[opp].board;
  const taunts = enemies.filter((m) => m.taunt);
  const pool = taunts.length ? taunts : enemies;
  const targets: TargetRef[] = pool.map((m) => ({ k: "minion", uid: m.uid }));
  if (!taunts.length && faceOk) targets.push({ k: "hero", side: opp });
  return targets;
}

function checkWinner(s: GameState) {
  if (s.winner) return;
  const pDead = s.players.player.hero.health <= 0;
  const eDead = s.players.enemy.hero.health <= 0;
  if (pDead && eDead) s.winner = "draw";
  else if (eDead) s.winner = "player";
  else if (pDead) s.winner = "enemy";
  if (s.winner) {
    s.phase = "over";
    pushLog(
      s,
      s.winner === "player" ? "對手爆倉。你贏得這局。" : s.winner === "enemy" ? "你爆倉了。" : "雙方同時爆倉，這局平手。",
    );
  }
}

function healHero(s: GameState, side: Side, n: number, events: GameEvent[]) {
  const h = s.players[side].hero;
  const before = h.health;
  h.health = Math.min(h.maxHealth, h.health + n);
  const got = h.health - before;
  if (got > 0) {
    events.push({ t: "heal", id: `${side}:hero`, n: got });
    pushLog(s, `${who(side)}回復 ${got} 點淨值。`);
  }
}

interface Packet {
  ref: TargetRef;
  n: number;
  lifesteal: boolean;
  owner: Side;
}

function applyRaw(s: GameState, ref: TargetRef, n: number, events: GameEvent[]): number {
  if (ref.k === "hero") {
    s.players[ref.side].hero.health -= n;
    events.push({ t: "dmg", id: `${ref.side}:hero`, n, big: n >= 3 });
    if (n >= 3) events.push({ t: "shake" });
    pushLog(s, `${who(ref.side)}的淨值 -${n}。`);
    return n;
  }
  const f = findMinion(s, ref.uid);
  if (!f || f.m.health <= 0) return 0;
  f.m.health -= n;
  events.push({ t: "dmg", id: `${f.side}:${f.m.uid}`, n, big: n >= 4 });
  pushLog(s, `「${cardName(f.m.defId)}」受到 ${n} 點傷害。`);
  return n;
}

function sweep(s: GameState, events: GameEvent[]) {
  if (s.sweeping > 0) return;
  s.sweeping += 1;
  try {
    let guard = 0;
    while (guard++ < 16 && !s.winner) {
      const dead: { side: Side; m: MinionState }[] = [];
      for (const side of ["player", "enemy"] as Side[]) {
        for (const m of s.players[side].board) {
          if (m.health <= 0) dead.push({ side, m });
        }
      }
      if (!dead.length) break;
      const gone = new Set(dead.map((d) => d.m.uid));
      for (const side of ["player", "enemy"] as Side[]) {
        s.players[side].board = s.players[side].board.filter((m) => !gone.has(m.uid));
      }
      for (const d of dead) {
        pushLog(s, `「${cardName(d.m.defId)}」下市。`);
        events.push({ t: "die", id: `${d.side}:${d.m.uid}` });
        if (d.m.death.length) resolveEffects(s, d.side, d.m.death, null, events);
      }
    }
  } finally {
    s.sweeping -= 1;
  }
  checkWinner(s);
}

function strike(s: GameState, packets: Packet[], events: GameEvent[]) {
  const popped = new Set<string>();
  for (const p of packets) {
    if (p.n <= 0 || p.ref.k !== "minion") continue;
    const f = findMinion(s, p.ref.uid);
    if (f?.m.divine) popped.add(f.m.uid);
  }
  for (const uid of popped) {
    const f = findMinion(s, uid);
    if (!f) continue;
    f.m.divine = false;
    events.push({ t: "shield", id: `${f.side}:${uid}` });
    pushLog(s, `「${cardName(f.m.defId)}」的止損抵銷了傷害。`);
  }
  for (const p of packets) {
    if (p.n <= 0) continue;
    if (p.ref.k === "minion" && popped.has(p.ref.uid)) continue;
    const dealt = applyRaw(s, p.ref, p.n, events);
    if (dealt > 0 && p.lifesteal) healHero(s, p.owner, dealt, events);
  }
  sweep(s, events);
}

function effectTargets(s: GameState, side: Side, e: Effect, target: TargetRef | null): TargetRef[] {
  if (e.k !== "dmg") return [];
  if (e.to === "enemyHero") return [{ k: "hero", side: other(side) }];
  if (e.to === "allEnemyMinions") {
    return s.players[other(side)].board.map((m) => ({ k: "minion", uid: m.uid }));
  }
  if (e.to === "target" && target) return [target];
  return [];
}

function resolveEffects(
  s: GameState,
  side: Side,
  effects: Effect[],
  target: TargetRef | null,
  events: GameEvent[],
) {
  for (const e of effects) {
    if (s.winner) return;
    if (e.k === "dmg") {
      const refs = effectTargets(s, side, e, target);
      strike(
        s,
        refs.map((ref) => ({ ref, n: e.n, lifesteal: false, owner: side })),
        events,
      );
    } else if (e.k === "heal") {
      healHero(s, side, e.n, events);
    } else if (e.k === "buff") {
      const mins =
        e.to === "allFriendly"
          ? [...s.players[side].board]
          : target?.k === "minion"
            ? [findMinion(s, target.uid)?.m].filter((m): m is MinionState => !!m)
            : [];
      for (const m of mins) {
        m.attack += e.a;
        m.health += e.h;
        m.maxHealth += e.h;
      }
      if (mins.length) pushLog(s, `${who(side)}的部位獲得 +${e.a}/+${e.h}。`);
    } else if (e.k === "draw") {
      drawN(s, side, e.n, events, false);
    } else if (e.k === "summon") {
      const def = CARDS[e.defId];
      if (def) placeMinion(s, side, def, events);
    } else if (e.k === "destroy") {
      if (target?.k === "minion") {
        const f = findMinion(s, target.uid);
        if (f && (e.maxAtk == null || f.m.attack <= e.maxAtk)) {
          pushLog(s, `「${cardName(f.m.defId)}」被消滅。`);
          f.m.health = 0;
        }
      }
      sweep(s, events);
    } else if (e.k === "freeze") {
      if (target?.k === "minion") {
        const f = findMinion(s, target.uid);
        if (f && f.m.health > 0) {
          const ownTurn = s.turn === f.side;
          f.m.frozen = true;
          f.m.freezeMarks = ownTurn ? 2 : 1;
          f.m.attacksLeft = 0;
          pushLog(s, `「${cardName(f.m.defId)}」停牌。`);
        }
      }
    } else if (e.k === "mana") {
      const p = s.players[side];
      const before = p.mana;
      p.mana = Math.min(10, p.mana + e.n);
      const got = p.mana - before;
      pushLog(s, got > 0 ? `${who(side)}獲得 ${got} 點流動性。` : "流動性已經滿了。");
    } else if (e.k === "ramp") {
      const p = s.players[side];
      const got = Math.min(e.n, 10 - p.maxMana);
      p.maxMana += got;
      p.mana = Math.min(10, p.mana + got);
      pushLog(s, got > 0 ? `${who(side)}的流動性上限提高 ${got}。` : "流動性上限已經是 10。");
    }
  }
}

function placeMinion(s: GameState, side: Side, def: CardDef, events: GameEvent[]): MinionState | null {
  const p = s.players[side];
  if (p.board.length >= 7) {
    pushLog(s, "部位已滿，無法再上場。");
    return null;
  }
  const m: MinionState = {
    uid: nid(s),
    defId: def.id,
    attack: def.attack ?? 0,
    health: def.health ?? 1,
    maxHealth: def.health ?? 1,
    taunt: !!def.taunt,
    rush: !!def.rush,
    charge: !!def.charge,
    windfury: !!def.windfury,
    divine: !!def.divine,
    lifesteal: !!def.lifesteal,
    attacksLeft: 0,
    faceOk: false,
    frozen: false,
    freezeMarks: 0,
    death: def.death ? def.death.map((e) => ({ ...e })) : [],
    endTurn: def.endTurn ? def.endTurn.map((e) => ({ ...e })) : [],
  };
  if (m.charge) {
    m.attacksLeft = m.windfury ? 2 : 1;
    m.faceOk = true;
  } else if (m.rush) {
    m.attacksLeft = m.windfury ? 2 : 1;
    m.faceOk = false;
  }
  p.board.push(m);
  events.push({ t: "play", id: `${side}:${m.uid}` });
  return m;
}

function drawN(s: GameState, side: Side, n: number, events: GameEvent[], silent: boolean) {
  const p = s.players[side];
  for (let i = 0; i < n; i++) {
    if (s.winner) return;
    if (p.deck.length === 0) {
      p.fatigue += 1;
      p.hero.health -= p.fatigue;
      events.push({ t: "dmg", id: `${side}:hero`, n: p.fatigue, big: true });
      events.push({ t: "shake" });
      if (!silent) pushLog(s, `${who(side)}的牌庫見底，爆倉 ${p.fatigue} 點。`);
      checkWinner(s);
      continue;
    }
    const card = p.deck.shift()!;
    const name = cardName(card.defId);
    if (p.hand.length >= 10) {
      if (!silent) pushLog(s, `${who(side)}手牌已滿，燒掉「${name}」。`);
    } else {
      p.hand.push(card);
      if (!silent) pushLog(s, side === "player" ? `你抽到「${name}」。` : "對手抽了一張牌。");
    }
  }
}

function refresh(p: SideState) {
  for (const m of p.board) {
    m.attacksLeft = m.frozen ? 0 : m.windfury ? 2 : 1;
    m.faceOk = true;
  }
  p.hero.attacksLeft = p.weapon && p.weapon.durability > 0 ? 1 : 0;
  p.hero.powerUsed = false;
}

function startTurn(s: GameState, side: Side, events: GameEvent[]) {
  if (s.winner) return;
  const p = s.players[side];
  s.turn = side;
  p.maxMana = Math.min(10, p.maxMana + 1);
  p.mana = p.maxMana;
  refresh(p);
  if (side === s.first) s.round += 1;
  pushLog(s, `${who(side) === "你" ? "你的回合" : "對手的回合"} · 第 ${s.round} 輪。流動性 ${p.mana}。`);
  drawN(s, side, 1, events, false);
  checkWinner(s);
}

function thaw(s: GameState, side: Side) {
  for (const m of s.players[side].board) {
    if (!m.frozen) continue;
    m.freezeMarks -= 1;
    if (m.freezeMarks <= 0) {
      m.frozen = false;
      m.freezeMarks = 0;
    }
  }
}

function endTurn(s: GameState, events: GameEvent[]) {
  const side = s.turn;
  const ids = s.players[side].board.map((m) => m.uid);
  for (const uid of ids) {
    if (s.winner) return;
    const f = findMinion(s, uid);
    if (!f || f.m.health <= 0 || !f.m.endTurn.length) continue;
    resolveEffects(s, side, f.m.endTurn, { k: "minion", uid }, events);
  }
  if (s.winner) return;
  thaw(s, side);
  pushLog(s, side === "player" ? "你結束回合。" : "對手結束回合。");
  startTurn(s, other(side), events);
}

function playCard(s: GameState, uid: string, target: TargetRef | null, events: GameEvent[]) {
  const side = s.turn;
  const p = s.players[side];
  const idx = p.hand.findIndex((c) => c.uid === uid);
  if (idx < 0) {
    pushLog(s, "這張牌不在手上。");
    return;
  }
  const inst = p.hand[idx]!;
  const def = CARDS[inst.defId];
  if (!def) return;
  if (p.mana < def.cost) {
    pushLog(s, "流動性不足。");
    return;
  }
  if (def.type === "minion" && p.board.length >= 7) {
    pushLog(s, "部位已滿（最多 7 個）。");
    return;
  }
  const options = legalTargetsForCard(s, side, def);
  let chosen = target;
  if (def.target === "none") chosen = null;
  else if (options.length === 0) {
    if (def.type === "spell") {
      pushLog(s, "沒有合法目標。");
      return;
    }
    chosen = null;
  } else if (!chosen || !options.some((t) => sameTarget(t, chosen!))) {
    pushLog(s, "需要選擇合法目標。");
    return;
  }
  p.mana -= def.cost;
  p.hand.splice(idx, 1);
  pushLog(s, `${who(side)}打出「${def.name}」。`);
  events.push({ t: "play" });
  if (def.type === "minion") {
    placeMinion(s, side, def, events);
    if (def.effects?.length) resolveEffects(s, side, def.effects, chosen, events);
  } else if (def.type === "spell") {
    if (def.effects?.length) resolveEffects(s, side, def.effects, chosen, events);
  } else {
    if (p.weapon) pushLog(s, `「${p.weapon.name}」被換下。`);
    p.weapon = {
      defId: def.id,
      name: def.name,
      attack: def.attack ?? 0,
      durability: def.durability ?? 1,
    };
    p.hero.attacksLeft = 1;
  }
  checkWinner(s);
}

function heroPower(s: GameState, target: TargetRef | null, events: GameEvent[]) {
  const side = s.turn;
  const p = s.players[side];
  if (p.hero.powerUsed) {
    pushLog(s, "本回合已經用過技能。");
    return;
  }
  if (p.mana < p.power.cost) {
    pushLog(s, "流動性不足。");
    return;
  }
  const kind = p.power.kind;
  if (kind.k === "aoe" && s.players[other(side)].board.length === 0) {
    pushLog(s, "場上沒有可壓的標的。");
    return;
  }
  if (kind.k === "summon" && p.board.length >= 7) {
    pushLog(s, "部位已滿（最多 7 個）。");
    return;
  }
  if (kind.k === "buff") {
    const opts = p.board.map((m) => ({ k: "minion" as const, uid: m.uid }));
    if (!opts.length) {
      pushLog(s, "場上沒有友方標的。");
      return;
    }
    if (!target || !opts.some((t) => sameTarget(t, target))) {
      pushLog(s, "選擇一個友方標的。");
      return;
    }
  }
  p.mana -= p.power.cost;
  p.hero.powerUsed = true;
  pushLog(s, `${who(side)}使用「${p.power.name}」。`);
  if (kind.k === "aoe") {
    strike(
      s,
      s.players[other(side)].board.map((m) => ({
        ref: { k: "minion" as const, uid: m.uid },
        n: kind.n,
        lifesteal: false,
        owner: side,
      })),
      events,
    );
  } else if (kind.k === "summon") {
    const def = CARDS[kind.defId];
    if (def) placeMinion(s, side, def, events);
  } else if (kind.k === "buff" && target?.k === "minion") {
    const f = findMinion(s, target.uid);
    if (f) {
      f.m.attack += kind.a;
      f.m.health += kind.h;
      f.m.maxHealth += kind.h;
      pushLog(s, `「${cardName(f.m.defId)}」獲得 +${kind.a}/+${kind.h}。`);
    }
  } else if (kind.k === "ramp") {
    const got = Math.min(kind.n, 10 - p.maxMana);
    p.maxMana += got;
    p.mana = Math.min(10, p.mana + got);
    pushLog(s, got > 0 ? `${who(side)}的流動性上限提高 ${got}。` : "流動性上限已經是 10。");
  }
}

function doAttack(s: GameState, from: TargetRef, to: TargetRef, events: GameEvent[]) {
  const legal = attackTargets(s, from);
  if (!legal.some((t) => sameTarget(t, to))) {
    pushLog(s, "這個攻擊不合法。");
    return;
  }
  const side = s.turn;
  let atk = 0;
  let lifesteal = false;
  let attackerName = "";
  if (from.k === "hero") {
    const p = s.players[side];
    atk = p.weapon?.attack ?? 0;
    attackerName = p.hero.name;
    p.hero.attacksLeft -= 1;
    if (p.weapon) {
      p.weapon.durability -= 1;
      if (p.weapon.durability <= 0) {
        pushLog(s, `「${p.weapon.name}」耐久耗盡。`);
        p.weapon = null;
        p.hero.attacksLeft = 0;
      }
    }
  } else {
    const f = findMinion(s, from.uid);
    if (!f) return;
    atk = f.m.attack;
    lifesteal = f.m.lifesteal;
    attackerName = cardName(f.m.defId);
    f.m.attacksLeft -= 1;
  }
  const defName =
    to.k === "hero" ? (to.side === "player" ? "你" : "對手") : `「${cardName(findMinion(s, to.uid)?.m.defId ?? "")}」`;
  pushLog(s, `「${attackerName}」攻擊${defName}。`);
  const packets: Packet[] = [{ ref: to, n: atk, lifesteal, owner: side }];
  if (to.k === "minion") {
    const tm = findMinion(s, to.uid);
    if (tm) {
      packets.push({
        ref: from,
        n: tm.m.attack,
        lifesteal: tm.m.lifesteal,
        owner: tm.side,
      });
    }
  }
  strike(s, packets, events);
}

function mulligan(s: GameState, side: Side, uids: string[]) {
  if (s.phase !== "mulligan") return;
  const p = s.players[side];
  if (p.mulliganDone) return;
  const drop = new Set(uids);
  const back: CardInst[] = [];
  p.hand = p.hand.filter((c) => {
    if (!drop.has(c.uid)) return true;
    back.push(c);
    return false;
  });
  p.deck.push(...back);
  shuffle(s, p.deck);
  drawN(s, side, back.length, [], true);
  p.mulliganDone = true;
  if (back.length) pushLog(s, `${who(side)}換了 ${back.length} 張牌。`);
}

function begin(s: GameState, events: GameEvent[]) {
  if (s.phase !== "mulligan") return;
  const second = other(s.first);
  if (!s.coinGiven) {
    s.players[second].hand.push({ uid: nid(s), defId: "margin" });
    s.coinGiven = true;
    pushLog(s, second === "player" ? "你獲得「融資」。" : "對手獲得「融資」。");
  }
  s.phase = "battle";
  startTurn(s, s.first, events);
}

export function apply(state: GameState, action: Action): GameResult {
  const s = structuredClone(state);
  const events: GameEvent[] = [];
  if (s.winner) return { state: s, events };
  if (action.t === "mulligan") {
    mulligan(s, action.side, action.uids);
    return { state: s, events };
  }
  if (action.t === "begin") {
    begin(s, events);
    return { state: s, events };
  }
  if (s.phase !== "battle") return { state: s, events };
  if (action.t === "end") endTurn(s, events);
  else if (action.t === "play") playCard(s, action.uid, action.target, events);
  else if (action.t === "hero") heroPower(s, action.target, events);
  else if (action.t === "attack") doAttack(s, action.from, action.to, events);
  return { state: s, events };
}

export function suggestMulligan(s: GameState, side: Side): string[] {
  const goingFirst = s.first === side;
  const keepMax = goingFirst ? 3 : 4;
  return s.players[side].hand
    .filter((c) => {
      const d = CARDS[c.defId];
      return !!d && d.id !== "margin" && d.cost > keepMax;
    })
    .map((c) => c.uid);
}

export function listPlayActions(s: GameState): Action[] {
  if (s.phase !== "battle" || s.winner) return [];
  const side = s.turn;
  const p = s.players[side];
  const out: Action[] = [];
  for (const c of p.hand) {
    const def = CARDS[c.defId];
    if (!def || def.cost > p.mana) continue;
    if (def.type === "minion" && p.board.length >= 7) continue;
    if (def.target === "none") {
      out.push({ t: "play", uid: c.uid, target: null });
      continue;
    }
    const tgts = legalTargetsForCard(s, side, def);
    if (!tgts.length) {
      if (def.type === "minion") out.push({ t: "play", uid: c.uid, target: null });
      continue;
    }
    for (const target of tgts) out.push({ t: "play", uid: c.uid, target });
  }
  if (!p.hero.powerUsed && p.mana >= p.power.cost) {
    const kind = p.power.kind;
    if (kind.k === "aoe" && s.players[other(side)].board.length) out.push({ t: "hero", target: null });
    if (kind.k === "summon" && p.board.length < 7) out.push({ t: "hero", target: null });
    if (kind.k === "buff") {
      for (const m of p.board) out.push({ t: "hero", target: { k: "minion", uid: m.uid } });
    }
    if (kind.k === "ramp") out.push({ t: "hero", target: null });
  }
  return out;
}

export function listAttackActions(s: GameState): Action[] {
  if (s.phase !== "battle" || s.winner) return [];
  const side = s.turn;
  const out: Action[] = [];
  for (const m of s.players[side].board) {
    const from: TargetRef = { k: "minion", uid: m.uid };
    for (const to of attackTargets(s, from)) out.push({ t: "attack", from, to });
  }
  const heroFrom: TargetRef = { k: "hero", side };
  for (const to of attackTargets(s, heroFrom)) out.push({ t: "attack", from: heroFrom, to });
  return out;
}

export function playHint(
  s: GameState,
  uid: string,
): { ok: true; targets: TargetRef[] | null } | { ok: false; reason: string } {
  if (s.phase !== "battle" || s.winner) return { ok: false, reason: "對局還沒開始。" };
  if (s.turn !== "player") return { ok: false, reason: "現在是對手的回合。" };
  const p = s.players.player;
  const inst = p.hand.find((c) => c.uid === uid);
  if (!inst) return { ok: false, reason: "這張牌不在手上。" };
  const def = CARDS[inst.defId];
  if (!def) return { ok: false, reason: "未知的牌。" };
  if (p.mana < def.cost) return { ok: false, reason: "流動性不足。" };
  if (def.type === "minion" && p.board.length >= 7) return { ok: false, reason: "部位已滿（最多 7 個）。" };
  if (def.target === "none") return { ok: true, targets: null };
  const tgts = legalTargetsForCard(s, "player", def);
  if (!tgts.length) {
    if (def.type === "spell") return { ok: false, reason: "沒有合法目標。" };
    return { ok: true, targets: null };
  }
  return { ok: true, targets: tgts };
}

export function heroHint(s: GameState): { ok: true; targets: TargetRef[] | null } | { ok: false; reason: string } {
  if (s.phase !== "battle" || s.winner || s.turn !== "player") return { ok: false, reason: "現在不能使用技能。" };
  const p = s.players.player;
  if (p.hero.powerUsed) return { ok: false, reason: "本回合已經用過技能。" };
  if (p.mana < p.power.cost) return { ok: false, reason: "流動性不足。" };
  const kind = p.power.kind;
  if (kind.k === "aoe") {
    if (!s.players.enemy.board.length) return { ok: false, reason: "場上沒有可壓的標的。" };
    return { ok: true, targets: null };
  }
  if (kind.k === "summon") {
    if (p.board.length >= 7) return { ok: false, reason: "部位已滿（最多 7 個）。" };
    return { ok: true, targets: null };
  }
  if (kind.k === "ramp") return { ok: true, targets: null };
  const tgts: TargetRef[] = p.board.map((m) => ({ k: "minion", uid: m.uid }));
  if (!tgts.length) return { ok: false, reason: "場上沒有友方標的。" };
  return { ok: true, targets: tgts };
}

export function sandbox(): GameState {
  const s = createMatch({ desk: "whale", seat: "house", seed: 1, first: "player" });
  s.phase = "battle";
  s.turn = "player";
  s.round = 3;
  s.winner = null;
  s.log = [];
  for (const side of ["player", "enemy"] as Side[]) {
    const p = s.players[side];
    p.hand = [];
    p.deck = [];
    p.board = [];
    p.mana = 10;
    p.maxMana = 10;
    p.weapon = null;
    p.fatigue = 0;
    p.hero.health = 30;
    p.hero.powerUsed = false;
    p.hero.attacksLeft = 0;
  }
  return s;
}

export function debugGive(s: GameState, side: Side, defId: string): CardInst {
  const c = { uid: nid(s), defId };
  s.players[side].hand.push(c);
  return c;
}

export function debugSummon(s: GameState, side: Side, defId: string, ready = false): MinionState | null {
  const def = CARDS[defId];
  if (!def) return null;
  const m = placeMinion(s, side, def, []);
  if (m && ready) {
    m.attacksLeft = m.windfury ? 2 : 1;
    m.faceOk = true;
    m.frozen = false;
  }
  return m;
}
