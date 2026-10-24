import type {
  Card,
  Suit,
  Rank,
  PlayerId,
  GameMode,
  Difficulty,
  Bid,
  Contract,
  PlayedCard,
  Denomination
} from '../models';
import {
  SUITS,
  RANKS,
  RANK_VALUE,
  HIGH_CARD_POINTS,
  DENOMINATIONS_ORDER
} from '../models';

export interface TrickContext {
  currentTrick: PlayedCard[];
  ledSuit: Suit | null;
  trumpSuit: Suit | null;
  declarer: PlayerId;
  dummy?: PlayerId;
  partner?: PlayerId | null; // For 5P
  gameMode: GameMode;
  difficulty: Difficulty;
  playedHistory: PlayedCard[][]; // Previous completed tricks
  knownVoids: Record<string, Set<Suit>>; // Track voids for hard AI
}

export class BridgeAI {
  /**
   * Calculate High Card Points (HCP) for a hand
   */
  public static calculateHCP(hand: Card[]): number {
    return hand.reduce((sum, card) => sum + (HIGH_CARD_POINTS[card.rank] || 0), 0);
  }

  /**
   * Group hand cards by suit
   */
  public static groupBySuit(hand: Card[]): Record<Suit, Card[]> {
    const groups: Record<Suit, Card[]> = { '♠': [], '♥': [], '♦': [], '♣': [] };
    for (const card of hand) {
      groups[card.suit].push(card);
    }
    // Sort each suit descending by rank
    for (const s of SUITS) {
      groups[s].sort((a, b) => RANK_VALUE[b.rank] - RANK_VALUE[a.rank]);
    }
    return groups;
  }

  /**
   * Calculate distribution points (for medium/hard bidding)
   */
  public static calculateDistributionPoints(hand: Card[]): number {
    const groups = this.groupBySuit(hand);
    let pts = 0;
    for (const s of SUITS) {
      const len = groups[s].length;
      if (len > 4) pts += (len - 4); // +1 for 5th, +2 for 6th...
      if (len === 0) pts += 3;       // Void
      else if (len === 1) pts += 2;  // Singleton
      else if (len === 2) pts += 1;  // Doubleton
    }
    return pts;
  }

  /**
   * Compare two bids. Returns >0 if b1 > b2, <0 if b1 < b2, 0 if equal
   */
  public static compareBids(level1: number, denom1: Denomination, level2: number, denom2: Denomination): number {
    if (level1 !== level2) {
      return level1 - level2;
    }
    const idx1 = DENOMINATIONS_ORDER.indexOf(denom1);
    const idx2 = DENOMINATIONS_ORDER.indexOf(denom2);
    return idx1 - idx2;
  }

  /**
   * Determine AI's bid during auction
   */
  public static getBid(
    player: PlayerId,
    hand: Card[],
    mode: GameMode,
    difficulty: Difficulty,
    auctionHistory: Bid[],
    currentContract: { level: number; denomination: Denomination; bidder: PlayerId } | null
  ): Bid {
    if (mode === '4p') {
      return this.getBid4P(player, hand, difficulty, auctionHistory, currentContract);
    } else {
      return this.getBid5P(player, hand, difficulty, auctionHistory, currentContract);
    }
  }

