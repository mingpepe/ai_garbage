import type {
  Card,
  Suit,
  Rank,
  PlayerId,
  Player4P,
  Player5P,
  GameMode,
  Difficulty,
  Bid,
  Contract,
  PartnerCall5P,
  GamePhase,
  HandScoreResult,
  PlayedCard,
  Denomination
} from './models';
import {
  SUITS,
  RANKS,
  RANK_VALUE,
  PLAYERS_4P,
  PLAYERS_5P,
  DENOMINATIONS_ORDER,
  PLAYER_NAMES_4P,
  PLAYER_NAMES_5P
} from './models';
import { BridgeAI } from './ai/BridgeAI';
import type { TrickContext } from './ai/BridgeAI';

export class BridgeEngine {
  public mode: GameMode = '4p';
  public difficulty: Difficulty = 'medium';
  public phase: GamePhase = 'bidding';

  // Hands of all players
  public hands: Record<PlayerId, Card[]> = {
    south: [],
    west: [],
    north: [],
    east: [],
    p2: [],
    p3: [],
    p4: [],
    p5: []
  };

  // Kitty cards for 5-player mode
  public kitty: Card[] = [];

  // Auction
  public dealerIndex: number = 0;
  public biddingTurnIndex: number = 0;
  public auctionHistory: Bid[] = [];
  public currentContractBid: { level: number; denomination: Denomination; bidder: PlayerId } | null = null;
  public consecutivePasses: number = 0;
  public isDoubled: boolean = false;
  public isRedoubled: boolean = false;
  public doubledBy: PlayerId | null = null;

  // Established Contract
  public contract: Contract | null = null;
  public dummyRevealed: boolean = false;

  // 5-player partner call
  public partnerCall: PartnerCall5P | null = null;

  // Trick Play
  public currentTrick: PlayedCard[] = [];
  public playedHistory: PlayedCard[][] = [];
  public ledSuit: Suit | null = null;
  public turnIndex: number = 0; // Current player in trick
  public tricksWon: Record<PlayerId, number> = {
    south: 0,
    west: 0,
    north: 0,
    east: 0,
    p2: 0,
    p3: 0,
    p4: 0,
    p5: 0
  };

  // Cumulative match score
  public matchScore: { team1: number; team2: number } = { team1: 0, team2: 0 };
  public lastHandResult: HandScoreResult | null = null;

  constructor(mode: GameMode = '4p', difficulty: Difficulty = 'medium') {
    this.mode = mode;
    this.difficulty = difficulty;
    this.startNewHand();
  }

  public get players(): PlayerId[] {
    return this.mode === '4p' ? PLAYERS_4P : PLAYERS_5P;
  }

  public get playerCount(): number {
    return this.players.length;
  }

  public getPlayerName(p: PlayerId): string {
    if (this.mode === '4p') {
      return PLAYER_NAMES_4P[p as Player4P] || p;
    }
    return PLAYER_NAMES_5P[p as Player5P] || p;
  }

  /**
   * Start a new hand
   */
  public startNewHand(): void {
    this.phase = 'bidding';
    this.currentTrick = [];
    this.playedHistory = [];
    this.ledSuit = null;
    this.dummyRevealed = false;
    this.partnerCall = null;
    this.contract = null;
    this.auctionHistory = [];
    this.currentContractBid = null;
    this.consecutivePasses = 0;
    this.isDoubled = false;
    this.isRedoubled = false;
    this.doubledBy = null;
    this.lastHandResult = null;

    // Reset tricks won
    for (const p of this.players) {
      this.tricksWon[p] = 0;
    }

    // Deal cards
    this.dealCards();

    // Set bidding turn starting from dealer
    this.biddingTurnIndex = this.dealerIndex % this.playerCount;
  }

