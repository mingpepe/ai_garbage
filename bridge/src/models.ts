export type Suit = '♠' | '♥' | '♦' | '♣';
export type Rank = 'A' | 'K' | 'Q' | 'J' | '10' | '9' | '8' | '7' | '6' | '5' | '4' | '3' | '2';
export type Player = 'north' | 'east' | 'south' | 'west';

export interface Card {
  suit: Suit;
  rank: Rank;
}

export interface PlayedCard {
  player: Player;
  card: Card;
}

export const SUITS: Suit[] = ['♠', '♥', '♦', '♣'];
export const RANKS: Rank[] = ['A', 'K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4', '3', '2'];

export const RANK_VALUE: Record<Rank, number> = {
  'A': 14, 'K': 13, 'Q': 12, 'J': 11, '10': 10, '9': 9, '8': 8, '7': 7, '6': 6, '5': 5, '4': 4, '3': 3, '2': 2
};

export const PLAYERS: Player[] = ['north', 'east', 'south', 'west'];
