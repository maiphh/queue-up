/** Guest screen phase from ticket state (round-3 flow). */
export type GuestPhase = 'waiting' | 'almost' | 'yourTurn' | 'late' | 'served' | 'cancelled';

/** "Almost" when this many groups (or fewer) are ahead — matches screens 2/3 (2 = waiting, 1 = almost). */
export const ALMOST_THRESHOLD = 1;

export function phaseOf(t: { status: string; partiesAhead: number }, opts: { calledEvent?: boolean; graceExpired?: boolean } = {}): GuestPhase {
  if (t.status === 'SEATED') return 'served';
  if (t.status === 'CANCELLED') return 'cancelled';
  if (t.status === 'HELD') return 'late';
  if (t.status === 'CALLED' || opts.calledEvent) return opts.graceExpired ? 'late' : 'yourTurn';
  return t.partiesAhead <= ALMOST_THRESHOLD ? 'almost' : 'waiting';
}
