import type { TripSnapshot } from '../patch/contract.ts';

/** Online address text grants no permission to include it in a model/provider context. */
export function omitOnlineUserAddresses(snapshot: TripSnapshot): TripSnapshot {
  return { ...snapshot, days: snapshot.days.map(day => ({ ...day,
    ...(day.items ? { items: day.items.map(item => {
      const { chineseAddress, ...allowed } = item;
      void chineseAddress;
      return allowed;
    }) } : {}),
  })) };
}
