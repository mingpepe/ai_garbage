import { describe, it, expect, beforeEach } from 'vitest';
import { BridgeEngine } from '../BridgeEngine';
import type { Card, PlayerId, Bid, Suit } from '../models';
import { BridgeAI } from '../ai/BridgeAI';

describe('BridgeEngine - 4 Player Mode', () => {
  let engine: BridgeEngine;

  beforeEach(() => {
    engine = new BridgeEngine('4p', 'medium');
  });

  it('should initialize 4-player game with 13 cards per player', () => {
    expect(engine.hands.south.length).toBe(13);
    expect(engine.hands.west.length).toBe(13);
    expect(engine.hands.north.length).toBe(13);
    expect(engine.hands.east.length).toBe(13);
    expect(engine.phase).toBe('bidding');
    expect(engine.playerCount).toBe(4);
  });

  it('should correctly handle bidding progression and contracts', () => {
    // South opens 1♠
    const bid1: Bid = { type: 'bid', player: 'south', level: 1, denomination: '♠' };
    const res1 = engine.placeBid(bid1);
    expect(res1.success).toBe(true);
    expect(res1.auctionEnded).toBe(false);
    expect(engine.currentContractBid?.denomination).toBe('♠');

    // West tries invalid bid (1♥ is lower than 1♠)
    const bidInvalid: Bid = { type: 'bid', player: 'west', level: 1, denomination: '♥' };
    const resInv = engine.placeBid(bidInvalid);
    expect(resInv.success).toBe(false);

    // West passes
    expect(engine.placeBid({ type: 'pass', player: 'west' }).success).toBe(true);
    // North bids 2♠
    expect(engine.placeBid({ type: 'bid', player: 'north', level: 2, denomination: '♠' }).success).toBe(true);
    // East passes
    expect(engine.placeBid({ type: 'pass', player: 'east' }).success).toBe(true);
    // South passes
    expect(engine.placeBid({ type: 'pass', player: 'south' }).success).toBe(true);
    // West passes (3rd pass after North's bid)
    const finalPass = engine.placeBid({ type: 'pass', player: 'west' });
    expect(finalPass.auctionEnded).toBe(true);

    // South was first in NS partnership to bid ♠, so South is declarer, North is dummy!
    expect(engine.contract?.declarer).toBe('south');
    expect(engine.contract?.dummy).toBe('north');
    expect(engine.contract?.level).toBe(2);
    expect(engine.contract?.denomination).toBe('♠');
    expect(engine.phase).toBe('playing');
    // Opening lead is left of declarer (West)
    expect(engine.getCurrentPlayer()).toBe('west');
  });

  it('should support Double and Redouble rules', () => {
    // South bids 1NT
    engine.placeBid({ type: 'bid', player: 'south', level: 1, denomination: 'NT' });

    // West can Double
    const dblRes = engine.placeBid({ type: 'double', player: 'west' });
    expect(dblRes.success).toBe(true);
    expect(engine.isDoubled).toBe(true);

    // North (South's partner) can Redouble
    const rdblRes = engine.placeBid({ type: 'redouble', player: 'north' });
    expect(rdblRes.success).toBe(true);
    expect(engine.isRedoubled).toBe(true);

    // East passes, South passes, West passes
    engine.placeBid({ type: 'pass', player: 'east' });
    engine.placeBid({ type: 'pass', player: 'south' });
    const endAuction = engine.placeBid({ type: 'pass', player: 'west' });

    expect(endAuction.auctionEnded).toBe(true);
    expect(engine.contract?.doubled).toBe(true);
    expect(engine.contract?.redoubled).toBe(true);
  });

  it('should redeal if all 4 players pass initially', () => {
    expect(engine.placeBid({ type: 'pass', player: 'south' }).auctionEnded).toBe(false);
    expect(engine.placeBid({ type: 'pass', player: 'west' }).auctionEnded).toBe(false);
    expect(engine.placeBid({ type: 'pass', player: 'north' }).auctionEnded).toBe(false);
    const lastPass = engine.placeBid({ type: 'pass', player: 'east' });

    expect(lastPass.auctionEnded).toBe(true);
    expect(lastPass.reason).toContain('全員 Pass');
    expect(engine.hands.south.length).toBe(13); // Redealt
  });

  it('should enforce follow-suit rules and trump winning', () => {
    engine.contract = {
      level: 1,
      denomination: '♠',
      declarer: 'south',
      dummy: 'north',
      doubled: false,
      redoubled: false
    };
    engine.phase = 'playing';

    // Set hands
    engine.hands.west = [{ suit: '♥', rank: 'K' }];
    engine.hands.north = [{ suit: '♥', rank: 'A' }];
    engine.hands.east = [{ suit: '♠', rank: '2' }]; // Void in ♥, has trump ♠2
    engine.hands.south = [{ suit: '♥', rank: '2' }];

    engine.turnIndex = 1; // West leads

    // West leads ♥K
    expect(engine.playCard('west', 0)).not.toBeNull();
    expect(engine.ledSuit).toBe('♥');

    // North must follow ♥ (has ♥A)
    expect(engine.canPlayCard('north', 0).valid).toBe(true);
    expect(engine.playCard('north', 0)).not.toBeNull();

    // East has no ♥, ruffs with ♠2
    expect(engine.playCard('east', 0)).not.toBeNull();

    // South plays ♥2
    expect(engine.playCard('south', 0)).not.toBeNull();

    // Evaluate trick: East's trump ♠2 should beat North's ♥A!
    const result = engine.evaluateTrick();
    expect(result.winner).toBe('east');
    expect(engine.tricksWon.east).toBe(1);
  });

  it('should allow declarer South to control dummy North when it is dummy turn', () => {
    engine.contract = {
      level: 3,
      denomination: 'NT',
      declarer: 'south',
      dummy: 'north',
      doubled: false,
      redoubled: false
    };
    engine.phase = 'playing';
    engine.turnIndex = 2; // North (dummy) turn

    expect(engine.getCurrentPlayer()).toBe('north');
    expect(engine.getEffectivePlayer()).toBe('south'); // South operates
  });

  it('should calculate 4P bridge scores accurately', () => {
    engine.contract = {
      level: 4,
      denomination: '♠',
      declarer: 'south',
      dummy: 'north',
      doubled: false,
      redoubled: false
    };
    // 4♠ target is 6 + 4 = 10 tricks
    engine.tricksWon.south = 6;
    engine.tricksWon.north = 4; // Total 10 tricks (made exactly)
    engine.tricksWon.west = 2;
    engine.tricksWon.east = 1;

    const scoreRes = engine.calculateScore();
    expect(scoreRes.made).toBe(true);
    expect(scoreRes.declarerTricks).toBe(10);
    // 4 * 30 = 120 trick points >= 100 => Game bonus = 300 => 420 points
    expect(scoreRes.declarerScore).toBe(420);
    expect(engine.matchScore.team1).toBe(420);
  });

  it('should calculate undertricks penalties when failing contract', () => {
    engine.contract = {
      level: 4,
      denomination: '♠',
      declarer: 'south',
      dummy: 'north',
      doubled: false,
      redoubled: false
    };
    // 4♠ target is 10 tricks. Declarer side only gets 8 tricks (Down 2)
    engine.tricksWon.south = 5;
    engine.tricksWon.north = 3;
    engine.tricksWon.west = 3;
    engine.tricksWon.east = 2;

    const scoreRes = engine.calculateScore();
    expect(scoreRes.made).toBe(false);
    expect(scoreRes.tricksDiff).toBe(-2);
    expect(scoreRes.defenderScore).toBe(100); // 2 * 50 = 100 points
  });
});