  /**
   * Create and shuffle standard 52-card deck, then deal
   */
  public dealCards(): void {
    const deck: Card[] = [];
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        deck.push({ suit, rank });
      }
    }
    this.shuffle(deck);

    // Clear hands
    for (const p of [...PLAYERS_4P, ...PLAYERS_5P]) {
      this.hands[p] = [];
    }
    this.kitty = [];

    if (this.mode === '4p') {
      // 13 cards each for 4 players
      PLAYERS_4P.forEach((player, i) => {
        this.hands[player] = deck.slice(i * 13, (i + 1) * 13);
        this.sortHand(this.hands[player]);
      });
    } else {
      // 10 cards each for 5 players = 50 cards, 2 into kitty
      PLAYERS_5P.forEach((player, i) => {
        this.hands[player] = deck.slice(i * 10, (i + 1) * 10);
        this.sortHand(this.hands[player]);
      });
      this.kitty = deck.slice(50, 52);
    }
  }

  public sortHand(hand: Card[]): void {
    const suitOrder: Record<Suit, number> = { '♠': 0, '♥': 1, '♦': 2, '♣': 3 };
    hand.sort((a, b) => {
      if (a.suit !== b.suit) {
        return suitOrder[a.suit] - suitOrder[b.suit];
      }
      return RANK_VALUE[b.rank] - RANK_VALUE[a.rank];
    });
  }

  private shuffle(deck: Card[]): void {
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
  }

  // --- AUCTION / BIDDING PHASE ---

  public getCurrentBiddingPlayer(): PlayerId {
    return this.players[this.biddingTurnIndex % this.playerCount];
  }

  public canMakeBid(player: PlayerId, bid: Bid): { valid: boolean; reason?: string } {
    if (this.phase !== 'bidding') {
      return { valid: false, reason: '目前不是叫牌階段' };
    }
    if (this.getCurrentBiddingPlayer() !== player) {
      return { valid: false, reason: '還沒輪到你叫牌' };
    }

    if (bid.type === 'pass') {
      return { valid: true };
    }

    if (bid.type === 'bid') {
      if (!bid.level || !bid.denomination) {
        return { valid: false, reason: '請指定線位與花色' };
      }
      const maxLevel = this.mode === '4p' ? 7 : 5;
      if (bid.level < 1 || bid.level > maxLevel) {
        return { valid: false, reason: `線位必須在 1 到 ${maxLevel} 之間` };
      }

      if (this.currentContractBid) {
        const cmp = BridgeAI.compareBids(
          bid.level,
          bid.denomination,
          this.currentContractBid.level,
          this.currentContractBid.denomination
        );
        if (cmp <= 0) {
          return { valid: false, reason: '叫品必須高於當前最高叫牌' };
        }
      }
      return { valid: true };
    }

    if (bid.type === 'double') {
      if (!this.currentContractBid) {
        return { valid: false, reason: '目前無可賭倍之合約' };
      }
      if (this.isDoubled || this.isRedoubled) {
        return { valid: false, reason: '已經賭倍' };
      }
      // Check if opponent made the bid
      if (this.mode === '4p') {
        const partners: Record<string, string> = { north: 'south', south: 'north', east: 'west', west: 'east' };
        if (this.currentContractBid.bidder === player || this.currentContractBid.bidder === partners[player]) {
          return { valid: false, reason: '不能對自己搭檔的叫牌賭倍' };
        }
      } else {
        if (this.currentContractBid.bidder === player) {
          return { valid: false, reason: '不能對自己的叫牌賭倍' };
        }
      }
      return { valid: true };
    }

    if (bid.type === 'redouble') {
      if (!this.currentContractBid || !this.isDoubled || this.isRedoubled) {
        return { valid: false, reason: '目前無可再賭倍之合約' };
      }
      if (this.doubledBy === player) {
        return { valid: false, reason: '不能對自己發起的賭倍再賭倍' };
      }
      return { valid: true };
    }

    return { valid: false, reason: '無效叫品' };
  }

  public placeBid(bid: Bid): { success: boolean; auctionEnded: boolean; reason?: string } {
    const check = this.canMakeBid(bid.player, bid);
    if (!check.valid) {
      return { success: false, auctionEnded: false, reason: check.reason };
    }

    this.auctionHistory.push(bid);

    if (bid.type === 'pass') {
      this.consecutivePasses++;
    } else if (bid.type === 'bid') {
      this.currentContractBid = {
        level: bid.level!,
        denomination: bid.denomination!,
        bidder: bid.player
      };
      this.consecutivePasses = 0;
      this.isDoubled = false;
      this.isRedoubled = false;
      this.doubledBy = null;
    } else if (bid.type === 'double') {
      this.isDoubled = true;
      this.doubledBy = bid.player;
      this.consecutivePasses = 0;
    } else if (bid.type === 'redouble') {
      this.isRedoubled = true;
      this.consecutivePasses = 0;
    }

    // Check if auction is finished
    // In 4P: 3 consecutive passes after a bid ends auction. 4 passes initially redeals.
    // In 5P: 4 consecutive passes after a bid ends auction. 5 passes initially redeals.
    const passThreshold = this.mode === '4p' ? 3 : 4;
    const initialPassThreshold = this.playerCount;

    if (!this.currentContractBid && this.consecutivePasses >= initialPassThreshold) {
      // All passed out: redeal
      this.dealerIndex = (this.dealerIndex + 1) % this.playerCount;
      this.startNewHand();
      return { success: true, auctionEnded: true, reason: '全員 Pass，重新發牌！' };
    }

    if (this.currentContractBid && this.consecutivePasses >= passThreshold) {
      // Contract established!
      this.finalizeContract();
      return { success: true, auctionEnded: true };
    }

    // Advance bidding turn
    this.biddingTurnIndex++;
    return { success: true, auctionEnded: false };
  }

  /**
   * Finalize the contract and transition to the next phase
   */
  private finalizeContract(): void {
    if (!this.currentContractBid) return;

    const { level, denomination, bidder } = this.currentContractBid;
    let declarer = bidder;
    let dummy: PlayerId | undefined = undefined;

    if (this.mode === '4p') {
      // In 4-player standard bridge, declarer is the first player in the winning partnership
      // to bid the winning denomination.
      const partners: Record<string, string> = { north: 'south', south: 'north', east: 'west', west: 'east' };
      const partner = partners[bidder] as PlayerId;
      for (const b of this.auctionHistory) {
        if (b.type === 'bid' && b.denomination === denomination && (b.player === bidder || b.player === partner)) {
          declarer = b.player;
          break;
        }
      }
      dummy = partners[declarer] as PlayerId;
    }

    this.contract = {
      level,
      denomination,
      declarer,
      dummy,
      doubled: this.isDoubled,
      redoubled: this.isRedoubled
    };

    if (this.mode === '4p') {
      // 4P: Opening lead is made by the player to the left of Declarer
      const declarerIdx = this.players.indexOf(declarer);
      this.turnIndex = (declarerIdx + 1) % 4;
      this.phase = 'playing';
      this.dummyRevealed = false;
    } else {
      // 5P: Move to kitty exchange phase
      this.phase = 'kitty';
      // Declarer receives kitty
      this.hands[declarer].push(...this.kitty);
      this.sortHand(this.hands[declarer]);
    }
  }

  // --- 5-PLAYER KITTY & PARTNER CALL ---

  public exchangeKitty5P(discardIndices: number[]): { success: boolean; reason?: string } {
    if (this.phase !== 'kitty' || !this.contract) {
      return { success: false, reason: '非底牌交換階段' };
    }
    const declarer = this.contract.declarer;
    if (discardIndices.length !== 2 || discardIndices[0] === discardIndices[1]) {
      return { success: false, reason: '必須選擇兩張不同的牌埋入底牌' };
    }

    // Sort descending to splice safely
    const sortedIdx = [...discardIndices].sort((a, b) => b - a);
    if (sortedIdx[0] >= this.hands[declarer].length || sortedIdx[1] < 0) {
      return { success: false, reason: '選牌索引超出範圍' };
    }

    // Discard 2 cards
    this.hands[declarer].splice(sortedIdx[0], 1);
    this.hands[declarer].splice(sortedIdx[1], 1);
    this.sortHand(this.hands[declarer]);

    this.phase = 'calling_partner';
    return { success: true };
  }

  public callPartner5P(card: Card): { success: boolean; reason?: string } {
    if (this.phase !== 'calling_partner' || !this.contract) {
      return { success: false, reason: '非指定搭檔階段' };
    }

    // Find who holds this card
    let partnerId: PlayerId | null = null;
    for (const p of PLAYERS_5P) {
      if (this.hands[p].some(c => c.suit === card.suit && c.rank === card.rank)) {
        partnerId = p;
        break;
      }
    }

    this.partnerCall = {
      card,
      partnerPlayerId: partnerId,
      revealed: false // Revealed when card is played
    };

    // Transition to playing phase: In 5-Player bridge, Declarer leads trick 1
    this.phase = 'playing';
    this.turnIndex = this.players.indexOf(this.contract.declarer);

    return { success: true };
  }

  // --- TRICK PLAY PHASE ---

  public getCurrentPlayer(): PlayerId {
    return this.players[this.turnIndex % this.playerCount];
  }

  public getEffectivePlayer(): PlayerId {
    // In 4P, if dummy's turn, Declarer controls Dummy
    const current = this.getCurrentPlayer();
    if (this.mode === '4p' && this.contract && current === this.contract.dummy) {
      return this.contract.declarer;
    }
    return current;
  }

  public getLegalCardIndices(player: PlayerId): number[] {
    const hand = this.hands[player];
    const indices: number[] = [];
    if (!this.ledSuit) {
      return hand.map((_, i) => i);
    }
    const hasLedSuit = hand.some(c => c.suit === this.ledSuit);
    hand.forEach((card, i) => {
      if (!hasLedSuit || card.suit === this.ledSuit) {
        indices.push(i);
      }
    });
    return indices;
  }

  public canPlayCard(player: PlayerId, cardIndex: number): { valid: boolean; reason?: string } {
    if (this.phase !== 'playing') {
      return { valid: false, reason: '目前不是出牌階段' };
    }
    const currentPlayer = this.getCurrentPlayer();
    if (player !== currentPlayer) {
      return { valid: false, reason: '還沒輪到你出牌' };
    }

    const card = this.hands[player][cardIndex];
    if (!card) return { valid: false, reason: '無效卡牌' };

    if (this.ledSuit && card.suit !== this.ledSuit) {
      const hasLedSuit = this.hands[player].some(c => c.suit === this.ledSuit);
      if (hasLedSuit) {
        return { valid: false, reason: `必須跟出花色: ${this.ledSuit}` };
      }
    }
    return { valid: true };
  }

  public playCard(player: PlayerId, cardIndex: number): PlayedCard | null {
    const check = this.canPlayCard(player, cardIndex);
    if (!check.valid) return null;

    const card = this.hands[player].splice(cardIndex, 1)[0];
    if (!this.ledSuit) this.ledSuit = card.suit;

    const playedCard: PlayedCard = { player, card };
    this.currentTrick.push(playedCard);

    // If 4P and opening lead made, Dummy is revealed!
    if (this.mode === '4p' && !this.dummyRevealed) {
      this.dummyRevealed = true;
    }

    // If 5P, check if played card matches called partner card
    if (this.mode === '5p' && this.partnerCall && !this.partnerCall.revealed) {
      if (card.suit === this.partnerCall.card.suit && card.rank === this.partnerCall.card.rank) {
        this.partnerCall.revealed = true;
      }
    }

    // Advance turn
    this.turnIndex = (this.turnIndex + 1) % this.playerCount;
    return playedCard;
  }

  public evaluateTrick(): { winner: PlayerId; isHandEnd: boolean } {
    if (this.currentTrick.length !== this.playerCount) {
      throw new Error('Trick is not complete');
    }

    const trumpSuit = (this.contract && this.contract.denomination !== 'NT')
      ? (this.contract.denomination as Suit)
      : null;

    let winnerPlayed = this.currentTrick[0];
    for (let i = 1; i < this.currentTrick.length; i++) {
      const t = this.currentTrick[i];
      if (BridgeAI.cardBeats(t.card, winnerPlayed.card, this.ledSuit!, trumpSuit)) {
        winnerPlayed = t;
      }
    }

    const winner = winnerPlayed.player;
    this.tricksWon[winner]++;

    // Save completed trick to history
    this.playedHistory.push([...this.currentTrick]);
    this.currentTrick = [];
    this.ledSuit = null;
    this.turnIndex = this.players.indexOf(winner);

    // Check if hand ended
    const totalTricks = this.mode === '4p' ? 13 : 10;
    const isHandEnd = this.playedHistory.length === totalTricks;

    if (isHandEnd) {
      this.phase = 'hand_ended';
      this.calculateScore();
    }

    return { winner, isHandEnd };
  }

  /**
   * Calculate Bridge Score at the end of a hand
   */
  public calculateScore(): HandScoreResult {
    if (!this.contract) {
      throw new Error('No contract to score');
    }

    const totalTricks = this.mode === '4p' ? 13 : 10;
    const { level, denomination, declarer, doubled, redoubled } = this.contract;

    let declarerTricks = 0;
    let targetTricks = 0;

    if (this.mode === '4p') {
      const isDeclarerNS = (declarer === 'south' || declarer === 'north');
      const nsTricks = this.tricksWon.south + this.tricksWon.north;
      const ewTricks = this.tricksWon.west + this.tricksWon.east;
      declarerTricks = isDeclarerNS ? nsTricks : ewTricks;
      targetTricks = 6 + level;

      const diff = declarerTricks - targetTricks;
      const made = diff >= 0;

      let declarerScore = 0;
      let defenderScore = 0;

      if (made) {
        // Trick points
        let trickPtsPerTrick = 20; // ♣, ♦
        if (denomination === '♥' || denomination === '♠') trickPtsPerTrick = 30;
        let baseContractPts = 0;
        if (denomination === 'NT') {
          baseContractPts = 40 + (level - 1) * 30;
        } else {
          baseContractPts = level * trickPtsPerTrick;
        }

        if (doubled) baseContractPts *= 2;
        if (redoubled) baseContractPts *= 4;

        // Game bonus: Contract points >= 100 is game (300 non-vul)
        const gameBonus = baseContractPts >= 100 ? 300 : 50;

        // Overtricks
        let overtrickPts = 0;
        if (diff > 0) {
          if (doubled) overtrickPts = diff * 100;
          else if (redoubled) overtrickPts = diff * 200;
          else overtrickPts = diff * (denomination === '♣' || denomination === '♦' ? 20 : 30);
        }

        // Slam bonus
        let slamBonus = 0;
        if (level === 6) slamBonus = 500;
        if (level === 7) slamBonus = 1000;

        declarerScore = baseContractPts + gameBonus + overtrickPts + slamBonus;
        if (doubled) declarerScore += 50;
      } else {
        // Undertricks
        const down = Math.abs(diff);
        if (!doubled && !redoubled) {
          defenderScore = down * 50;
        } else if (doubled) {
          defenderScore = 100 + (down - 1) * 200;
        } else {
          defenderScore = 200 + (down - 1) * 400;
        }
      }

      // Update match score
      if (isDeclarerNS) {
        this.matchScore.team1 += declarerScore;
        this.matchScore.team2 += defenderScore;
      } else {
        this.matchScore.team2 += declarerScore;
        this.matchScore.team1 += defenderScore;
      }

      const summary = made
        ? `合約達成！莊家方取得 ${declarerTricks} 墩 (目標 ${targetTricks})，超額 ${diff} 墩，得 ${declarerScore} 分。`
        : `合約未成！莊家方取得 ${declarerTricks} 墩 (目標 ${targetTricks})，不足 ${Math.abs(diff)} 墩，防守方得 ${defenderScore} 分。`;

      this.lastHandResult = {
        contract: this.contract,
        tricksWon: { ...this.tricksWon },
        targetTricks,
        declarerTricks,
        made,
        tricksDiff: diff,
        declarerScore,
        defenderScore,
        summary
      };

      return this.lastHandResult;
    } else {
      // 5-Player Mode (找朋友制)
      targetTricks = 5 + level; // Level 1: 6 tricks, Level 2: 7 tricks, ... Level 5: 10 tricks
      const partner = this.partnerCall ? this.partnerCall.partnerPlayerId : null;
      declarerTricks = this.tricksWon[declarer];
      if (partner && partner !== declarer) {
        declarerTricks += this.tricksWon[partner];
      }

      const diff = declarerTricks - targetTricks;
      const made = diff >= 0;

      let declarerScore = 0;
      let defenderScore = 0;

      if (made) {
        declarerScore = level * 100 + diff * 50;
        this.matchScore.team1 += declarerScore;
      } else {
        const down = Math.abs(diff);
        defenderScore = down * 100;
        this.matchScore.team2 += defenderScore;
      }

      const partnerName = partner ? this.getPlayerName(partner) : '無';
      const summary = made
        ? `合約達成！莊家 (${this.getPlayerName(declarer)}) 與搭檔 (${partnerName}) 合計取得 ${declarerTricks} 墩 (目標 ${targetTricks})，超額 ${diff} 墩！莊家方得 ${declarerScore} 分。`
        : `合約未成！莊家 (${this.getPlayerName(declarer)}) 與搭檔 (${partnerName}) 僅取得 ${declarerTricks} 墩 (目標 ${targetTricks})，不足 ${Math.abs(diff)} 墩！防守方得 ${defenderScore} 分。`;

      this.lastHandResult = {
        contract: this.contract,
        tricksWon: { ...this.tricksWon },
        targetTricks,
        declarerTricks,
        made,
        tricksDiff: diff,
        declarerScore,
        defenderScore,
        summary
      };

      return this.lastHandResult;
    }
  }

  // --- AI ACTIONS ---

  public getAiBid(player: PlayerId): Bid {
    return BridgeAI.getBid(
      player,
      this.hands[player],
      this.mode,
      this.difficulty,
      this.auctionHistory,
      this.currentContractBid
    );
  }

  public getAiKittyDiscards(): number[] {
    if (!this.contract) return [0, 1];
    const trumpSuit = this.contract.denomination !== 'NT' ? (this.contract.denomination as Suit) : null;
    return BridgeAI.selectKittyDiscards(this.hands[this.contract.declarer], trumpSuit);
  }

  public getAiPartnerCall(): Card {
    if (!this.contract) return { suit: '♠', rank: 'A' };
    const trumpSuit = this.contract.denomination !== 'NT' ? (this.contract.denomination as Suit) : null;
    return BridgeAI.selectPartnerCard(this.hands[this.contract.declarer], trumpSuit);
  }

  public getAiCardMove(player: PlayerId): number {
    const legalIndices = this.getLegalCardIndices(player);
    const trumpSuit = (this.contract && this.contract.denomination !== 'NT')
      ? (this.contract.denomination as Suit)
      : null;

    const ctx: TrickContext = {
      currentTrick: this.currentTrick,
      ledSuit: this.ledSuit,
      trumpSuit,
      declarer: this.contract ? this.contract.declarer : 'south',
      dummy: this.contract ? this.contract.dummy : undefined,
      partner: this.partnerCall ? this.partnerCall.partnerPlayerId : undefined,
      gameMode: this.mode,
      difficulty: this.difficulty,
      playedHistory: this.playedHistory,
      knownVoids: {}
    };

    return BridgeAI.getCardMove(player, this.hands[player], legalIndices, ctx);
  }
}