  /**
   * Bidding logic for 4-Player Standard Bridge
   */
  private static getBid4P(
    player: PlayerId,
    hand: Card[],
    difficulty: Difficulty,
    auctionHistory: Bid[],
    currentContract: { level: number; denomination: Denomination; bidder: PlayerId } | null
  ): Bid {
    const hcp = this.calculateHCP(hand);
    const suitGroups = this.groupBySuit(hand);
    const partners: Record<string, string> = { north: 'south', south: 'north', east: 'west', west: 'east' };
    const myPartner = partners[player];

    // Find longest suit
    let longestSuit: Suit = '♠';
    let maxLen = -1;
    for (const s of ['♠', '♥', '♦', '♣'] as Suit[]) {
      if (suitGroups[s].length > maxLen) {
        maxLen = suitGroups[s].length;
        longestSuit = s;
      }
    }

    // Easy AI: Simple rule-based bidding
    if (difficulty === 'easy') {
      if (!currentContract) {
        if (hcp >= 13) {
          return { type: 'bid', player, level: 1, denomination: longestSuit };
        }
        return { type: 'pass', player };
      }

      // If already bid, only overcall if very strong
      if (hcp >= 16 && currentContract.level < 3) {
        const nextLevel = this.compareBids(currentContract.level, longestSuit, currentContract.level, currentContract.denomination) > 0
          ? currentContract.level
          : currentContract.level + 1;
        if (nextLevel <= 3) {
          return { type: 'bid', player, level: nextLevel, denomination: longestSuit };
        }
      }
      return { type: 'pass', player };
    }

    // Medium & Hard AI: Standard American Bridge Conventions
    const totalPts = hcp + (difficulty === 'hard' ? this.calculateDistributionPoints(hand) : 0);
    const isBalanced = SUITS.every(s => suitGroups[s].length >= 2) && SUITS.filter(s => suitGroups[s].length === 2).length <= 1;

    // Check partner's previous bids
    const partnerBids = auctionHistory.filter(b => b.player === myPartner && b.type === 'bid');
    const partnerLastBid = partnerBids.length > 0 ? partnerBids[partnerBids.length - 1] : null;

    if (!currentContract) {
      // Opening bid
      if (hcp >= 15 && hcp <= 17 && isBalanced) {
        return { type: 'bid', player, level: 1, denomination: 'NT' };
      }
      if (totalPts >= 12) {
        // Open 5-card major if available
        if (suitGroups['♠'].length >= 5) return { type: 'bid', player, level: 1, denomination: '♠' };
        if (suitGroups['♥'].length >= 5) return { type: 'bid', player, level: 1, denomination: '♥' };
        // Otherwise better minor
        const minor = suitGroups['♦'].length >= suitGroups['♣'].length ? '♦' : '♣';
        return { type: 'bid', player, level: 1, denomination: minor };
      }
      // Weak two / Preempt with 6-7 card suit and 6-10 HCP
      if (difficulty === 'hard' && hcp >= 6 && hcp <= 10 && maxLen >= 7) {
        return { type: 'bid', player, level: 3, denomination: longestSuit };
      }
      return { type: 'pass', player };
    }

    // Partner opened or responded
    if (partnerLastBid && partnerLastBid.denomination) {
      const pDenom = partnerLastBid.denomination;
      const pLevel = partnerLastBid.level || 1;

      // Fit in partner's major suit
      if (pDenom !== 'NT' && suitGroups[pDenom as Suit].length >= 3) {
        const fitSuit = pDenom as Suit;
        if (totalPts >= 13 && currentContract.level < 4) {
          const targetLevel = (fitSuit === '♠' || fitSuit === '♥') ? 4 : 5;
          const nextBidLevel = Math.max(targetLevel, currentContract.level + 1);
          if (nextBidLevel <= 4) {
            return { type: 'bid', player, level: nextBidLevel, denomination: fitSuit };
          }
        } else if (totalPts >= 10 && currentContract.level < 3) {
          return { type: 'bid', player, level: Math.max(pLevel + 1, currentContract.level + 1), denomination: fitSuit };
        } else if (totalPts >= 6 && currentContract.level < 2) {
          return { type: 'bid', player, level: 2, denomination: fitSuit };
        }
      }

      // Partner opened 1NT
      if (pDenom === 'NT') {
        if (hcp >= 10 && currentContract.level < 3) {
          return { type: 'bid', player, level: 3, denomination: 'NT' };
        }
        if (hcp >= 8 && currentContract.level < 2) {
          return { type: 'bid', player, level: 2, denomination: 'NT' };
        }
      }
    }

    // Competitive bidding / Overcalls
    const opponentBid = currentContract.bidder !== myPartner && currentContract.bidder !== player;
    if (opponentBid) {
      // Hard AI Takeout Double
      if (difficulty === 'hard' && currentContract.level === 1 && hcp >= 12 && currentContract.denomination !== 'NT') {
        const oppSuit = currentContract.denomination as Suit;
        if (suitGroups[oppSuit].length <= 2) {
          const otherSuitsHave3 = SUITS.filter(s => s !== oppSuit).every(s => suitGroups[s].length >= 3);
          if (otherSuitsHave3) {
            return { type: 'double', player };
          }
        }
      }

      // Standard Overcall: 10+ HCP and 5+ card suit
      if (totalPts >= 11 && maxLen >= 5 && currentContract.level <= 3) {
        const canBidSameLevel = this.compareBids(currentContract.level, longestSuit, currentContract.level, currentContract.denomination) > 0;
        const bidLevel = canBidSameLevel ? currentContract.level : currentContract.level + 1;
        if (bidLevel <= 3) {
          return { type: 'bid', player, level: bidLevel, denomination: longestSuit };
        }
      }
    }

    return { type: 'pass', player };
  }