describe('BridgeEngine - 5 Player Mode (找朋友制)', () => {
  let engine: BridgeEngine;

  beforeEach(() => {
    engine = new BridgeEngine('5p', 'medium');
  });

  it('should initialize 5-player game with 10 cards each and 2 kitty cards', () => {
    expect(engine.hands.south.length).toBe(10);
    expect(engine.hands.p2.length).toBe(10);
    expect(engine.hands.p3.length).toBe(10);
    expect(engine.hands.p4.length).toBe(10);
    expect(engine.hands.p5.length).toBe(10);
    expect(engine.kitty.length).toBe(2);
    expect(engine.playerCount).toBe(5);
  });

  it('should progress through bidding, kitty exchange, and partner call in 5P', () => {
    // South bids 2♥
    expect(engine.placeBid({ type: 'bid', player: 'south', level: 2, denomination: '♥' }).success).toBe(true);
    // 4 consecutive passes
    expect(engine.placeBid({ type: 'pass', player: 'p2' }).success).toBe(true);
    expect(engine.placeBid({ type: 'pass', player: 'p3' }).success).toBe(true);
    expect(engine.placeBid({ type: 'pass', player: 'p4' }).success).toBe(true);
    const endBid = engine.placeBid({ type: 'pass', player: 'p5' });

    expect(endBid.auctionEnded).toBe(true);
    expect(engine.phase).toBe('kitty');
    expect(engine.hands.south.length).toBe(12); // Received 2 kitty cards

    // Declarer South discards 2 cards
    const discardRes = engine.exchangeKitty5P([0, 1]);
    expect(discardRes.success).toBe(true);
    expect(engine.hands.south.length).toBe(10);
    expect(engine.phase).toBe('calling_partner');

    // Call ♠A as partner
    const callRes = engine.callPartner5P({ suit: '♠', rank: 'A' });
    expect(callRes.success).toBe(true);
    expect(engine.phase).toBe('playing');
    expect(engine.getCurrentPlayer()).toBe('south'); // Declarer leads trick 1
  });

  it('should reveal partner when the called card is played', () => {
    engine.contract = {
      level: 1,
      denomination: 'NT',
      declarer: 'south',
      doubled: false,
      redoubled: false
    };
    engine.phase = 'calling_partner';
    // Clear hands first to avoid random cards from initial deal
    for (const p of engine.players) {
      engine.hands[p] = [];
    }
    engine.hands.p3 = [{ suit: '♦', rank: 'A' }]; // P3 holds ♦A

    engine.callPartner5P({ suit: '♦', rank: 'A' });
    expect(engine.partnerCall?.partnerPlayerId).toBe('p3');
    expect(engine.partnerCall?.revealed).toBe(false);

    // When P3 plays ♦A
    engine.turnIndex = 2; // p3
    engine.playCard('p3', 0);
    expect(engine.partnerCall?.revealed).toBe(true);
  });

  it('should calculate 5P score with Declarer and Partner combined tricks', () => {
    engine.contract = {
      level: 2,
      denomination: '♠',
      declarer: 'south',
      doubled: false,
      redoubled: false
    };
    engine.partnerCall = {
      card: { suit: '♠', rank: 'A' },
      partnerPlayerId: 'p3',
      revealed: true
    };
    // Target for Level 2 in 5P is 5 + 2 = 7 tricks
    engine.tricksWon.south = 5;
    engine.tricksWon.p3 = 3; // Partner won 3 tricks => Total 8 tricks (Overtrick +1)
    engine.tricksWon.p2 = 1;
    engine.tricksWon.p4 = 1;
    engine.tricksWon.p5 = 0;

    const scoreRes = engine.calculateScore();
    expect(scoreRes.made).toBe(true);
    expect(scoreRes.declarerTricks).toBe(8);
    expect(scoreRes.targetTricks).toBe(7);
    expect(scoreRes.tricksDiff).toBe(1);
    // 2 * 100 + 1 * 50 = 250 points
    expect(scoreRes.declarerScore).toBe(250);
  });
});

