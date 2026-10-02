import { HEROES, bombList } from "@/game/cards";
import { useMatch } from "@/game/store";
import type { Desk, Seat } from "@/game/types";
import { BookOpen } from "lucide-react";
import { useEffect } from "react";
import { CardFace, heroArt } from "./cards";

const SEATS: { id: Seat; line: string }[] = [
  { id: "house", line: "莊家坐深的一邊。" },
  { id: "retail", line: "散戶追單的一邊。" },
];

export function Menu() {
  const desk = useMatch((s) => s.desk);
  const seat = useMatch((s) => s.seat);
  const setDesk = useMatch((s) => s.setDesk);
  const setSeat = useMatch((s) => s.setSeat);
  const start = useMatch((s) => s.start);
  const openRules = useMatch((s) => s.openRules);
  const stats = useMatch((s) => s.stats);
  const hydrate = useMatch((s) => s.hydrate);
  const hero = HEROES[desk];
  const power = hero.powers[seat];
  const bombs = bombList(desk, seat);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  return (
    <main className="stage-host text-fg">
      <div className="stage lobby relative h-full overflow-hidden">
        <div className="lobby-veil" />
        <div className="relative flex h-full flex-col gap-3 overflow-hidden px-4 py-4">
          <header className="shrink-0 text-center">
            <p className="text-[10px] tracking-[0.35em] text-gold">WHALE / MAKER / GROWTH</p>
            <h1 className="title-crest font-serif leading-none">多空決戰</h1>
            <p className="num mt-1 text-[11px] text-muted">
              {stats.w} 勝 · {stats.l} 負 · {stats.d} 平
            </p>
          </header>
          <div className="grid min-h-0 flex-1 grid-cols-3 gap-2">
            <ClassPortrait id="whale" line="壓盤、掃貨、一口吃滿板位。" on={desk === "whale"} onPick={() => setDesk("whale")} />
            <ClassPortrait id="maker" line="兩邊掛價，用牆換節奏。" on={desk === "maker"} onPick={() => setDesk("maker")} />
            <ClassPortrait id="growth" line="養大流動性，提早打出大倉。" on={desk === "growth"} onPick={() => setDesk("growth")} />
          </div>
          <div className="relative z-10 flex shrink-0 flex-col items-center gap-2 text-center">

            <section className="grid w-full grid-cols-2 gap-2">
              {SEATS.map(({ id, line }) => {
                const on = seat === id;
                return (
                  <button
                    key={id}
                    type="button"
                    data-testid={`seat-${id}`}
                    onClick={() => setSeat(id)}
                    className={on ? "seat-chip is-on" : "seat-chip"}
                  >
                    <p className="font-serif text-lg leading-none">{id === "house" ? "莊家" : "散戶"}</p>
                    <p className="mt-1 text-[10px] text-muted">{line}</p>
                  </button>
                );
              })}
            </section>

            <section className="w-full rounded-2xl border border-gold/40 bg-ink/75 px-3 py-2 text-left shadow-[0_0_24px_rgb(228_181_74/0.12)]">
              <p className="font-serif text-lg leading-none">
                {power.name}
                <span className="num ml-2 text-xs text-gold">{power.cost}</span>
              </p>
              <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-tape">{power.text}</p>
            </section>

            <ul className="flex w-full justify-center gap-1">
              {bombs.map((def) => (
                <li key={def.id} className="h-16 w-12">
                  <CardFace def={def} compact />
                </li>
              ))}
            </ul>

            <div className="flex w-full flex-col gap-1">
              <button type="button" data-testid="start-match" onClick={start} className="gold-key tap min-h-11 w-full rounded-full bg-gold text-sm font-semibold text-ink">
                開始對決
              </button>
              <button type="button" onClick={openRules} className="tap inline-flex h-8 items-center justify-center gap-1 text-[11px] text-muted">
                <BookOpen className="size-3.5" aria-hidden />
                閱讀規章
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

function ClassPortrait({ id, line, on, onPick }: { id: Desk; line: string; on: boolean; onPick: () => void }) {
  return (
    <button type="button" data-testid={`desk-${id}`} onClick={onPick} className={on ? "class-portrait is-on" : "class-portrait"}>
      <img src={heroArt(id)} alt="" className="absolute inset-0 h-full w-full object-cover object-top" />
      <span className="portrait-shade" />
      <span className="relative z-10 mt-auto px-3 pb-3 text-left">
        <span className="font-serif text-2xl leading-none">{HEROES[id].name}</span>
        <span className="mt-1 block text-[11px] text-tape">{line}</span>
        {on && <span className="mt-2 inline-block rounded-full bg-gold px-2 py-0.5 text-[10px] font-semibold text-ink">已選</span>}
      </span>
    </button>
  );
}