  /**
   * Bidding logic for 5-Player Bridge (找朋友制)
   * 10 cards per player. Levels 1 to 5 (needs 6 to 10 tricks). Average HCP = 8.
   */
  private static getBid5P(
    player: PlayerId,
    hand: Card[],
    difficulty: Difficulty,
    auctionHistory: Bid[],
    currentContract: { level: number; denomination: Denomination; bidder: PlayerId } | null
  ): Bid {
    const hcp = this.calculateHCP(hand);
    const suitGroups = this.groupBySuit(hand);

    let longestSuit: Suit = '♠';
    let maxLen = -1;
    for (const s of SUITS) {
      if (suitGroups[s].length > maxLen) {
        maxLen = suitGroups[s].length;
        longestSuit = s;
      }
    }

    // In 5-player, 10 cards total. 10+ HCP is above average!
    if (difficulty === 'easy') {
      if (!currentContract) {
        if (hcp >= 10 && maxLen >= 4) {
          return { type: 'bid', player, level: 1, denomination: longestSuit };
        }
        return { type: 'pass', player };
      }
      if (hcp >= 14 && currentContract.level < 2) {
        const canSame = this.compareBids(currentContract.level, longestSuit, currentContract.level, currentContract.denomination) > 0;
        const nextLvl = canSame ? currentContract.level : currentContract.level + 1;
        if (nextLvl <= 2) {
          return { type: 'bid', player, level: nextLvl, denomination: longestSuit };
        }
      }
      return { type: 'pass', player };
    }

    // Medium & Hard 5P Bidding
    const bonus = difficulty === 'hard' ? (maxLen >= 5 ? 2 : 0) : 0;
    const effectivePts = hcp + bonus;

    if (!currentContract) {
      if (effectivePts >= 16) return { type: 'bid', player, level: 2, denomination: maxLen >= 5 ? longestSuit : 'NT' };
      if (effectivePts >= 10) return { type: 'bid', player, level: 1, denomination: longestSuit };
      return { type: 'pass', player };
    }

    // We have a contract already on the board
    const currentLvl = currentContract.level;
    const canBidAtCurrentLevel = this.compareBids(currentLvl, longestSuit, currentLvl, currentContract.denomination) > 0;
    const nextLevel = canBidAtCurrentLevel ? currentLvl : currentLvl + 1;

    if (nextLevel <= 4) {
      if (nextLevel === 1 && effectivePts >= 11) {
        return { type: 'bid', player, level: 1, denomination: longestSuit };
      }
      if (nextLevel === 2 && effectivePts >= 13) {
        return { type: 'bid', player, level: 2, denomination: longestSuit };
      }
      if (nextLevel === 3 && effectivePts >= 16) {
        return { type: 'bid', player, level: 3, denomination: longestSuit };
      }
      if (nextLevel === 4 && effectivePts >= 19) {
        return { type: 'bid', player, level: 4, denomination: longestSuit };
      }
    }

    return { type: 'pass', player };
  }

  /**
   * 5-Player Kitty discard selection (Declarer discards 2 cards from 12 cards)
   */
  public static selectKittyDiscards(hand: Card[], trumpSuit: Suit | null): number[] {
    // Score cards to find the 2 least valuable cards to discard
    // Keep trumps, keep Aces and Kings, discard low cards in short side suits
    const indices = hand.map((_, i) => i);
    indices.sort((i1, i2) => {
      const c1 = hand[i1];
      const c2 = hand[i2];

      const scoreCard = (c: Card): number => {
        let s = RANK_VALUE[c.rank];
        if (c.suit === trumpSuit) s += 100; // Strongly preserve trumps
        if (c.rank === 'A') s += 30;
        if (c.rank === 'K') s += 20;
        return s;
      };

      return scoreCard(c1) - scoreCard(c2); // Ascending: lowest score first
    });

    return [indices[0], indices[1]].sort((a, b) => b - a); // Higher index first for safe splicing
  }

  /**
   * 5-Player Partner Call: Declarer chooses a card they don't hold to call as partner
   */
  public static selectPartnerCard(hand: Card[], trumpSuit: Suit | null): Card {
    const hasCard = (suit: Suit, rank: Rank) => hand.some(c => c.suit === suit && c.rank === rank);

    // 1. Try to call the Ace of a side suit where AI has King or Queen
    const sideSuits = SUITS.filter(s => s !== trumpSuit);
    for (const suit of sideSuits) {
      if (hand.some(c => c.suit === suit && (c.rank === 'K' || c.rank === 'Q')) && !hasCard(suit, 'A')) {
        return { suit, rank: 'A' };
      }
    }

    // 2. Call the Ace of any side suit not held
    for (const suit of sideSuits) {
      if (!hasCard(suit, 'A')) {
        return { suit, rank: 'A' };
      }
    }

    // 3. Call trump Ace if not held
    if (trumpSuit && !hasCard(trumpSuit, 'A')) {
      return { suit: trumpSuit, rank: 'A' };
    }

    // 4. Call King of Spades or any high card not held
    for (const rank of ['K', 'Q', 'J'] as Rank[]) {
      for (const suit of SUITS) {
        if (!hasCard(suit, rank)) {
          return { suit, rank };
        }
      }
    }

    return { suit: '♠', rank: 'A' };
  }

