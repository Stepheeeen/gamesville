import type { PassType } from './db';

export interface PassOffer {
  type: PassType;
  title: string;
  price: string;
  days: number;
  blurb: string;
  hot?: boolean;
}

/** Ride Tickets & Wristbands — mock MNO direct-carrier-billing catalog. */
export const PASS_CATALOG: PassOffer[] = [
  { type: 'day', title: 'Day Ticket', price: '₦50', days: 1, blurb: 'One night on the midway.' },
  { type: 'weekend', title: 'Weekend Wristband', price: '₦200', days: 7, blurb: 'Seven days of rides.', hot: true },
  { type: 'golden', title: 'Golden Wristband', price: '₦500', days: 30, blurb: 'A month of front-of-line access.' },
];
