import assert from "node:assert/strict";
import { BOMBS, DECKS } from "./cards.ts";
import { bestAction } from "./ai.ts";
import {
  apply,
  attackTargets,
  createMatch,
  debugGive,
  debugSummon,
  sandbox,
} from "./engine.ts";

assert.equal(DECKS.whale.length, 30);
assert.equal(DECKS.maker.length, 30);
assert.equal(DECKS.growth.length, 30);
assert.equal(BOMBS.growth.house.length, 5);
assert.equal(BOMBS.whale.house.length, 5);
assert.equal(BOMBS.maker.retail.length, 5);

{
  const s = createMatch({ desk: "whale", seat: "house", seed: 7, first: "player" });
  assert.equal(s.players.player.hand.length, 3);
  assert.equal(s.players.enemy.hand.length, 4);
  assert.equal(s.phase, "mulligan");
  const uid = s.players.player.hand[0]!.uid;
  const m = apply(s, { t: "mulligan", side: "player", uids: [uid] }).state;
  assert.equal(m.players.player.hand.length, 3);
  assert.equal(m.players.player.mulliganDone, true);
  const begun = apply(apply(m, { t: "mulligan", side: "enemy", uids: [] }).state, { t: "begin" }).state;
  assert.equal(begun.phase, "battle");
  assert.equal(begun.turn, "player");
  assert.equal(begun.players.player.maxMana, 1);
  assert.equal(begun.players.player.hand.length, 4);
  assert.equal(begun.players.enemy.hand.some((c) => c.defId === "margin"), true);
}

{
  const s0 = createMatch({ desk: "maker", seat: "retail", seed: 3, first: "enemy" });
  const begun = apply(apply(s0, { t: "mulligan", side: "player", uids: [] }).state, { t: "begin" }).state;
  assert.equal(begun.turn, "enemy");
  assert.equal(begun.players.player.hand.some((c) => c.defId === "margin"), true);
  const afterEnemy = apply(begun, { t: "end" }).state;
  assert.equal(afterEnemy.turn, "player");
  const coin = afterEnemy.players.player.hand.find((c) => c.defId === "margin")!;
  assert.equal(afterEnemy.players.player.mana, 1);
  const coined = apply(afterEnemy, { t: "play", uid: coin.uid, target: null }).state;
  assert.equal(coined.players.player.mana, 2);
  assert.equal(coined.players.player.maxMana, 1);
}

{
  const s = sandbox();
  const card = debugGive(s, "player", "meme");
  const played = apply(s, { t: "play", uid: card.uid, target: null }).state;
  const meme = played.players.player.board[0]!;
  assert.equal(meme.faceOk, true);
  assert.equal(meme.attacksLeft, 1);
  const hit = apply(played, { t: "attack", from: { k: "minion", uid: meme.uid }, to: { k: "hero", side: "enemy" } }).state;
  assert.equal(hit.players.enemy.hero.health, 28);
  assert.equal(hit.players.player.board[0]!.attacksLeft, 0);
}

{
  const s = sandbox();
  const card = debugGive(s, "player", "day");
  const played = apply(s, { t: "play", uid: card.uid, target: null }).state;
  const day = played.players.player.board[0]!;
  assert.equal(day.faceOk, false);
  assert.equal(attackTargets(played, { k: "minion", uid: day.uid }).length, 0);
  const withTaunt = structuredClone(played);
  const hedge = debugSummon(withTaunt, "enemy", "hedge", true)!;
  const targets = attackTargets(withTaunt, { k: "minion", uid: day.uid });
  assert.equal(targets.length, 1);
  assert.equal(targets[0]!.k === "minion" && targets[0].uid === hedge.uid, true);
}

{
  const s = sandbox();
  const etf = debugSummon(s, "enemy", "etf", true)!;
  debugSummon(s, "enemy", "gold", true);
  const mine = debugSummon(s, "player", "meme", true)!;
  const targets = attackTargets(s, { k: "minion", uid: mine.uid });
  assert.deepEqual(targets, [{ k: "minion", uid: etf.uid }]);
}

{
  const s = sandbox();
  const fund = debugSummon(s, "enemy", "fund", true)!;
  const tsla = debugSummon(s, "player", "tsla", true)!;
  const hit = apply(s, { t: "attack", from: { k: "minion", uid: tsla.uid }, to: { k: "minion", uid: fund.uid } }).state;
  const still = hit.players.enemy.board.find((m) => m.defId === "fund")!;
  assert.equal(still.divine, false);
  assert.equal(still.health, 7);
  assert.equal(hit.players.player.board.some((m) => m.defId === "tsla"), false);
}

{
  const s = sandbox();
  s.players.player.hero.health = 20;
  const gold = debugSummon(s, "player", "gold", true)!;
  const hit = apply(s, { t: "attack", from: { k: "minion", uid: gold.uid }, to: { k: "hero", side: "enemy" } }).state;
  assert.equal(hit.players.enemy.hero.health, 28);
  assert.equal(hit.players.player.hero.health, 22);
}

