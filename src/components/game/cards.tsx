import clsx from "clsx";
import type { CardDef, Desk } from "@/game/types";

function hash(seed: string) {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return (h >>> 0) / 4294967296;
  };
}

function series(seed: string, n: number) {
  const rnd = hash(seed);
  let y = 16;
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) {
    y += (rnd() - 0.42) * 7;
    y = Math.max(4, Math.min(28, y));
    pts.push({ x: (i / (n - 1)) * 72, y });
  }
  return pts;
}

export function Chart({ seed, up, tall }: { seed: string; up: boolean; tall?: boolean }) {
  const pts = series(seed, tall ? 18 : 8);
  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const area = `${line} L72,32 L0,32 Z`;
  return (
    <svg viewBox="0 0 72 32" className={tall ? "h-24 w-full" : "h-8 w-full"} aria-hidden preserveAspectRatio="none">
      <path d={area} className={up ? "chart-wash" : "chart-wash down"} />
      {[8, 16, 24].map((y) => (
        <line key={y} x1="0" x2="72" y1={y} y2={y} className="stroke-line" strokeWidth="0.4" />
      ))}
      <path
        d={line}
        pathLength={1}
        fill="none"
        strokeWidth="1.6"
        strokeLinejoin="round"
        strokeLinecap="round"
        className={clsx("spark-draw", up ? "stroke-bull" : "stroke-bear")}
      />
    </svg>
  );
}

export function cardArt(id: string) {
  return `/art/cards/${id}.jpg?v=3`;
}

const HERO_FILE: Record<Desk, string> = { whale: "bull", maker: "bear", growth: "grow" };

export function heroArt(desk: Desk) {
  return `/art/heroes/${HERO_FILE[desk]}.jpg?v=7`;
}

export function CardFace({
  def,
  attack,
  health,
  maxHealth,
  compact,
  hot,
  ready,
  dim,
  tags,
}: {
  def: CardDef;
  attack?: number;
  health?: number;
  maxHealth?: number;
  compact?: boolean;
  hot?: boolean;
  ready?: boolean;
  dim?: boolean;
  tags?: string[];
}) {
  const atk = attack ?? def.attack;
  const hp = health ?? def.health;
  const hurt = def.type === "minion" && maxHealth != null && hp != null && hp < maxHealth;
  return (
    <div className={clsx("relative h-full w-full", dim && "opacity-60")}>
      <div
        className={clsx(
          "sv-card card-lift relative flex h-full w-full flex-col overflow-hidden bg-ink text-left",
          def.desk === "maker" && "sv-bear",
          def.desk === "whale" && "sv-whale",
          def.desk === "growth" && "sv-grow",
          hot && "is-hot",
          ready && !hot && "is-ready",
        )}
      >
        <img src={cardArt(def.art ?? def.id)} alt="" draggable={false} className="absolute inset-0 h-full w-full object-cover object-center" />
        <div className="card-shade pointer-events-none absolute inset-0" />
        <div className="relative z-10 flex h-full flex-col">
          <span className="num absolute left-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-gold text-[11px] font-bold text-ink shadow-md">
            {def.cost}
          </span>
          <div className={clsx("mt-auto px-1", def.type === "minion" ? "pb-5" : "pb-1")}>
            <p className="truncate text-center font-serif text-xs leading-tight tracking-tight text-fg">{def.name}</p>
            {!compact && <p className="mt-0.5 line-clamp-3 px-1 text-center text-xs leading-snug text-muted">{def.text}</p>}
            {compact && tags?.length ? <p className="truncate text-center text-[10px] text-gold">{tags.join(" · ")}</p> : null}
            {def.type === "weapon" && (
              <p className="text-center text-[10px] text-gold">
                {def.attack}/{def.durability}
              </p>
            )}
          </div>
        </div>
      </div>
      {def.type === "minion" && atk != null && hp != null && (
        <>
          <span className="atk-gem num">{atk}</span>
          <span className={clsx("hp-gem num", hurt && "is-hurt")}>{hp}</span>
        </>
      )}
    </div>
  );
}

export function Pips({ mana, max, dots = true }: { mana: number; max: number; dots?: boolean }) {
  if (max <= 0) return <span className="num text-sm text-muted">未開</span>;
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <span className="num text-sm font-semibold text-gold">
        {mana}/{max}
      </span>
      {dots && (
        <span className="flex gap-0.5" aria-hidden>
          {Array.from({ length: Math.max(max, 1) }, (_, i) => (
            <i key={i} className={clsx("mana-pip h-2.5 w-2.5 rounded-full", i < mana ? "on bg-gold" : "off bg-line")} />
          ))}
        </span>
      )}
    </div>
  );
}

export function Floater({
  pulse,
}: {
  pulse?: { n: number; kind: "dmg" | "heal" | "shield"; nonce: number };
}) {
  if (!pulse) return null;
  const label = pulse.kind === "shield" ? "止損" : pulse.kind === "heal" ? `+${pulse.n}` : `−${pulse.n}`;
  return (
    <span
      key={pulse.nonce}
      className={clsx(
        "fx-pop pointer-events-none absolute -top-1 left-1/2 z-10 text-lg font-semibold",
        pulse.kind === "dmg" ? "text-bear" : "text-bull",
      )}
    >
      {label}
    </span>
  );
}

export function HealthMark({
  value,
  max,
  desk,
  glyph,
  hot,
  ready,
  compact,
}: {
  value: number;
  max: number;
  desk: Desk;
  glyph: string;
  hot?: boolean;
  ready?: boolean;
  compact?: boolean;
}) {
  const low = value <= 12;
  return (
    <span className={clsx("hero-medal relative inline-grid", hot && "is-hot", ready && !hot && "is-ready")}>
      <span className={clsx("grid place-items-center rounded-full bg-ink ring-2 ring-gold ring-offset-2 ring-offset-[#07110c]", compact ? "h-14 w-14" : "h-16 w-16")}>
        <img
          src={heroArt(desk)}
          alt={glyph}
          draggable={false}
          className={clsx("rounded-full object-cover object-top", compact ? "h-11 w-11" : "h-12 w-12")}
        />
      </span>
      <span className={clsx("hp-shield num absolute -right-1 top-2", low && "is-hurt")} title={`${value}/${max}`}>{value}</span>
    </span>
  );
}
