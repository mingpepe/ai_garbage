export type Suit = '♠' | '♥' | '♦' | '♣';
export type Rank = 'A' | 'K' | 'Q' | 'J' | '10' | '9' | '8' | '7' | '6' | '5' | '4' | '3' | '2';
export type Denomination = Suit | 'NT';

export type GameMode = '4p' | '5p';
export type Difficulty = 'easy' | 'medium' | 'hard';

export type Player4P = 'south' | 'west' | 'north' | 'east';
export type Player5P = 'south' | 'p2' | 'p3' | 'p4' | 'p5';
export type PlayerId = Player4P | Player5P;

export interface Card {
  suit: Suit;
  rank: Rank;
}

export interface PlayedCard {
  player: PlayerId;
  card: Card;
}

export type BidType = 'bid' | 'pass' | 'double' | 'redouble';

export interface Bid {
  type: BidType;
  player: PlayerId;
  level?: number;             // 1-7 (4P) or 1-5 (5P)
  denomination?: Denomination; // ♣, ♦, ♥, ♠, NT
}

export interface Contract {
  level: number;
  denomination: Denomination;
  declarer: PlayerId;
  dummy?: PlayerId;            // For 4P: partner of declarer
  doubled: boolean;
  redoubled: boolean;
}

export interface PartnerCall5P {
  card: Card;
  partnerPlayerId: PlayerId | null;
  revealed: boolean;
}

export type GamePhase =
  | 'bidding'
  | 'kitty'           // 5P: Declarer swaps 2 cards with kitty
  | 'calling_partner' // 5P: Declarer designates partner card
  | 'playing'
  | 'trick_end'
  | 'hand_ended';

export const SUITS: Suit[] = ['♠', '♥', '♦', '♣'];
export const RANKS: Rank[] = ['A', 'K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4', '3', '2'];

export const DENOMINATIONS_ORDER: Denomination[] = ['♣', '♦', '♥', '♠', 'NT'];

export const RANK_VALUE: Record<Rank, number> = {
  'A': 14, 'K': 13, 'Q': 12, 'J': 11, '10': 10, '9': 9, '8': 8, '7': 7, '6': 6, '5': 5, '4': 4, '3': 3, '2': 2
};

export const HIGH_CARD_POINTS: Record<Rank, number> = {
  'A': 4, 'K': 3, 'Q': 2, 'J': 1,
  '10': 0, '9': 0, '8': 0, '7': 0, '6': 0, '5': 0, '4': 0, '3': 0, '2': 0
};

export const PLAYERS_4P: Player4P[] = ['south', 'west', 'north', 'east'];
export const PLAYERS_5P: Player5P[] = ['south', 'p2', 'p3', 'p4', 'p5'];

export const PLAYER_NAMES_4P: Record<Player4P, string> = {
  south: '南家 (你)',
  west: '西家 (AI)',
  north: '北家 (AI)',
  east: '東家 (AI)'
};

export const PLAYER_NAMES_5P: Record<Player5P, string> = {
  south: '南家 (你)',
  p2: '西家 (AI)',
  p3: '西北家 (AI)',
  p4: '東北家 (AI)',
  p5: '東家 (AI)'
};

export interface HandScoreResult {
  contract: Contract;
  tricksWon: Record<string, number>;
  targetTricks: number;
  declarerTricks: number;
  made: boolean;
  tricksDiff: number; // +1, +2 or -1, -2
  declarerScore: number;
  defenderScore: number;
  summary: string;
}