{
  const s = sandbox();
  const card = debugGive(s, "player", "lev");
  let st = apply(s, { t: "play", uid: card.uid, target: null }).state;
  assert.equal(st.players.player.weapon?.durability, 2);
  assert.equal(st.players.player.hero.attacksLeft, 1);
  const hedge = debugSummon(st, "enemy", "hedge", true)!;
  st = apply(st, { t: "attack", from: { k: "hero", side: "player" }, to: { k: "minion", uid: hedge.uid } }).state;
  assert.equal(st.players.enemy.board.length, 0);
  assert.equal(st.players.player.hero.health, 29);
  assert.equal(st.players.player.weapon?.durability, 1);
  assert.equal(attackTargets(st, { k: "hero", side: "player" }).length, 0);
}

{
  const s = sandbox();
  for (let i = 0; i < 7; i++) debugSummon(s, "player", "etf");
  const card = debugGive(s, "player", "meme");
  const st = apply(s, { t: "play", uid: card.uid, target: null }).state;
  assert.equal(st.players.player.board.length, 7);
  assert.equal(st.players.player.hand.some((c) => c.uid === card.uid), true);
}

{
  const s = sandbox();
  const ally = debugSummon(s, "player", "etf")!;
  const card = debugGive(s, "player", "beat");
  const st = apply(s, { t: "play", uid: card.uid, target: { k: "minion", uid: ally.uid } }).state;
  const buffed = st.players.player.board[0]!;
  assert.equal(buffed.attack, 4);
  assert.equal(buffed.health, 5);
}

{
  const s = sandbox();
  const sov = debugSummon(s, "player", "sov")!;
  sov.health = 1;
  s.turn = "enemy";
  const tsla = debugSummon(s, "enemy", "tsla", true)!;
  const st = apply(s, { t: "attack", from: { k: "minion", uid: tsla.uid }, to: { k: "minion", uid: sov.uid } }).state;
  assert.equal(st.players.player.board.some((m) => m.defId === "sov"), false);
  assert.equal(st.players.player.board.some((m) => m.defId === "uw"), true);
}

{
  const s = sandbox();
  const etf = debugSummon(s, "enemy", "etf", true)!;
  const card = debugGive(s, "player", "halt");
  let st = apply(s, { t: "play", uid: card.uid, target: { k: "minion", uid: etf.uid } }).state;
  let frozen = st.players.enemy.board[0]!;
  assert.equal(frozen.frozen, true);
  assert.equal(frozen.health, 1);
  st = apply(st, { t: "end" }).state;
  frozen = st.players.enemy.board[0]!;
  assert.equal(st.turn, "enemy");
  assert.equal(frozen.attacksLeft, 0);
  st = apply(st, { t: "end" }).state;
  frozen = st.players.enemy.board[0]!;
  assert.equal(frozen.frozen, false);
}

{
  const s = sandbox();
  let st = apply(s, { t: "end" }).state;
  assert.equal(st.players.enemy.hero.health, 29);
  assert.equal(st.players.enemy.fatigue, 1);
  st = apply(st, { t: "end" }).state;
  assert.equal(st.players.player.hero.health, 29);
  st = apply(st, { t: "end" }).state;
  assert.equal(st.players.enemy.fatigue, 2);
  assert.equal(st.players.enemy.hero.health, 27);
}

{
  const s = sandbox();
  s.players.enemy.hero.health = 2;
  const meme = debugSummon(s, "player", "meme", true)!;
  const st = apply(s, { t: "attack", from: { k: "minion", uid: meme.uid }, to: { k: "hero", side: "enemy" } }).state;
  assert.equal(st.winner, "player");
  assert.equal(st.phase, "over");
}

{
  const s = sandbox();
  s.turn = "enemy";
  debugGive(s, "enemy", "hedge");
  const action = bestAction(s);
  assert.equal(action.t, "play");
}

{
  const s = sandbox();
  s.turn = "enemy";
  s.players.player.hero.health = 2;
  debugSummon(s, "enemy", "meme", true);
  const action = bestAction(s);
  assert.equal(action.t, "attack");
}

{
  const s = sandbox();
  const nvda = debugSummon(s, "player", "nvda", true)!;
  assert.equal(nvda.attacksLeft, 2);
  let st = apply(s, { t: "attack", from: { k: "minion", uid: nvda.uid }, to: { k: "hero", side: "enemy" } }).state;
  assert.equal(st.players.enemy.hero.health, 26);
  const uid = st.players.player.board[0]!.uid;
  st = apply(st, { t: "attack", from: { k: "minion", uid }, to: { k: "hero", side: "enemy" } }).state;
  assert.equal(st.players.enemy.hero.health, 22);
  assert.equal(attackTargets(st, { k: "minion", uid }).length, 0);
}

console.log("engine ok");