  /**
   * Determine AI's card play during trick
   */
  public static getCardMove(
    player: PlayerId,
    hand: Card[],
    legalIndices: number[],
    ctx: TrickContext
  ): number {
    if (legalIndices.length === 1) {
      return legalIndices[0];
    }

    const { difficulty, currentTrick, ledSuit, trumpSuit } = ctx;

    // Easy AI: random legal card
    if (difficulty === 'easy') {
      const randIdx = Math.floor(Math.random() * legalIndices.length);
      return legalIndices[randIdx];
    }

    // If Leading (First card of trick)
    if (currentTrick.length === 0) {
      return this.chooseLeadCard(player, hand, legalIndices, ctx);
    }

    // Following to trick
    return this.chooseFollowCard(player, hand, legalIndices, ctx);
  }

  /**
   * Choose card to lead
   */
  private static chooseLeadCard(
    player: PlayerId,
    hand: Card[],
    legalIndices: number[],
    ctx: TrickContext
  ): number {
    const { trumpSuit, declarer, difficulty, playedHistory } = ctx;
    const isDeclarerSide = (player === declarer) || (ctx.gameMode === '4p' && ctx.dummy === player);

    // Hard AI Declarer: Draw trumps if holding trump majority
    if (difficulty === 'hard' && isDeclarerSide && trumpSuit) {
      const trumpIndices = legalIndices.filter(i => hand[i].suit === trumpSuit);
      // Count how many trumps have been played
      let trumpsPlayed = 0;
      for (const trick of playedHistory) {
        for (const p of trick) {
          if (p.card.suit === trumpSuit) trumpsPlayed++;
        }
      }
      const trumpsInHand = trumpIndices.length;
      const totalTrumps = 13;
      const trumpsOutstanding = totalTrumps - trumpsPlayed - trumpsInHand;

      if (trumpsOutstanding > 0 && trumpsInHand >= 2) {
        // Lead highest trump to draw enemy trumps
        trumpIndices.sort((a, b) => RANK_VALUE[hand[b].rank] - RANK_VALUE[hand[a].rank]);
        return trumpIndices[0];
      }
    }

    // Look for top of sequence (e.g., KQJ, QJ10)
    for (const idx of legalIndices) {
      const c = hand[idx];
      const sameSuit = hand.filter(other => other.suit === c.suit);
      const val = RANK_VALUE[c.rank];
      const hasNextLower = sameSuit.some(other => RANK_VALUE[other.rank] === val - 1);
      const hasNextHigher = sameSuit.some(other => RANK_VALUE[other.rank] === val + 1);

      // Top of sequence: has lower honor, but no higher
      if (val >= 11 && hasNextLower && !hasNextHigher) {
        return idx;
      }
    }

    // Lead high card of non-trump suit (or lowest if trying to finesse)
    const nonTrumpIndices = legalIndices.filter(i => hand[i].suit !== trumpSuit);
    const candidateIndices = nonTrumpIndices.length > 0 ? nonTrumpIndices : legalIndices;

    if (difficulty === 'hard') {
      // Prefer leading from longest suit
      const suitCounts: Record<Suit, number> = { '♠': 0, '♥': 0, '♦': 0, '♣': 0 };
      hand.forEach(c => suitCounts[c.suit]++);
      candidateIndices.sort((a, b) => {
        const lenDiff = suitCounts[hand[b].suit] - suitCounts[hand[a].suit];
        if (lenDiff !== 0) return lenDiff;
        return RANK_VALUE[hand[b].rank] - RANK_VALUE[hand[a].rank];
      });
      return candidateIndices[0];
    }

    // Medium: lead highest card available in candidates
    candidateIndices.sort((a, b) => RANK_VALUE[hand[b].rank] - RANK_VALUE[hand[a].rank]);
    return candidateIndices[0];
  }

