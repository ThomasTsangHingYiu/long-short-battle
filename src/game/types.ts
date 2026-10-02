export type Side = "player" | "enemy";
export type Desk = "whale" | "maker" | "growth";
export type Seat = "house" | "retail";
export type CardType = "minion" | "spell" | "weapon";
export type Rarity = "common" | "rare" | "epic";
export type TargetKind = "none" | "friendlyMinion" | "enemyMinion" | "anyMinion";

export type Effect =
  | { k: "dmg"; n: number; to: "enemyHero" | "target" | "allEnemyMinions" }
  | { k: "heal"; n: number; to: "myHero" }
  | { k: "buff"; a: number; h: number; to: "target" | "allFriendly" }
  | { k: "draw"; n: number }
  | { k: "summon"; defId: string }
  | { k: "destroy"; maxAtk?: number }
  | { k: "freeze" }
  | { k: "mana"; n: number }
  | { k: "ramp"; n: number };

export type PowerKind =
  | { k: "aoe"; n: number }
  | { k: "summon"; defId: string }
  | { k: "buff"; a: number; h: number }
  | { k: "ramp"; n: number };

export interface CardDef {
  id: string;
  name: string;
  ticker: string;
  cost: number;
  type: CardType;
  attack?: number;
  health?: number;
  durability?: number;
  text: string;
  rarity: Rarity;
  desk: Desk | "neutral";
  seat: Seat | "any";
  art?: string;
  target: TargetKind;
  taunt?: boolean;
  rush?: boolean;
  charge?: boolean;
  windfury?: boolean;
  divine?: boolean;
  lifesteal?: boolean;
  effects?: Effect[];
  death?: Effect[];
  endTurn?: Effect[];
}

export interface CardInst {
  uid: string;
  defId: string;
}

export interface MinionState {
  uid: string;
  defId: string;
  attack: number;
  health: number;
  maxHealth: number;
  taunt: boolean;
  rush: boolean;
  charge: boolean;
  windfury: boolean;
  divine: boolean;
  lifesteal: boolean;
  attacksLeft: number;
  faceOk: boolean;
  frozen: boolean;
  /** Own-turn endings remaining before 停牌 clears. */
  freezeMarks: number;
  death: Effect[];
  endTurn: Effect[];
}

export interface WeaponState {
  defId: string;
  name: string;
  attack: number;
  durability: number;
}

export interface HeroState {
  desk: Desk;
  seat: Seat;
  name: string;
  title: string;
  health: number;
  maxHealth: number;
  powerUsed: boolean;
  attacksLeft: number;
}

export interface PowerDef {
  name: string;
  cost: number;
  text: string;
  kind: PowerKind;
}

export interface SideState {
  hero: HeroState;
  power: PowerDef;
  weapon: WeaponState | null;
  mana: number;
  maxMana: number;
  deck: CardInst[];
  hand: CardInst[];
  board: MinionState[];
  fatigue: number;
  mulliganDone: boolean;
}

export type TargetRef = { k: "hero"; side: Side } | { k: "minion"; uid: string };

export type Action =
  | { t: "end" }
  | { t: "play"; uid: string; target: TargetRef | null }
  | { t: "hero"; target: TargetRef | null }
  | { t: "attack"; from: TargetRef; to: TargetRef }
  | { t: "mulligan"; side: Side; uids: string[] }
  | { t: "begin" };

export interface GameEvent {
  t: "dmg" | "heal" | "shield" | "play" | "die" | "shake";
  id?: string;
  n?: number;
  big?: boolean;
}

export interface GameState {
  rng: number;
  nextId: number;
  sweeping: number;
  players: Record<Side, SideState>;
  turn: Side;
  first: Side;
  round: number;
  phase: "mulligan" | "battle" | "over";
  winner: Side | "draw" | null;
  log: string[];
  coinGiven: boolean;
}

export interface GameResult {
  state: GameState;
  events: GameEvent[];
}