describe('BridgeAI - Strategic Decision Making', () => {
  it('should calculate HCP correctly', () => {
    const hand: Card[] = [
      { suit: '♠', rank: 'A' }, // 4
      { suit: '♠', rank: 'K' }, // 3
      { suit: '♥', rank: 'Q' }, // 2
      { suit: '♦', rank: 'J' }, // 1
      { suit: '♣', rank: '10' } // 0
    ];
    expect(BridgeAI.calculateHCP(hand)).toBe(10);
  });

  it('should choose appropriate bids based on difficulty', () => {
    const weakHand: Card[] = [
      { suit: '♠', rank: '2' },
      { suit: '♥', rank: '3' },
      { suit: '♦', rank: '4' },
      { suit: '♣', rank: '5' }
    ];
    // Weak hand should pass
    const bidWeak = BridgeAI.getBid('west', weakHand, '4p', 'medium', [], null);
    expect(bidWeak.type).toBe('pass');

    const strongHand: Card[] = [
      { suit: '♠', rank: 'A' },
      { suit: '♠', rank: 'K' },
      { suit: '♠', rank: 'Q' },
      { suit: '♠', rank: 'J' },
      { suit: '♠', rank: '10' },
      { suit: '♥', rank: 'A' },
      { suit: '♦', rank: 'K' },
      { suit: '♣', rank: '2' }
    ];
    const bidStrong = BridgeAI.getBid('west', strongHand, '4p', 'medium', [], null);
    expect(bidStrong.type).toBe('bid');
    expect(bidStrong.denomination).toBe('♠');
  });

  it('should select best discards for 5P kitty', () => {
    const hand: Card[] = [
      { suit: '♠', rank: 'A' },
      { suit: '♠', rank: 'K' },
      { suit: '♥', rank: '2' }, // Low card
      { suit: '♦', rank: '3' }  // Low card
    ];
    const discards = BridgeAI.selectKittyDiscards(hand, '♠');
    expect(discards.length).toBe(2);
    // Should discard the low cards, keeping ♠A and ♠K
    const remainingCards = hand.filter((_, i) => !discards.includes(i));
    expect(remainingCards.some(c => c.rank === 'A')).toBe(true);
    expect(remainingCards.some(c => c.rank === 'K')).toBe(true);
  });

  it('should play winning card when following and opponent is winning', () => {
    const hand: Card[] = [
      { suit: '♠', rank: '2' },
      { suit: '♠', rank: 'A' }
    ];
    const ctx = {
      currentTrick: [{ player: 'south' as PlayerId, card: { suit: '♠' as Suit, rank: 'K' as const } }],
      ledSuit: '♠' as Suit,
      trumpSuit: null,
      declarer: 'south' as PlayerId,
      gameMode: '4p' as const,
      difficulty: 'medium' as const,
      playedHistory: [],
      knownVoids: {}
    };

    // West follows against South (opponent): should play ♠A to beat ♠K
    const moveIdx = BridgeAI.getCardMove('west', hand, [0, 1], ctx);
    expect(hand[moveIdx].rank).toBe('A');
  });

  it('should play lowest card when following and partner is already winning', () => {
    const hand: Card[] = [
      { suit: '♠', rank: '2' },
      { suit: '♠', rank: 'A' }
    ];
    const ctx = {
      currentTrick: [{ player: 'north' as PlayerId, card: { suit: '♠' as Suit, rank: 'K' as const } }],
      ledSuit: '♠' as Suit,
      trumpSuit: null,
      declarer: 'north' as PlayerId,
      gameMode: '4p' as const,
      difficulty: 'medium' as const,
      playedHistory: [],
      knownVoids: {}
    };

    // South follows when partner North is already winning: should duck with lowest card (♠2)
    const moveIdx = BridgeAI.getCardMove('south', hand, [0, 1], ctx);
    expect(hand[moveIdx].rank).toBe('2');
  });
});