  /**
   * Choose card when following
   */
  private static chooseFollowCard(
    player: PlayerId,
    hand: Card[],
    legalIndices: number[],
    ctx: TrickContext
  ): number {
    const { currentTrick, ledSuit, trumpSuit, difficulty } = ctx;

    // Determine current winning card in trick
    let currentBest = currentTrick[0];
    for (let i = 1; i < currentTrick.length; i++) {
      const cand = currentTrick[i];
      if (this.cardBeats(cand.card, currentBest.card, ledSuit!, trumpSuit)) {
        currentBest = cand;
      }
    }

    // Determine if partner is currently winning
    const isPartner = this.isTeammate(player, currentBest.player, ctx);

    // Case 1: Can follow suit
    const suitIndices = legalIndices.filter(i => hand[i].suit === ledSuit);
    if (suitIndices.length > 0) {
      if (isPartner) {
        // Partner is winning: play lowest card (conserve honor)
        return suitIndices.reduce((minI, currI) =>
          RANK_VALUE[hand[currI].rank] < RANK_VALUE[hand[minI].rank] ? currI : minI
        );
      } else {
        // Opponent is winning: try to beat them
        const winningCards = suitIndices.filter(i =>
          this.cardBeats(hand[i], currentBest.card, ledSuit!, trumpSuit)
        );

        if (winningCards.length > 0) {
          // Play the lowest winning card (efficiency)
          return winningCards.reduce((minI, currI) =>
            RANK_VALUE[hand[currI].rank] < RANK_VALUE[hand[minI].rank] ? currI : minI
          );
        } else {
          // Cannot win: play lowest card of the suit
          return suitIndices.reduce((minI, currI) =>
            RANK_VALUE[hand[currI].rank] < RANK_VALUE[hand[minI].rank] ? currI : minI
          );
        }
      }
    }

    // Case 2: Void in led suit (can Trump or Discard)
    const trumpIndices = legalIndices.filter(i => hand[i].suit === trumpSuit);

    if (trumpIndices.length > 0 && !isPartner) {
      // Opponent is winning, consider ruffing (trumping)
      const winningTrumps = trumpIndices.filter(i =>
        this.cardBeats(hand[i], currentBest.card, ledSuit!, trumpSuit)
      );
      if (winningTrumps.length > 0) {
        // Ruff with lowest winning trump
        return winningTrumps.reduce((minI, currI) =>
          RANK_VALUE[hand[currI].rank] < RANK_VALUE[hand[minI].rank] ? currI : minI
        );
      }
    }

    // Sluff (discard lowest non-trump card)
    const nonTrumps = legalIndices.filter(i => hand[i].suit !== trumpSuit);
    const discardPool = nonTrumps.length > 0 ? nonTrumps : legalIndices;

    return discardPool.reduce((minI, currI) =>
      RANK_VALUE[hand[currI].rank] < RANK_VALUE[hand[minI].rank] ? currI : minI
    );
  }

  /**
   * Helper: Does cardA beat cardB given led suit and trump?
   */
  public static cardBeats(cardA: Card, cardB: Card, ledSuit: Suit, trumpSuit: Suit | null): boolean {
    if (trumpSuit) {
      if (cardA.suit === trumpSuit && cardB.suit !== trumpSuit) return true;
      if (cardB.suit === trumpSuit && cardA.suit !== trumpSuit) return false;
      if (cardA.suit === trumpSuit && cardB.suit === trumpSuit) {
        return RANK_VALUE[cardA.rank] > RANK_VALUE[cardB.rank];
      }
    }

    // Neither is trump (or NT)
    if (cardA.suit === ledSuit && cardB.suit !== ledSuit) return true;
    if (cardB.suit === ledSuit && cardA.suit !== ledSuit) return false;
    if (cardA.suit === ledSuit && cardB.suit === ledSuit) {
      return RANK_VALUE[cardA.rank] > RANK_VALUE[cardB.rank];
    }

    return false;
  }

  /**
   * Check if playerA and playerB are teammates
   */
  private static isTeammate(pA: PlayerId, pB: PlayerId, ctx: TrickContext): boolean {
    if (pA === pB) return true;

    if (ctx.gameMode === '4p') {
      const partners: Record<string, string> = { north: 'south', south: 'north', east: 'west', west: 'east' };
      return partners[pA] === pB;
    } else {
      // 5-player mode
      const { declarer, partner } = ctx;
      if (!partner) {
        // Partner not revealed yet to public, but if pA is partner or declarer:
        if (pA === declarer && pB === partner) return true;
        if (pA === partner && pB === declarer) return true;
        return false;
      }
      const isADeclarerSide = (pA === declarer || pA === partner);
      const isBDeclarerSide = (pB === declarer || pB === partner);
      return isADeclarerSide === isBDeclarerSide;
    }
  }
}
