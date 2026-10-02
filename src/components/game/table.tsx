import { bestAction } from "@/game/ai";
import { CARDS } from "@/game/cards";
import { attackTargets, heroHint, playHint, sameTarget } from "@/game/engine";
import { lookedCard, useMatch } from "@/game/store";
import type { GameState, MinionState, Side, TargetRef } from "@/game/types";
import clsx from "clsx";
import { Volume2, VolumeX } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { CardFace, Floater, HealthMark, Pips } from "./cards";
import { ArenaGL } from "./arena-gl";

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isHot(targets: TargetRef[] | null | undefined, ref: TargetRef) {
  return !!targets?.some((t) => (t.k === "hero" ? ref.k === "hero" && t.side === ref.side : ref.k === "minion" && t.uid === ref.uid));
}

type DragSpec =
  | { t: "play"; uid: string; defId: string; targets: TargetRef[] | null }
  | { t: "attack"; from: TargetRef; targets: TargetRef[] }
  | { t: "hero"; targets: TargetRef[] | null };

type DragView = DragSpec & { x: number; y: number; ox: number; oy: number; over: string | null };

function sameSpec(a: DragSpec, b: DragSpec) {
  if (a.t !== b.t) return false;
  if (a.t === "play" && b.t === "play") return a.uid === b.uid;
  if (a.t === "attack" && b.t === "attack") return sameTarget(a.from, b.from);
  return a.t === "hero";
}

function sourceDrop(spec: DragSpec) {
  if (spec.t !== "attack") return null;
  return spec.from.k === "hero" ? `hero:${spec.from.side}` : `minion:${spec.from.uid}`;
}

function parseDrop(id: string | null): TargetRef | "board" | null {
  if (!id) return null;
  if (id === "board") return "board";
  if (id.startsWith("hero:")) {
    const side = id.slice(5);
    if (side === "player" || side === "enemy") return { k: "hero", side };
  }
  if (id.startsWith("minion:")) return { k: "minion", uid: id.slice(7) };
  return null;
}

function hitDrop(x: number, y: number) {
  const el = document.elementFromPoint(x, y);
  return el?.closest("[data-drop]")?.getAttribute("data-drop") ?? null;
}

function dropOk(drag: DragSpec, over: string | null) {
  const parsed = parseDrop(over);
  if (!parsed) return false;
  if ((drag.t === "play" || drag.t === "hero") && drag.targets === null) return true;
  if (parsed === "board" || !drag.targets) return false;
  return drag.targets.some((t) => sameTarget(t, parsed));
}

