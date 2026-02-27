import { describe, it, expect, beforeEach } from 'vitest';
import { BridgeEngine } from '../BridgeEngine';
import { Card, Suit, Player } from '../models';

describe('BridgeEngine', () => {
  let game: BridgeEngine;

  beforeEach(() => {
    game = new BridgeEngine();
  });

  it('should initialize game with 13 cards per player', () => {
    expect(game.hands.north.length).toBe(13);
    expect(game.hands.south.length).toBe(13);
    expect(game.hands.east.length).toBe(13);
    expect(game.hands.west.length).toBe(13);
  });

  it('should allow valid moves (following suit)', () => {
    // Force a specific state for testing
    const player: Player = 'south';
    const card: Card = { suit: '♠', rank: 'A' };
    game.hands.south = [card];
    game.turnIndex = 2; // South
    
    expect(game.canPlayCard('south', 0).valid).toBe(true);
  });

  it('should prevent invalid moves (not your turn)', () => {
    game.turnIndex = 2; // South's turn
    expect(game.canPlayCard('north', 0).valid).toBe(false);
  });

  it('should prevent invalid moves (must follow suit)', () => {
    // North's hand: Ace of Hearts
    game.hands.north = [{ suit: '♥', rank: 'A' }];
    // East's hand: Ace of Spades, King of Hearts
    game.hands.east = [{ suit: '♠', rank: 'A' }, { suit: '♥', rank: 'K' }];
    
    game.turnIndex = 0; // North starts
    game.playCard('north', 0); // North plays Hearts
    
    // East's turn
    expect(game.ledSuit).toBe('♥');
    // East tries to play Spades (0), but has Hearts (1)
    expect(game.canPlayCard('east', 0).valid).toBe(false);
    expect(game.canPlayCard('east', 1).valid).toBe(true);
  });

  it('should evaluate winner of a trick correctly', () => {
    // South starts
    game.turnIndex = 2;
    game.hands.south = [{ suit: '♠', rank: '10' }];
    game.hands.west = [{ suit: '♠', rank: 'J' }];
    game.hands.north = [{ suit: '♠', rank: 'A' }];
    game.hands.east = [{ suit: '♠', rank: 'K' }];

    game.playCard('south', 0); // Led suit: ♠
    game.playCard('west', 0);
    game.playCard('north', 0);
    game.playCard('east', 0);

    const result = game.evaluateTrick();
    expect(result.winner).toBe('north');
    expect(game.score.ns).toBe(1);
    expect(game.turnIndex).toBe(0); // Winner (North) starts next trick
  });
});
