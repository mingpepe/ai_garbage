import type { Card, Player, PlayedCard, Suit } from './models';
import { RANK_VALUE, SUITS, RANKS, PLAYERS } from './models';

export class BridgeEngine {
  public hands: Record<Player, Card[]> = {
    north: [],
    east: [],
    south: [],
    west: []
  };
  public currentTrick: PlayedCard[] = [];
  public score: Record<'ns' | 'ew', number> = { ns: 0, ew: 0 };
  public turnIndex: number = 2; // Default to South
  public ledSuit: Suit | null = null;
  public gameOver: boolean = false;

  constructor() {
    this.initGame();
  }

  public initGame(): void {
    const deck: Card[] = [];
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        deck.push({ suit, rank });
      }
    }
    this.shuffle(deck);
    
    PLAYERS.forEach((player, i) => {
      this.hands[player] = deck.slice(i * 13, (i + 1) * 13);
      this.sortHand(this.hands[player]);
    });
    
    this.currentTrick = [];
    this.score = { ns: 0, ew: 0 };
    this.turnIndex = 2; // South starts
    this.ledSuit = null;
    this.gameOver = false;
  }

  private sortHand(hand: Card[]): void {
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

  public getCurrentPlayer(): Player {
    return PLAYERS[this.turnIndex];
  }

  public canPlayCard(player: Player, cardIndex: number): { valid: boolean; reason?: string } {
    if (this.getCurrentPlayer() !== player) {
      return { valid: false, reason: "Not your turn" };
    }
    const card = this.hands[player][cardIndex];
    if (!card) return { valid: false, reason: "Invalid card index" };

    if (this.ledSuit && card.suit !== this.ledSuit) {
      const hasLedSuit = this.hands[player].some(c => c.suit === this.ledSuit);
      if (hasLedSuit) {
        return { valid: false, reason: `Must follow suit: ${this.ledSuit}` };
      }
    }
    return { valid: true };
  }

  public playCard(player: Player, cardIndex: number): PlayedCard | null {
    const check = this.canPlayCard(player, cardIndex);
    if (!check.valid) return null;

    const card = this.hands[player].splice(cardIndex, 1)[0];
    if (!this.ledSuit) this.ledSuit = card.suit;

    const playedCard: PlayedCard = { player, card };
    this.currentTrick.push(playedCard);
    
    this.turnIndex = (this.turnIndex + 1) % 4;
    return playedCard;
  }

  public evaluateTrick(): { winner: Player; scoreUpdated: boolean } {
    if (this.currentTrick.length !== 4) {
      throw new Error("Trick is not complete");
    }

    let winnerPlayed = this.currentTrick[0];
    for (let i = 1; i < this.currentTrick.length; i++) {
      const t = this.currentTrick[i];
      if (t.card.suit === this.ledSuit && RANK_VALUE[t.card.rank] > RANK_VALUE[winnerPlayed.card.rank]) {
        winnerPlayed = t;
      }
    }

    const winner = winnerPlayed.player;
    if (winner === 'north' || winner === 'south') {
      this.score.ns++;
    } else {
      this.score.ew++;
    }

    this.currentTrick = [];
    this.ledSuit = null;
    this.turnIndex = PLAYERS.indexOf(winner);

    if (this.hands.south.length === 0) {
      this.gameOver = true;
    }

    return { winner, scoreUpdated: true };
  }

  public getAiMove(player: Player): number {
    const hand = this.hands[player];
    
    // If the current player is the leader of this trick
    if (this.currentTrick.length === 0) {
      // Simple strategy: play the highest rank available in hand
      let bestIdx = 0;
      for (let i = 1; i < hand.length; i++) {
        if (RANK_VALUE[hand[i].rank] > RANK_VALUE[hand[bestIdx].rank]) {
          bestIdx = i;
        }
      }
      return bestIdx;
    }

    // If the player is following the lead
    const ledSuit = this.ledSuit!;
    const cardsOfSuitIndexes = hand.map((c, i) => c.suit === ledSuit ? i : -1).filter(i => i !== -1);
    
    // Determine who is currently winning the trick
    let currentBest = this.currentTrick[0];
    for (let i = 1; i < this.currentTrick.length; i++) {
      const t = this.currentTrick[i];
      if (t.card.suit === ledSuit && RANK_VALUE[t.card.rank] > RANK_VALUE[currentBest.card.rank]) {
        currentBest = t;
      }
    }

    // Check if the current winner is the player's partner
    const partners: Record<Player, Player> = { north: 'south', south: 'north', east: 'west', west: 'east' };
    const partnerIsWinning = currentBest.player === partners[player];

    if (cardsOfSuitIndexes.length > 0) {
      if (partnerIsWinning) {
        // Partner is winning, play the lowest card to conserve strength
        return cardsOfSuitIndexes.reduce((minIdx, currIdx) => 
          RANK_VALUE[hand[currIdx].rank] < RANK_VALUE[hand[minIdx].rank] ? currIdx : minIdx
        );
      } else {
        // Opponent is winning, try to beat them
        const winningCards = cardsOfSuitIndexes.filter(i => RANK_VALUE[hand[i].rank] > RANK_VALUE[currentBest.card.rank]);
        if (winningCards.length > 0) {
          // Play the smallest card that can win (efficiency)
          return winningCards.reduce((minIdx, currIdx) => 
            RANK_VALUE[hand[currIdx].rank] < RANK_VALUE[hand[minIdx].rank] ? currIdx : minIdx
          );
        } else {
          // Cannot win, play the lowest card of the suit
          return cardsOfSuitIndexes.reduce((minIdx, currIdx) => 
            RANK_VALUE[hand[currIdx].rank] < RANK_VALUE[hand[minIdx].rank] ? currIdx : minIdx
          );
        }
      }
    } else {
      // Void in suit, discard the lowest rank in hand (across all suits)
      let smallestIdx = 0;
      for (let i = 1; i < hand.length; i++) {
        if (RANK_VALUE[hand[i].rank] < RANK_VALUE[hand[smallestIdx].rank]) {
          smallestIdx = i;
        }
      }
      return smallestIdx;
    }
  }
}