export function Table() {
  const game = useMatch((s) => s.game);
  const shake = useMatch((s) => s.shake);
  const toast = useMatch((s) => s.toast);
  const toastN = useMatch((s) => s.toastN);
  const sound = useMatch((s) => s.sound);
  const logOpen = useMatch((s) => s.logOpen);
  const history = useMatch((s) => s.history);
  const pulses = useMatch((s) => s.pulses);
  const lunge = useMatch((s) => s.lunge);
  const mulligan = useMatch((s) => s.mulligan);
  const endTurn = useMatch((s) => s.endTurn);
  const undo = useMatch((s) => s.undo);
  const toggleSound = useMatch((s) => s.toggleSound);
  const toggleLog = useMatch((s) => s.toggleLog);
  const backMenu = useMatch((s) => s.backMenu);
  const start = useMatch((s) => s.start);
  const confirmMulligan = useMatch((s) => s.confirmMulligan);
  const toggleMulligan = useMatch((s) => s.toggleMulligan);

  const lock = useRef(0);
  const dragRef = useRef<DragView | null>(null);
  const holdRef = useRef<DragSpec | null>(null);
  const detachDrag = useRef<(() => void) | null>(null);
  const [shaking, setShaking] = useState(false);
  const [drag, setDrag] = useState<DragView | null>(null);
  const [hold, setHold] = useState<DragSpec | null>(null);
  const [aim, setAim] = useState<string | null>(null);
  const [peek, setPeek] = useState<string | null>(null);
  const peekRef = useRef(false);
  const peekTimer = useRef(0);

  function clearHold() {
    holdRef.current = null;
    setHold(null);
    setAim(null);
  }

  function armSpec(spec: DragSpec, over: string | null) {
    holdRef.current = spec;
    setHold(spec);
    if (over && dropOk(spec, over)) {
      setAim(over);
      return;
    }
    if (!spec.targets || spec.targets.length === 0) {
      setAim("board");
      return;
    }
    if (spec.targets.length === 1) {
      const only = spec.targets[0];
      setAim(only.k === "hero" ? `hero:${only.side}` : `minion:${only.uid}`);
      return;
    }
    setAim(null);
  }

  function commitSpec(current: DragSpec, over: string | null) {
    const store = useMatch.getState();
    if (!dropOk(current, over)) {
      if (current.targets?.length) store.ping("點發亮的目標，或拖過去再鬆開。");
      return;
    }
    const parsed = parseDrop(over);
    if (current.t === "play") {
      store.commit({
        t: "play",
        uid: current.uid,
        target: current.targets === null || !parsed || parsed === "board" ? null : parsed,
      });
      return;
    }
    if (current.t === "hero") {
      store.commit({ t: "hero", target: current.targets === null || !parsed || parsed === "board" ? null : parsed });
      return;
    }
    if (parsed && parsed !== "board") store.commit({ t: "attack", from: current.from, to: parsed });
  }

  useEffect(() => {
    return () => {
      detachDrag.current?.();
      dragRef.current = null;
    };
  }, []);

  function arm(e: ReactPointerEvent, axis: "up" | "any", build: () => DragSpec | null, peekUid?: string) {
    if (e.button !== 0) return;
    detachDrag.current?.();
    window.clearTimeout(peekTimer.current);
    peekRef.current = false;
    const origin = { x: e.clientX, y: e.clientY, pid: e.pointerId };
    const box = e.currentTarget.getBoundingClientRect();
    const ox = box.left + box.width / 2;
    const oy = box.top + box.height / 2;
    let rejected = false;
    if (peekUid) {
      peekTimer.current = window.setTimeout(() => {
        peekRef.current = true;
        setPeek(peekUid);
      }, 280);
    }
    const stopPeek = () => {
      window.clearTimeout(peekTimer.current);
      if (peekRef.current) {
        peekRef.current = false;
        setPeek(null);
      }
    };
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== origin.pid) return;
      const dx = ev.clientX - origin.x;
      const dy = ev.clientY - origin.y;
      if (Math.hypot(dx, dy) > 8) stopPeek();
      if (!dragRef.current) {
        if (rejected || peekRef.current || Math.hypot(dx, dy) < 10) return;
        if (axis === "up" && !(dy < -8 && Math.abs(dy) > Math.abs(dx) * 0.45)) return;
        const spec = build();
        if (!spec) {
          rejected = true;
          return;
        }
        clearHold();
        const next: DragView = { ...spec, x: ev.clientX, y: ev.clientY, ox, oy, over: hitDrop(ev.clientX, ev.clientY) };
        dragRef.current = next;
        setDrag(next);
        return;
      }
      ev.preventDefault();
      const next: DragView = { ...dragRef.current, x: ev.clientX, y: ev.clientY, over: hitDrop(ev.clientX, ev.clientY) };
      dragRef.current = next;
      setDrag(next);
    };
    const up = (ev: PointerEvent) => {
      detachDrag.current?.();
      detachDrag.current = null;
      window.clearTimeout(peekTimer.current);
      if (ev.pointerId !== origin.pid) return;
      const wasPeek = peekRef.current;
      peekRef.current = false;
      setPeek(null);
      const current = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      if (wasPeek) return;
      const over = hitDrop(ev.clientX, ev.clientY);
      if (current) {
        if (dropOk(current, over)) armSpec(current, current.targets ? over : "board");
        return;
      }
      if (Math.hypot(ev.clientX - origin.x, ev.clientY - origin.y) > 12) return;
      const held = holdRef.current;
      if (held && over && dropOk(held, over) && over !== sourceDrop(held)) {
        setAim(over);
        return;
      }
      const spec = build();
      if (!spec) {
        if (held && over && over !== "board" && !dropOk(held, over)) useMatch.getState().ping("不是合法目標。");
        if (held && over && over !== "board") clearHold();
        return;
      }
      if (held && sameSpec(held, spec)) {
        clearHold();
        return;
      }
      armSpec(spec, null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    detachDrag.current = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }

  useEffect(() => {
    if (!game || game.phase !== "battle" || game.turn !== "enemy" || game.winner) return;
    const token = ++lock.current;
    let dead = false;
    void (async () => {
      await wait(420);
      let guard = 0;
      while (!dead && lock.current === token && guard++ < 28) {
        const g = useMatch.getState().game;
        if (!g || g.turn !== "enemy" || g.winner || g.phase !== "battle") break;
        const action = bestAction(g);
        if (lock.current !== token) break;
        useMatch.getState().commitAi(action);
        await wait(action.t === "end" ? 280 : 520);
        if (action.t === "end") break;
      }
    })();
    return () => {
      dead = true;
    };
  }, [game?.turn, game?.phase, game?.round, game?.winner]);

  useEffect(() => {
    clearHold();
  }, [game?.turn, game?.round]);

  useEffect(() => {
    if (!shake) return;
    setShaking(true);
    const t = setTimeout(() => setShaking(false), 280);
    return () => clearTimeout(t);
  }, [shake]);

  useEffect(() => {
    if (!toastN) return;
    const t = setTimeout(() => useMatch.setState({ toast: "" }), 1700);
    return () => clearTimeout(t);
  }, [toastN]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const g = useMatch.getState().game;
      if (e.key === "Escape") useMatch.getState().cancel();
      if ((e.key === "f" || e.key === "F") && g?.turn === "player" && g.phase === "battle" && !g.winner) {
        useMatch.getState().endTurn();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!game) return null;

  if (game.phase === "mulligan") {
    const mine = game.players.player;
    return (
      <main className="stage-host text-fg">
        <div className="stage lobby flex h-full flex-col overflow-hidden">
        <div className="shrink-0 px-4 pt-3">
          <p className="text-xs tracking-widest text-gold">開盤換牌</p>
          <h1 className="mt-1 font-serif text-3xl leading-none">把不想留的牌點暗</h1>
          <p className="mt-1 line-clamp-1 text-xs text-tape">{game.log[0]}</p>
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-2 grid-rows-2 gap-3 px-4 py-2">
          {mine.hand.map((c) => {
            const def = CARDS[c.defId];
            if (!def) return null;
            const marked = mulligan.includes(c.uid);
            return (
              <button
                key={c.uid}
                type="button"
                data-testid="hand-card"
                onClick={() => toggleMulligan(c.uid)}
                className={clsx("mulligan-card flex h-full min-h-0 flex-col", marked && "is-marked")}
              >
                <span className="min-h-0 flex-1">
                  <CardFace def={def} dim={marked} hot={marked} />
                </span>
                <span className="mt-1 block shrink-0 text-center text-xs text-gold">{marked ? "換掉" : "留下"}</span>
              </button>
            );
          })}
        </div>
        <footer className="flex shrink-0 items-center justify-center gap-3 px-4 pb-3">
          <button type="button" onClick={backMenu} className="tap h-11 rounded-full border border-line px-4 text-sm text-muted">
            返回櫃檯
          </button>
          <button
            type="button"
            data-testid="confirm-mulligan"
            onClick={confirmMulligan}
            className="gold-key tap h-11 min-w-48 rounded-full bg-gold text-sm font-semibold text-ink"
          >
            確認並開盤
          </button>
        </footer>
        </div>
      </main>
    );
  }

  const you = game.players.player;
  const foe = game.players.enemy;
  const yours = game.turn === "player" && !game.winner;
  const armed = drag ?? hold;
  const aimed = aim && aim !== "board" ? parseDrop(aim) : null;
  const targets = aimed && aimed !== "board" ? [aimed] : (armed?.targets ?? null);
  const look = lookedCard(game, null, peek);
  const boardHot = !!armed && (armed.t === "play" || armed.t === "hero") && armed.targets === null;
  const playerLunge = lunge?.id === "hero:player" ? lunge : null;
  const enemyLunge = lunge?.id === "hero:enemy" ? lunge : null;

  return (
    <main className="stage-host text-fg">
      <div className={clsx("stage arena relative flex h-full flex-col overflow-hidden", shaking && "is-shaking")}>
        {shaking && <div className="screen-hit pointer-events-none absolute inset-0 z-30" />}
        <ArenaGL />
        <header className="absolute inset-x-0 top-0 z-20 flex h-8 items-center justify-between px-2 text-[11px] text-muted">
          <p className="truncate">第 {game.round} 輪 · {game.winner ? "收盤" : yours ? "你的回合" : "對手出手"}</p>
          <div className="flex items-center">
            <button type="button" onClick={undo} disabled={!yours || history.length === 0} className="px-2 disabled:opacity-30">
              撤回
            </button>
            <button type="button" onClick={toggleLog} className="px-2">
              戰報
            </button>
            <button type="button" onClick={toggleSound} className="grid h-8 w-8 place-items-center" aria-label={sound ? "關閉音效" : "開啟音效"}>
              {sound ? <Volume2 className="size-3.5" /> : <VolumeX className="size-3.5" />}
            </button>
            <button type="button" onClick={backMenu} className="px-2">
              離開
            </button>
          </div>
        </header>

        <section className="relative z-10 shrink-0 px-3 pt-9">
          <div className="flex items-center justify-center gap-3">
            <button type="button" data-drop="hero:enemy" className="tap relative" onPointerDown={(e) => arm(e, "any", () => null)}>
              <span key={enemyLunge?.n ?? "foe"} className={clsx("inline-grid", enemyLunge && (enemyLunge.dir === "up" ? "lunge-up" : "lunge-down"))}>
                <HealthMark compact value={Math.max(0, foe.hero.health)} max={foe.hero.maxHealth} desk={foe.hero.desk} glyph={foe.hero.name} hot={isHot(targets, { k: "hero", side: "enemy" })} />
              </span>
              <Floater pulse={pulses["enemy:hero"]} />
            </button>
            <div className="min-w-0 text-left">
              <p className="truncate text-sm">{foe.hero.name}</p>
              <Pips mana={foe.mana} max={foe.maxMana} dots={false} />
            </div>
          </div>
          <div className="lane lane-far mt-1 flex h-24 items-end justify-center gap-1.5 overflow-x-auto">
            {foe.board.map((m) => (
              <Minion key={m.uid} m={m} side="enemy" hot={isHot(targets, { k: "minion", uid: m.uid })} onPointerDown={(e) => arm(e, "any", () => null, m.uid)} />
            ))}
          </div>
        </section>

        <div data-drop="board" className="field-3d relative z-10 min-h-0 flex-1">
          <TurnBanner round={game.round} turn={game.turn} winner={game.winner} />
          {toast && <p className="pointer-events-none absolute inset-x-3 top-2 truncate text-center text-[11px] text-gold">{toast}</p>}
          {logOpen && (
            <div className="enter absolute inset-x-3 top-2 z-20 max-h-28 overflow-y-auto rounded-xl border border-line bg-ink px-3 py-2 text-xs text-muted">
              {game.log.map((line, i) => (
                <p key={i}>{line}</p>
              ))}
            </div>
          )}
        </div>

        <section className="relative z-10 shrink-0 px-3 pb-[4.8rem]">
          <section data-drop="board" className={clsx("lane lane-near flex h-24 items-start justify-center gap-1.5 overflow-x-auto", boardHot && "is-hot")}>
            {you.board.map((m) => (
              <Minion
                key={m.uid}
                m={m}
                side="player"
                hot={isHot(targets, { k: "minion", uid: m.uid })}
                picked={armed?.t === "attack" && armed.from.k === "minion" && armed.from.uid === m.uid}
                ready={yours && attackTargets(game, { k: "minion", uid: m.uid }).length > 0}
                onPointerDown={(e) =>
                  arm(e, "up", () => {
                    const g = useMatch.getState().game;
                    if (!g || g.turn !== "player" || g.winner || g.phase !== "battle") return null;
                    const from: TargetRef = { k: "minion", uid: m.uid };
                    const tgts = attackTargets(g, from);
                    if (!tgts.length) {
                      const own = g.players.player.board.find((x) => x.uid === m.uid);
                      useMatch.getState().ping(own?.frozen ? "停牌中，不能攻擊。" : "這回合還不能攻擊。");
                      return null;
                    }
                    return { t: "attack", from, targets: tgts };
                  }, m.uid)
                }
              />
            ))}
          </section>
          <div className="mt-1 flex items-center justify-center gap-3">
            <button
              type="button"
              data-drop="hero:player"
              className="tap relative"
              onPointerDown={(e) =>
                arm(e, "up", () => {
                  const g = useMatch.getState().game;
                  if (!g || g.turn !== "player" || g.winner) return null;
                  const from: TargetRef = { k: "hero", side: "player" };
                  const tgts = attackTargets(g, from);
                  if (!tgts.length) {
                    useMatch.getState().ping(g.players.player.weapon ? "這回合不能再攻擊。" : "要先裝備槓桿，才能用頭像攻擊。");
                    return null;
                  }
                  return { t: "attack", from, targets: tgts };
                })
              }
            >
              <span key={playerLunge?.n ?? "you"} className={clsx("inline-grid", playerLunge && (playerLunge.dir === "up" ? "lunge-up" : "lunge-down"))}>
                <HealthMark
                  compact
                  value={Math.max(0, you.hero.health)}
                  max={you.hero.maxHealth}
                  desk={you.hero.desk}
                  glyph={you.hero.name}
                  hot={isHot(targets, { k: "hero", side: "player" })}
                  ready={yours && attackTargets(game, { k: "hero", side: "player" }).length > 0}
                />
              </span>
              <Floater pulse={pulses["player:hero"]} />
            </button>
            <div className="text-left">
              <Pips mana={you.mana} max={you.maxMana} dots={false} />
            </div>
            <button
              type="button"
              data-testid="hero-power"
              onPointerDown={(e) =>
                arm(e, "any", () => {
                  const g = useMatch.getState().game;
                  if (!g) return null;
                  const power = heroHint(g);
                  if (!power.ok) {
                    useMatch.getState().ping(power.reason);
                    return null;
                  }
                  return { t: "hero", targets: power.targets };
                })
              }
              className={clsx(
                "tap grid h-12 w-12 place-items-center rounded-full border border-gold/80 bg-ink/80 text-center text-[10px] font-semibold leading-tight",
                armed?.t === "hero" && "text-gold",
                (!yours || you.hero.powerUsed || you.mana < you.power.cost) && "opacity-40",
              )}
            >
              {you.power.name}
              <span className="num text-gold">{you.power.cost}</span>
            </button>
            <button
              type="button"
              data-testid="end-turn"
              onClick={endTurn}
              disabled={!yours}
              className="end-orb gold-key tap grid h-14 w-14 place-items-center rounded-full bg-gold text-[11px] font-bold leading-tight text-ink disabled:opacity-40"
            >
              結束
              <br />
              回合
            </button>
          </div>
        </section>

        {look?.def && (
          <div className="pointer-events-none absolute top-10 left-1/2 z-30 w-64 -translate-x-1/2 rounded-xl border border-gold bg-ink/95 px-3 py-2">
            <p className="truncate font-serif text-base">
              {look.def.name}
              {look.attack != null && look.health != null ? <span className="num ml-2 text-sm text-gold">{look.attack}/{look.health}</span> : null}
            </p>
            <p className="mt-0.5 text-xs text-muted">{look.def.text}</p>
          </div>
        )}

        <div className="lane absolute inset-x-2 bottom-1 z-10 flex h-[4.4rem] items-end justify-center overflow-x-auto px-2">
          {you.hand.map((c, i) => {
            const def = CARDS[c.defId];
            if (!def) return null;
            const lifted = (drag?.t === "play" && drag.uid === c.uid) || (hold?.t === "play" && hold.uid === c.uid);
            const mid = (you.hand.length - 1) / 2;
            return (
              <button
                key={c.uid}
                type="button"
                data-testid="hand-card"
                onPointerDown={(e) =>
                  arm(e, "up", () => {
                    const g = useMatch.getState().game;
                    if (!g) return null;
                    const play = playHint(g, c.uid);
                    if (!play.ok) {
                      useMatch.getState().ping(play.reason);
                      return null;
                    }
                    return { t: "play", uid: c.uid, defId: def.id, targets: play.targets };
                  }, c.uid)
                }
                className={clsx("hand-card fx-draw h-[4.2rem] w-12 shrink-0 touch-manipulation", lifted && "is-lifted", drag?.t === "play" && drag.uid === c.uid && "opacity-40")}
                style={{ animationDelay: `${i * 35}ms`, zIndex: lifted ? 5 : i, marginLeft: i === 0 ? 0 : -8, ["--tilt" as string]: `${(i - mid) * 4}deg` }}
              >
                <CardFace def={def} compact hot={lifted} dim={yours && def.cost > you.mana} />
              </button>
            );
          })}
        </div>

        {hold && !drag && (
          <div className="absolute bottom-[4.8rem] left-1/2 z-40 flex -translate-x-1/2 items-center gap-2">
            <button type="button" onClick={clearHold} className="tap h-11 rounded-full border border-line bg-ink/95 px-4 text-sm text-muted">
              取消
            </button>
            <button
              type="button"
              disabled={!!hold.targets?.length && !aim}
              onClick={() => {
                commitSpec(hold, aim ?? "board");
                clearHold();
              }}
              className="gold-key tap h-11 rounded-full bg-gold px-5 text-sm font-semibold text-ink disabled:opacity-40"
            >
              {hold.t === "attack" ? "確認攻擊" : hold.t === "hero" ? "確認發動" : "確認打出"}
            </button>
          </div>
        )}

        {drag && (drag.t === "attack" || drag.targets) && (
          <svg className="pointer-events-none fixed inset-0 z-30 h-dvh w-screen text-gold" aria-hidden>
            <line x1={drag.ox} y1={drag.oy} x2={drag.x} y2={drag.y} stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            <circle cx={drag.x} cy={drag.y} r="5" fill="currentColor" />
          </svg>
        )}
        {drag?.t === "play" && (
          <div className="pointer-events-none fixed z-40 h-28 w-20" style={{ left: drag.x, top: drag.y, transform: "translate(-50%, -78%) rotate(-6deg)" }}>
            <CardFace def={CARDS[drag.defId]!} hot={dropOk(drag, drag.over)} />
          </div>
        )}

        {game.winner && (
          <div className="backdrop-in absolute inset-0 z-20 grid place-items-center bg-ink/80 p-4">
            <div className="overlay-card w-full max-w-sm rounded-2xl border border-gold bg-surface p-6 text-center">
              <p className="text-xs tracking-widest text-gold">收盤</p>
              <h2 className="mt-2 font-serif text-4xl">
                {game.winner === "player" ? "對手爆倉" : game.winner === "enemy" ? "你爆倉了" : "同時爆倉"}
              </h2>
              <p className="mt-2 text-sm text-muted">
                {game.winner === "player"
                  ? "這筆趨勢你站對邊。"
                  : game.winner === "enemy"
                    ? "市場沒有跟著你的單走。"
                    : "兩邊帳戶同時歸零。"}
              </p>
              <div className="mt-5 flex flex-col gap-2">
                <button type="button" onClick={start} className="gold-key tap min-h-12 rounded-xl bg-gold font-semibold text-ink">
                  同一桌再戰
                </button>
                <button type="button" onClick={backMenu} className="tap min-h-11 rounded-xl border border-line">
                  回櫃檯
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

function TurnBanner({ round, turn, winner }: { round: number; turn: Side; winner: GameState["winner"] }) {
  const [banner, setBanner] = useState<{ key: string; text: string } | null>(null);
  useEffect(() => {
    if (winner) return;
    setBanner({ key: `${round}-${turn}`, text: turn === "player" ? "你的回合" : "對手出手" });
    const t = window.setTimeout(() => setBanner(null), 1080);
    return () => window.clearTimeout(t);
  }, [round, turn, winner]);
  if (!banner) return null;
  return (
    <div key={banner.key} className="turn-banner pointer-events-none fixed inset-x-6 top-[38%] z-20 text-center">
      <p className="font-serif text-4xl text-gold">{banner.text}</p>
    </div>
  );
}

function Minion({
  m,
  side,
  hot,
  ready,
  picked,
  onPointerDown,
}: {
  m: MinionState;
  side: Side;
  hot: boolean;
  ready?: boolean;
  picked?: boolean;
  onPointerDown?: (e: ReactPointerEvent) => void;
}) {
  const def = CARDS[m.defId];
  const pulse = useMatch((s) => s.pulses[`${side}:${m.uid}`]);
  const lunge = useMatch((s) => (s.lunge?.id === m.uid ? s.lunge : null));
  if (!def) return null;
  const tags = [m.taunt ? "護盤" : "", m.frozen ? "停牌" : "", m.divine ? "止損" : "", m.windfury ? "波動" : "", m.lifesteal ? "複利" : ""].filter(Boolean);
  return (
    <button
      type="button"
      data-drop={`minion:${m.uid}`}
      onPointerDown={onPointerDown}
      className={clsx("board-card relative h-20 w-14 shrink-0 touch-manipulation", m.taunt && "ward", picked && "is-lifted")}
    >
      <span key={lunge?.n ?? m.uid} className={clsx("block h-full w-full", lunge && (lunge.dir === "up" ? "lunge-up" : "lunge-down"))}>
        <span className="fx-slam block h-full w-full">
          <CardFace
            def={def}
            compact
            attack={m.attack}
            health={m.health}
            maxHealth={m.maxHealth}
            hot={hot || picked}
            ready={ready}
            dim={m.frozen}
            tags={tags}
          />
        </span>
      </span>
      {pulse?.kind === "dmg" && <span key={`d${pulse.nonce}`} className="hit-flash pointer-events-none absolute inset-0 rounded-lg" />}
      {pulse && pulse.kind !== "dmg" && <span key={`h${pulse.nonce}`} className="heal-flash pointer-events-none absolute inset-0 rounded-lg" />}
      <Floater pulse={pulse} />
    </button>
  );
}
