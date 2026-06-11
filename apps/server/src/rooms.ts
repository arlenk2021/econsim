import {
  Vickrey,
  VICKREY_SELLER,
  AllPay,
  ALLPAY_SELLER,
  DoubleAuction,
  PublicGoods,
  PG_BANK,
  makeRng,
  type GameEvent,
  type Id,
} from "@econsim/mechanisms";

/**
 * Authoritative room state (ADR-0002 / ADR-0003). The server is the ONLY holder
 * of full mechanism state; players receive exactly `view(state, theirId)` plus
 * events whose `visibleTo` includes them. Sealed bids never leave this process.
 */

export type MechanismName =
  | "vickrey"
  | "all-pay"
  | "double-auction"
  | "public-goods";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const REGISTRY: Record<MechanismName, any> = {
  vickrey: Vickrey,
  "all-pay": AllPay,
  "double-auction": DoubleAuction,
  "public-goods": PublicGoods,
};

export const CLOSE_ACTOR: Record<MechanismName, Id> = {
  vickrey: VICKREY_SELLER,
  "all-pay": ALLPAY_SELLER,
  "double-auction": "__market__",
  "public-goods": PG_BANK,
};

export const CLOSE_ACTION: Record<MechanismName, unknown> = {
  vickrey: { type: "reveal" },
  "all-pay": { type: "reveal" },
  "double-auction": { type: "clear" },
  "public-goods": { type: "settle" },
};

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // no I/O lookalikes

export interface Room {
  code: string;
  mechanism: MechanismName;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  state: any;
  /** All actions, for replay export. */
  log: Array<{ player: Id; action: unknown }>;
  /** Seats assigned to connected players. */
  seats: Id[];
}

export class RoomManager {
  private rooms = new Map<string, Room>();
  private rng = makeRng(0xfeed);

  /** Deterministic-ish join code from a seeded RNG (server-side only). */
  private newCode(): string {
    let code: string;
    do {
      code = Array.from(
        { length: 5 },
        () => ALPHABET[Math.floor(this.rng.next() * ALPHABET.length)],
      ).join("");
    } while (this.rooms.has(code));
    return code;
  }

  create(mechanism: MechanismName, config: Record<string, unknown>): Room {
    const code = this.newCode();
    const mech = REGISTRY[mechanism];
    const seed = (config.seed as number) ?? Math.floor(this.rng.next() * 2 ** 31);
    const fullConfig = { ...config, seed };
    const state = mech.init(fullConfig, makeRng(seed));
    const room: Room = {
      code,
      mechanism,
      state,
      log: [],
      seats: [...((config.players as Id[]) ?? []),
        ...((config.buyers as Id[]) ?? []),
        ...((config.sellers as Id[]) ?? [])],
    };
    this.rooms.set(code, room);
    return room;
  }

  get(code: string): Room | undefined {
    return this.rooms.get(code.toUpperCase());
  }

  /** Validate + apply an action; returns events or a rejection. */
  apply(
    room: Room,
    player: Id,
    action: unknown,
  ): { ok: true; events: GameEvent[] } | { ok: false; reason: string } {
    const mech = REGISTRY[room.mechanism];
    const check = mech.validate(room.state, player, action);
    if (!check.ok) return { ok: false, reason: check.reason };
    const r = mech.apply(room.state, player, action);
    room.state = r.state;
    room.log.push({ player, action });
    return { ok: true, events: r.events };
  }

  /** Host-driven close (reveal/clear/settle). */
  close(room: Room): { ok: true; events: GameEvent[] } | { ok: false; reason: string } {
    return this.apply(room, CLOSE_ACTOR[room.mechanism], CLOSE_ACTION[room.mechanism]);
  }

  /** The exact, information-set-respecting view for a viewer. */
  viewFor(room: Room, viewer: Id | "spectator"): unknown {
    const mech = REGISTRY[room.mechanism];
    return mech.view(room.state, viewer);
  }

  isTerminal(room: Room): boolean {
    return REGISTRY[room.mechanism].isTerminal(room.state);
  }

  payoffs(room: Room): Array<[Id, number]> {
    const mech = REGISTRY[room.mechanism];
    return this.isTerminal(room) ? [...(mech.payoffs(room.state) as Map<Id, number>)] : [];
  }
}

/** Filter events to those a given viewer is allowed to see. */
export function eventsVisibleTo(events: GameEvent[], viewer: Id): GameEvent[] {
  return events.filter(
    (e) => e.visibleTo === "all" || (Array.isArray(e.visibleTo) && e.visibleTo.includes(viewer)),
  );
}
