import { HEROES, bombList, deckSummary } from "@/game/cards";
import { useMatch } from "@/game/store";
import type { Desk, Seat } from "@/game/types";
import { useState } from "react";

const FLOW = ["流動性回滿", "抽一張", "出牌與攻擊", "換邊"];

const SECTIONS: { title: string; body: string[] }[] = [
  {
    title: "這局在賭什麼",
    body: [
      "淨值 30 點，歸零就爆倉。把對手的淨值打到 0 就贏。",
      "流動性是每回合能動用的資金：第 1 輪 1 點，之後每輪 +1，上限 10，每輪回滿。",
    ],
  },
  {
    title: "三種職業，兩張席",
    body: [
      "巨鯨壓盤掃貨，做市商兩邊掛價，複利養大流動性再提前打出大倉。你選職業，再選莊家或散戶。對手用另一個職業，坐對面的席。",
      "每副基礎牌 30 張，兩邊都能打。開局會再塞進你這席的 5 張強牌，另一席那 5 張不會出現。實戰牌組 35 張。",
      "技能 2 點流動性，每回合一次。複利莊家加息，散戶發芽。新芽回合結束會自己長大。",
    ],
  },
  {
    title: "回合怎麼走",
    body: [
      "回合開始：流動性上限 +1 並回滿，抽 1 張，部位恢復攻擊次數，停牌若已到期則解除。",
      "然後你可以打出付得起的牌、讓能攻擊的部位或已裝備槓桿的自己去攻擊，並使用一次技能。",
      "先手第一輪只有 1 點流動性。後手開局多一張「融資」（0 費，本回合 +1 流動性）。",
    ],
  },
  {
    title: "三種牌",
    body: [
      "標的：佔一個板位（雙方最多各 7 個）。有動能與支撐。一般上場當回合不能攻擊。",
      "事件：立刻結算，然後進棄牌。需要目標時，沒有合法目標就不能打出。",
      "槓桿：裝備在自己身上，獲得動能，每回合可攻擊一次，每次消耗 1 耐久。耐久歸零就卸下。",
    ],
  },
  {
    title: "關鍵詞",
    body: [
      "護盤：只要場上有護盤，敵方的攻擊必須先打護盤。事件不受此限。",
      "市價：上場當回合就能攻擊任何合法目標。",
      "當沖：上場當回合可以攻擊敵方標的，但不能打對手。",
      "波動：每回合可以攻擊兩次。",
      "止損：抵銷接下來受到的第一次傷害。",
      "複利：這張牌造成的實際傷害，會等量回復你的淨值。",
      "停牌：不能攻擊，並會錯過一次自己的攻擊機會。",
      "法說：打出時結算。下市：離場時結算。",
    ],
  },
  {
    title: "怎麼操作",
    body: [
      "手牌往上拖到場上就打出。要指定目標，拖到發亮的標的再鬆開。",
      "綠光的部位可以往上拖去攻擊。技能鈕拖到場上或指定的標的上。",
      "誤觸可以撤回。桌機可用 Esc 取消、F 結束回合。",
    ],
  },
];

export function Rules() {
  const backMenu = useMatch((s) => s.backMenu);
  const [desk, setDesk] = useState<Desk>("whale");
  const [seat, setSeat] = useState<Seat>("house");
  const rows = deckSummary(desk);
  const bombs = bombList(desk, seat);
  const power = HEROES[desk].powers[seat];

  return (
    <main className="stage-host text-fg">
      <div className="stage lobby flex h-full flex-col">
      <header className="flex shrink-0 items-end justify-between gap-3 border-b border-gold/30 bg-ink/70 px-4 py-2">
        <div>
          <p className="text-xs tracking-widest text-gold">規章</p>
          <h1 className="font-serif text-3xl leading-none">多空決戰</h1>
        </div>
        <button type="button" onClick={backMenu} className="tap min-h-11 rounded-lg border border-line bg-surface px-4 text-sm">
          返回
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-4 pb-8">
          <ol className="grid grid-cols-2 gap-2">
            {FLOW.map((step, i) => (
              <li key={step} className="rounded-xl border border-line bg-surface px-3 py-3">
                <p className="num text-xs text-gold">0{i + 1}</p>
                <p className="mt-1 text-sm">{step}</p>
              </li>
            ))}
          </ol>

          {SECTIONS.map((section) => (
            <section key={section.title} className="rounded-xl border border-line bg-surface p-4">
              <h2 className="font-serif text-2xl text-gold">{section.title}</h2>
              <div className="mt-2 flex flex-col gap-2 text-sm leading-relaxed text-tape">
                {section.body.map((p) => (
                  <p key={p}>{p}</p>
                ))}
              </div>
            </section>
          ))}

          <section className="rounded-xl border border-line bg-surface p-4">
            <h2 className="font-serif text-2xl text-gold">技能</h2>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {(["whale", "maker", "growth"] as Desk[]).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDesk(d)}
                  className={desk === d ? "tap min-h-11 rounded-lg bg-gold text-sm font-semibold text-ink" : "tap min-h-11 rounded-lg border border-line text-sm"}
                >
                  {HEROES[d].name}
                </button>
              ))}
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {(["house", "retail"] as Seat[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSeat(s)}
                  className={seat === s ? "tap min-h-11 rounded-lg border border-gold text-sm text-gold" : "tap min-h-11 rounded-lg border border-line text-sm text-muted"}
                >
                  {s === "house" ? "莊家" : "散戶"}
                </button>
              ))}
            </div>
            <p className="mt-3 text-sm leading-relaxed">
              <span className="text-gold">{power.name}</span>
              <span className="num text-muted"> · {power.cost}</span>
              <span className="text-tape"> {power.text}</span>
            </p>
            <h3 className="mt-4 font-serif text-xl">這席強牌</h3>
            <ul className="mt-2 divide-y divide-line">
              {bombs.map((def) => (
                <li key={def.id} className="flex items-baseline justify-between gap-3 py-2 text-sm">
                  <span>
                    <span className="num mr-2 text-gold">{def.cost}</span>
                    {def.name}
                  </span>
                  <span className="max-w-[58%] text-right text-xs text-muted">{def.text}</span>
                </li>
              ))}
            </ul>
            <h3 className="mt-4 font-serif text-xl">基礎 30 張</h3>
            <ul className="mt-2 divide-y divide-line">
              {rows.map(({ def, count }) => (
                <li key={def.id} className="flex items-baseline justify-between gap-3 py-2 text-sm">
                  <span>
                    <span className="num mr-2 text-gold">{def.cost}</span>
                    {def.name}
                    <span className="ml-2 text-muted">×{count}</span>
                  </span>
                  <span className="max-w-[55%] text-right text-xs text-muted">{def.text}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
      </div>
    </main>
  );
}
