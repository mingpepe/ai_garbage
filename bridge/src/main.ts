import { BridgeEngine } from './BridgeEngine';
import type { Player, Card } from './models';
import { PLAYERS } from './models';

class BridgeUI {
  private engine: BridgeEngine;
  private elements: Record<Player, HTMLElement>;
  private scoreNS: HTMLElement;
  private scoreEW: HTMLElement;
  private status: HTMLElement;
  private playArea: HTMLElement;
  private cheatCodes: { teammate: boolean; opponent: boolean } = { teammate: false, opponent: false };
  private inputBuffer: string = "";

  constructor() {
    this.engine = new BridgeEngine();
    this.elements = {
      north: document.getElementById('north')!,
      east: document.getElementById('east')!,
      south: document.getElementById('south')!,
      west: document.getElementById('west')!
    };
    this.scoreNS = document.getElementById('score-ns')!;
    this.scoreEW = document.getElementById('score-ew')!;
    this.status = document.getElementById('status')!;
    this.playArea = document.getElementById('play-area')!;

    this.setupCheats();
    this.renderAll();
  }

  private setupCheats(): void {
    window.addEventListener('keydown', (e) => {
      this.inputBuffer += e.key.toLowerCase();
      this.inputBuffer = this.inputBuffer.slice(-20); // Keep last 20 characters in buffer

      if (this.inputBuffer.endsWith('teammate')) {
        this.cheatCodes.teammate = !this.cheatCodes.teammate;
        this.status.innerText = `[Cheat] Teammate Vision: ${this.cheatCodes.teammate ? 'ON' : 'OFF'}`;
        this.renderAll();
      } else if (this.inputBuffer.endsWith('opponent')) {
        this.cheatCodes.opponent = !this.cheatCodes.opponent;
        this.status.innerText = `[Cheat] Opponent Vision: ${this.cheatCodes.opponent ? 'ON' : 'OFF'}`;
        this.renderAll();
      }
    });
  }

  private renderAll(): void {
    const currentPlayer = this.engine.getCurrentPlayer();
    
    PLAYERS.forEach(p => {
      const el = this.elements[p];
      el.innerHTML = '';
      el.classList.toggle('active-turn', currentPlayer === p);
      
      // Card visibility logic (Cheat mode support)
      const isVisible = p === 'south' || 
                       (p === 'north' && this.cheatCodes.teammate) ||
                       ((p === 'east' || p === 'west') && this.cheatCodes.opponent);

      this.engine.hands[p].forEach((card, i) => {
        const div = document.createElement('div');
        const isRed = (card.suit === '♥' || card.suit === '♦');
        
        if (isVisible) {
          div.className = `card ${isRed ? 'red' : ''}`;
          div.innerHTML = `<span>${card.rank}</span><span>${card.suit}</span>`;
          if (p === 'south') {
            div.onclick = () => this.handlePlay('south', i);
          }
        } else {
          div.className = `card hidden`; 
        }
        el.appendChild(div);
      });
    });
  }

  private handlePlay(player: Player, cardIndex: number): void {
    const check = this.engine.canPlayCard(player, cardIndex);
    if (!check.valid) {
      if (player === 'south') alert(check.reason);
      return;
    }

    const played = this.engine.playCard(player, cardIndex);
    if (played) {
      this.renderPlayedCard(played.player, played.card);
      this.renderAll();

      if (this.engine.currentTrick.length === 4) {
        setTimeout(() => this.completeTrick(), 1000);
      } else {
        const nextPlayer = this.engine.getCurrentPlayer();
        if (nextPlayer !== 'south') {
          setTimeout(() => this.aiMove(), 600);
        }
      }
    }
  }

  private renderPlayedCard(player: Player, card: Card): void {
    const isRed = (card.suit === '♥' || card.suit === '♦');
    const cDiv = document.createElement('div');
    cDiv.className = `played-card p-${player[0]} ${isRed ? 'red' : ''}`;
    cDiv.innerHTML = `${card.rank}${card.suit}`;
    this.playArea.appendChild(cDiv);
  }

  private aiMove(): void {
    const p = this.engine.getCurrentPlayer();
    const idx = this.engine.getAiMove(p);
    this.handlePlay(p, idx);
  }

  private completeTrick(): void {
    const { winner } = this.engine.evaluateTrick();
    
    // 1. Show who won the trick in the status bar first
    this.status.innerText = `Trick won by ${winner.toUpperCase()}`;

    // 2. Wait a bit so player can see all 4 cards before they vanish
    setTimeout(() => {
      // 3. Clear the central play area
      this.playArea.innerHTML = '';
      
      // 4. Update the scores on the scoreboard
      this.scoreNS.innerText = this.engine.score.ns.toString();
      this.scoreEW.innerText = this.engine.score.ew.toString();

      if (this.engine.gameOver) {
        this.handleGameOver();
      } else {
        this.renderAll();
        // If it's not the user's turn, trigger AI
        if (this.engine.getCurrentPlayer() !== 'south') {
          setTimeout(() => this.aiMove(), 600);
        }
      }
    }, 400); // Cards stay on table for 0.4 seconds after the 4th card is played
  }

  private handleGameOver(): void {
    const nsFinal = this.engine.score.ns;
    const ewFinal = this.engine.score.ew;
    let resultMsg = "";
    
    if (nsFinal > ewFinal) {
      resultMsg = `Game Over! NS Wins (${nsFinal} to ${ewFinal})`;
    } else if (ewFinal > nsFinal) {
      resultMsg = `Game Over! EW Wins (${ewFinal} to ${nsFinal})`;
    } else {
      resultMsg = `Game Over! It's a Draw (${nsFinal} - ${ewFinal})`;
    }

    setTimeout(() => {
      alert(resultMsg);
      
      // Reset logic
      this.engine.initGame();
      this.playArea.innerHTML = ''; // Explicitly clear for restart
      this.scoreNS.innerText = "0";
      this.scoreEW.innerText = "0";
      this.status.innerText = "Click a card to start, South (You) leads";
      
      this.renderAll();
    }, 300);
  }
}

new BridgeUI();
