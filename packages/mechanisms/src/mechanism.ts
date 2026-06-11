/** The whole product in one interface. See ADR-0002. Pure functions only. */
export type Id = string;
export type Ok = { ok: true };
export type Rejection = { ok: false; reason: string };

export interface Mechanism<S, A, C> {
  init(config: C, rng: SeededRng): S;
  validate(state: S, playerId: Id, action: A): Ok | Rejection;
  apply(state: S, playerId: Id, action: A): { state: S; events: GameEvent[] };
  onTimer(state: S, timer: string): { state: S; events: GameEvent[] };
  /** Information sets live here. Hidden state must never appear in a view. */
  view(state: S, viewer: Id | "spectator"): unknown;
  /** Only valid in terminal states. Integer cents. */
  payoffs(state: S): Map<Id, number>;
  isTerminal(state: S): boolean;
}

export interface SeededRng { next(): number; fork(label: string): SeededRng }
export type GameEvent = { type: string; payload: unknown; visibleTo: Id[] | "all" };
