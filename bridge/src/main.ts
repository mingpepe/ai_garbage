import { BridgeEngine } from './BridgeEngine';
import type {
  Card,
  PlayerId,
  GameMode,
  Difficulty,
  Bid,
  Denomination,
  Suit,
  Rank
} from './models';

class SoundEffects {
  private ctx: AudioContext | null = null;
  public enabled: boolean = true;

  private initContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  public playCardSnap() {
    if (!this.enabled) return;
    try {
      this.initContext();
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(450, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(120, this.ctx.currentTime + 0.08);

      gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.08);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.08);
    } catch {
      // Audio fallback
    }
  }

  public playTrickWin() {
    if (!this.enabled) return;
    try {
      this.initContext();
      if (!this.ctx) return;
      const notes = [523.25, 659.25, 783.99]; // C5, E5, G5
      notes.forEach((freq, i) => {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, this.ctx!.currentTime + i * 0.07);

        gain.gain.setValueAtTime(0.2, this.ctx!.currentTime + i * 0.07);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx!.currentTime + i * 0.07 + 0.25);

        osc.connect(gain);
        gain.connect(this.ctx!.destination);
        osc.start(this.ctx!.currentTime + i * 0.07);
        osc.stop(this.ctx!.currentTime + i * 0.07 + 0.25);
      });
    } catch {
      // Audio fallback
    }
  }

  public playBid() {
    if (!this.enabled) return;
    try {
      this.initContext();
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(320, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(540, this.ctx.currentTime + 0.07);

      gain.gain.setValueAtTime(0.18, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.07);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.07);
    } catch {
      // Audio fallback
    }
  }
}

class BridgeApp {
  private engine: BridgeEngine;
  private sound: SoundEffects;
  private cheatMode: boolean = false;
  private selectedBidLevel: number = 1;
  private kittySelectedIndices: number[] = [];
  private isProcessingAi: boolean = false;

  // DOM Elements
  private modeSelect = document.getElementById('mode-select') as HTMLSelectElement;
  private diffSelect = document.getElementById('diff-select') as HTMLSelectElement;
  private btnNewGame = document.getElementById('btn-new-game') as HTMLButtonElement;
  private btnRules = document.getElementById('btn-rules') as HTMLButtonElement;
  private btnAuctionLog = document.getElementById('btn-auction-log') as HTMLButtonElement;
  private btnCheat = document.getElementById('btn-cheat') as HTMLButtonElement;
  private btnSound = document.getElementById('btn-sound') as HTMLButtonElement;

  private labelTeam1 = document.getElementById('label-team1') as HTMLElement;
  private scoreTeam1 = document.getElementById('score-team1') as HTMLElement;
  private labelTeam2 = document.getElementById('label-team2') as HTMLElement;
  private scoreTeam2 = document.getElementById('score-team2') as HTMLElement;
  private statusText = document.getElementById('status-text') as HTMLElement;
  private contractText = document.getElementById('contract-text') as HTMLElement;
  private tricksInfo = document.getElementById('tricks-info') as HTMLElement;

  private playArea = document.getElementById('play-area') as HTMLElement;
  private trumpIcon = document.getElementById('trump-display-icon') as HTMLElement;
  private trickRoundText = document.getElementById('trick-round-text') as HTMLElement;
  private trickBanner = document.getElementById('trick-banner') as HTMLElement;

  private biddingBox = document.getElementById('bidding-box') as HTMLElement;
  private currentHighBid = document.getElementById('current-high-bid') as HTMLElement;
  private biddingLevels = document.getElementById('bidding-levels') as HTMLElement;
  private biddingSuits = document.getElementById('bidding-suits') as HTMLElement;
  private btnBidPass = document.getElementById('btn-bid-pass') as HTMLButtonElement;
  private btnBidDouble = document.getElementById('btn-bid-double') as HTMLButtonElement;
  private btnBidRedouble = document.getElementById('btn-bid-redouble') as HTMLButtonElement;

  // Modals
  private kittyModal = document.getElementById('kitty-modal') as HTMLElement;
  private kittyGrid = document.getElementById('kitty-selection-grid') as HTMLElement;
  private btnConfirmKitty = document.getElementById('btn-confirm-kitty') as HTMLButtonElement;

  private callPartnerModal = document.getElementById('call-partner-modal') as HTMLElement;
  private partnerSuitSelect = document.getElementById('partner-suit-select') as HTMLSelectElement;
  private partnerRankSelect = document.getElementById('partner-rank-select') as HTMLSelectElement;
  private btnConfirmPartner = document.getElementById('btn-confirm-partner') as HTMLButtonElement;

  private auctionModal = document.getElementById('auction-modal') as HTMLElement;
  private btnCloseAuction = document.getElementById('btn-close-auction') as HTMLButtonElement;
  private auctionHead = document.getElementById('auction-table-head') as HTMLElement;
  private auctionBody = document.getElementById('auction-table-body') as HTMLElement;

  private handEndModal = document.getElementById('hand-end-modal') as HTMLElement;
  private btnNextHand = document.getElementById('btn-next-hand') as HTMLButtonElement;
  private resContract = document.getElementById('res-contract') as HTMLElement;
  private resTarget = document.getElementById('res-target') as HTMLElement;
  private resWon = document.getElementById('res-won') as HTMLElement;
  private resStatus = document.getElementById('res-status') as HTMLElement;
  private resScore = document.getElementById('res-score') as HTMLElement;
  private resSummary = document.getElementById('res-summary') as HTMLElement;

  private rulesModal = document.getElementById('rules-modal') as HTMLElement;
  private btnCloseRules = document.getElementById('btn-close-rules') as HTMLButtonElement;

  constructor() {
    this.sound = new SoundEffects();
    this.engine = new BridgeEngine('4p', 'medium');

    this.bindEvents();
    this.startHand();
  }

  private bindEvents(): void {
    // Mode & Difficulty Change
    this.modeSelect.addEventListener('change', () => {
      const mode = this.modeSelect.value as GameMode;
      this.engine.mode = mode;
      this.engine.matchScore = { team1: 0, team2: 0 };
      this.startHand();
    });

    this.diffSelect.addEventListener('change', () => {
      this.engine.difficulty = this.diffSelect.value as Difficulty;
      this.updateStatus();
    });

    // Control buttons
    this.btnNewGame.addEventListener('click', () => {
      this.startHand();
    });

    this.btnCheat.addEventListener('click', () => {
      this.cheatMode = !this.cheatMode;
      this.btnCheat.style.background = this.cheatMode ? '#f39c12' : '#2c3e50';
      this.renderHands();
    });

    this.btnSound.addEventListener('click', () => {
      this.sound.enabled = !this.sound.enabled;
      this.btnSound.innerText = this.sound.enabled ? '🔊' : '🔇';
    });

    this.btnRules.addEventListener('click', () => {
      this.rulesModal.style.display = 'flex';
    });
    this.btnCloseRules.addEventListener('click', () => {
      this.rulesModal.style.display = 'none';
    });

    this.btnAuctionLog.addEventListener('click', () => {
      this.renderAuctionModal();
      this.auctionModal.style.display = 'flex';
    });
    this.btnCloseAuction.addEventListener('click', () => {
      this.auctionModal.style.display = 'none';
    });

    // Bidding Box buttons
    this.biddingLevels.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => {
        this.selectedBidLevel = parseInt(btn.dataset.level || '1', 10);
        this.updateBiddingButtons();
      });
    });

    this.biddingSuits.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => {
        const suit = btn.dataset.suit as Denomination;
        this.submitHumanBid({
          type: 'bid',
          player: 'south',
          level: this.selectedBidLevel,
          denomination: suit
        });
      });
    });

    this.btnBidPass.addEventListener('click', () => {
      this.submitHumanBid({ type: 'pass', player: 'south' });
    });

    this.btnBidDouble.addEventListener('click', () => {
      this.submitHumanBid({ type: 'double', player: 'south' });
    });

    this.btnBidRedouble.addEventListener('click', () => {
      this.submitHumanBid({ type: 'redouble', player: 'south' });
    });

    // 5P Kitty Confirm
    this.btnConfirmKitty.addEventListener('click', () => {
      if (this.kittySelectedIndices.length === 2) {
        this.engine.exchangeKitty5P(this.kittySelectedIndices);
        this.kittyModal.style.display = 'none';
        this.renderAll();
        this.checkNextPhase();
      }
    });

    // 5P Call Partner Confirm
    this.btnConfirmPartner.addEventListener('click', () => {
      const suit = this.partnerSuitSelect.value as Suit;
      const rank = this.partnerRankSelect.value as Rank;
      this.engine.callPartner5P({ suit, rank });
      this.callPartnerModal.style.display = 'none';
      this.renderAll();
      this.checkNextPhase();
    });

    // Hand End Modal Next Hand
    this.btnNextHand.addEventListener('click', () => {
      this.handEndModal.style.display = 'none';
      this.startHand();
    });
  }

  /**
   * Start a new hand
   */
  private startHand(): void {
    this.isProcessingAi = false;
    this.kittySelectedIndices = [];
    this.kittyModal.style.display = 'none';
    this.callPartnerModal.style.display = 'none';
    this.handEndModal.style.display = 'none';
    this.biddingBox.style.display = 'none';

    this.engine.startNewHand();
    this.updateLayoutForMode();
    this.renderAll();

    this.checkNextPhase();
  }

  /**
   * Update table seat visibility based on 4P or 5P
   */
  private updateLayoutForMode(): void {
    const is4P = this.engine.mode === '4p';

    const seatSouth = document.getElementById('seat-south');
    if (seatSouth) {
      seatSouth.classList.toggle('pos-4p-south', is4P);
      seatSouth.classList.toggle('pos-5p-south', !is4P);
    }

    // 4P seats
    document.getElementById('seat-west')!.style.display = is4P ? 'flex' : 'none';
    document.getElementById('seat-north')!.style.display = is4P ? 'flex' : 'none';
    document.getElementById('seat-east')!.style.display = is4P ? 'flex' : 'none';

    // 5P seats
    document.getElementById('seat-p2')!.style.display = !is4P ? 'flex' : 'none';
    document.getElementById('seat-p3')!.style.display = !is4P ? 'flex' : 'none';
    document.getElementById('seat-p4')!.style.display = !is4P ? 'flex' : 'none';
    document.getElementById('seat-p5')!.style.display = !is4P ? 'flex' : 'none';

    // Score labels
    this.labelTeam1.innerText = is4P ? 'NS 總分' : '莊家方 總分';
    this.labelTeam2.innerText = is4P ? 'EW 總分' : '防守方 總分';

    // Bidding levels (hide 6 and 7 in 5P mode)
    this.biddingLevels.querySelectorAll('.btn-4p-only').forEach(el => {
      (el as HTMLElement).style.display = is4P ? 'inline-block' : 'none';
    });
    if (!is4P && this.selectedBidLevel > 5) {
      this.selectedBidLevel = 1;
    }
  }

  /**
   * Main game flow dispatcher
   */
  private checkNextPhase(): void {
    if (this.engine.phase === 'bidding') {
      const currentBidder = this.engine.getCurrentBiddingPlayer();
      if (currentBidder === 'south') {
        this.showBiddingBox();
      } else {
        this.biddingBox.style.display = 'none';
        this.scheduleAiBid(currentBidder);
      }
    } else if (this.engine.phase === 'kitty') {
      this.biddingBox.style.display = 'none';
      if (this.engine.contract?.declarer === 'south') {
        this.showKittyModal();
      } else {
        this.scheduleAiKitty();
      }
    } else if (this.engine.phase === 'calling_partner') {
      this.biddingBox.style.display = 'none';
      if (this.engine.contract?.declarer === 'south') {
        this.showCallPartnerModal();
      } else {
        this.scheduleAiCallPartner();
      }
    } else if (this.engine.phase === 'playing') {
      this.biddingBox.style.display = 'none';
      const effectivePlayer = this.engine.getEffectivePlayer();

      if (effectivePlayer === 'south') {
        this.statusText.innerText = `輪到你出牌 (${this.engine.getPlayerName(this.engine.getCurrentPlayer())})`;
        this.renderAll();
      } else {
        this.scheduleAiCardPlay(this.engine.getCurrentPlayer());
      }
    } else if (this.engine.phase === 'hand_ended') {
      this.biddingBox.style.display = 'none';
      this.showHandEndModal();
    }
  }

  // --- BIDDING INTERACTIONS ---

  private showBiddingBox(): void {
    this.biddingBox.style.display = 'flex';
    this.updateBiddingButtons();
  }

  private updateBiddingButtons(): void {
    const cur = this.engine.currentContractBid;
    if (cur) {
      this.currentHighBid.innerText = `當前最高: ${cur.level}${cur.denomination} (${this.engine.getPlayerName(cur.bidder)})`;
    } else {
      this.currentHighBid.innerText = '當前最高: 無';
    }

    // Update level buttons selection state
    this.biddingLevels.querySelectorAll('button').forEach(btn => {
      const lvl = parseInt(btn.dataset.level || '1', 10);
      btn.classList.toggle('selected', lvl === this.selectedBidLevel);
    });

    // Update suit buttons enabled / disabled
    this.biddingSuits.querySelectorAll('button').forEach(btn => {
      const suit = btn.dataset.suit as Denomination;
      const check = this.engine.canMakeBid('south', {
        type: 'bid',
        player: 'south',
        level: this.selectedBidLevel,
        denomination: suit
      });
      btn.disabled = !check.valid;
      btn.style.opacity = check.valid ? '1' : '0.4';
    });

    // Update Double & Redouble
    const checkDbl = this.engine.canMakeBid('south', { type: 'double', player: 'south' });
    this.btnBidDouble.disabled = !checkDbl.valid;
    this.btnBidDouble.style.opacity = checkDbl.valid ? '1' : '0.4';

    const checkRedbl = this.engine.canMakeBid('south', { type: 'redouble', player: 'south' });
    this.btnBidRedouble.disabled = !checkRedbl.valid;
    this.btnBidRedouble.style.opacity = checkRedbl.valid ? '1' : '0.4';
  }

  private submitHumanBid(bid: Bid): void {
    const res = this.engine.placeBid(bid);
    if (!res.success) {
      alert(res.reason || '無效叫品');
      return;
    }
    this.sound.playBid();
    this.showSpeechBubble(bid.player, this.formatBid(bid));
    this.renderAll();

    if (res.reason && res.auctionEnded && !this.engine.contract) {
      alert(res.reason);
      this.startHand();
      return;
    }

    this.checkNextPhase();
  }

  private scheduleAiBid(player: PlayerId): void {
    if (this.isProcessingAi) return;
    this.isProcessingAi = true;
    this.statusText.innerText = `${this.engine.getPlayerName(player)} 思考叫牌中...`;

    setTimeout(() => {
      const bid = this.engine.getAiBid(player);
      const res = this.engine.placeBid(bid);
      this.sound.playBid();
      this.showSpeechBubble(player, this.formatBid(bid));
      this.renderAll();
      this.isProcessingAi = false;

      if (res.reason && res.auctionEnded && !this.engine.contract) {
        alert(res.reason);
        this.startHand();
        return;
      }

      this.checkNextPhase();
    }, 650);
  }

  private formatBid(bid: Bid): string {
    if (bid.type === 'pass') return 'Pass';
    if (bid.type === 'double') return 'Double 賭倍!';
    if (bid.type === 'redouble') return 'Redouble 再賭倍!';
    return `${bid.level}${bid.denomination}`;
  }

  private showSpeechBubble(player: PlayerId, text: string): void {
    const bubble = document.getElementById(`bubble-${player}`);
    if (bubble) {
      bubble.innerText = text;
      bubble.classList.add('show');
      setTimeout(() => bubble.classList.remove('show'), 2000);
    }
  }

  // --- 5P SPECIAL PHASES ---

  private showKittyModal(): void {
    this.kittySelectedIndices = [];
    this.kittyModal.style.display = 'flex';
    this.kittyGrid.innerHTML = '';
    this.btnConfirmKitty.disabled = true;

    const hand = this.engine.hands.south;
    hand.forEach((card, i) => {
      const cardEl = this.createCardElement(card, true);
      cardEl.classList.add('kitty-card-item');
      cardEl.addEventListener('click', () => {
        const idx = this.kittySelectedIndices.indexOf(i);
        if (idx !== -1) {
          this.kittySelectedIndices.splice(idx, 1);
          cardEl.classList.remove('selected');
        } else {
          if (this.kittySelectedIndices.length < 2) {
            this.kittySelectedIndices.push(i);
            cardEl.classList.add('selected');
          }
        }
        this.btnConfirmKitty.disabled = this.kittySelectedIndices.length !== 2;
      });
      this.kittyGrid.appendChild(cardEl);
    });
  }

  private scheduleAiKitty(): void {
    this.statusText.innerText = `${this.engine.getPlayerName(this.engine.contract!.declarer)} 正在換底牌...`;
    setTimeout(() => {
      const discards = this.engine.getAiKittyDiscards();
      this.engine.exchangeKitty5P(discards);
      this.renderAll();
      this.checkNextPhase();
    }, 800);
  }

  private showCallPartnerModal(): void {
    this.callPartnerModal.style.display = 'flex';
  }

  private scheduleAiCallPartner(): void {
    this.statusText.innerText = `${this.engine.getPlayerName(this.engine.contract!.declarer)} 正在挑選搭檔牌...`;
    setTimeout(() => {
      const card = this.engine.getAiPartnerCall();
      this.engine.callPartner5P(card);
      this.showSpeechBubble(this.engine.contract!.declarer, `搭檔牌: [${card.suit}${card.rank}]`);
      this.renderAll();
      this.checkNextPhase();
    }, 900);
  }

  // --- TRICK PLAY INTERACTIONS ---

  private handleHumanCardClick(player: PlayerId, cardIndex: number): void {
    if (this.engine.phase !== 'playing') return;
    const effectivePlayer = this.engine.getEffectivePlayer();
    if (effectivePlayer !== 'south') return;

    const currentPlayer = this.engine.getCurrentPlayer();
    const check = this.engine.canPlayCard(currentPlayer, cardIndex);
    if (!check.valid) {
      alert(check.reason);
      return;
    }

    const played = this.engine.playCard(currentPlayer, cardIndex);
    if (played) {
      this.sound.playCardSnap();
      this.renderAll();
      this.checkTrickCompletion();
    }
  }

  private scheduleAiCardPlay(player: PlayerId): void {
    if (this.isProcessingAi) return;
    this.isProcessingAi = true;
    this.statusText.innerText = `${this.engine.getPlayerName(player)} 思考出牌中...`;

    setTimeout(() => {
      const cardIndex = this.engine.getAiCardMove(player);
      const played = this.engine.playCard(player, cardIndex);
      this.isProcessingAi = false;
      if (played) {
        this.sound.playCardSnap();
        this.renderAll();
        this.checkTrickCompletion();
      }
    }, 600);
  }

  private checkTrickCompletion(): void {
    if (this.engine.currentTrick.length === this.engine.playerCount) {
      // Trick complete! Wait to show all cards before collecting
      this.isProcessingAi = true;
      const { winner, isHandEnd } = this.engine.evaluateTrick();
      this.sound.playTrickWin();

      // Show winner banner
      this.trickBanner.innerText = `${this.engine.getPlayerName(winner)} 贏得此墩！`;
      this.trickBanner.classList.add('show');

      setTimeout(() => {
        this.trickBanner.classList.remove('show');
        this.isProcessingAi = false;
        this.renderAll();

        if (isHandEnd) {
          this.showHandEndModal();
        } else {
          this.checkNextPhase();
        }
      }, 1200);
    } else {
      this.checkNextPhase();
    }
  }

  // --- RENDERING ---

  private renderAll(): void {
    this.updateStatus();
    this.renderHands();
    this.renderCenterTrick();
  }

  private updateStatus(): void {
    // Scoreboard
    this.scoreTeam1.innerText = this.engine.matchScore.team1.toString();
    this.scoreTeam2.innerText = this.engine.matchScore.team2.toString();

    // Contract Text
    if (this.engine.contract) {
      const c = this.engine.contract;
      const dbl = c.redoubled ? ' (XX)' : (c.doubled ? ' (X)' : '');
      const declarerName = this.engine.getPlayerName(c.declarer);
      let partnerInfo = '';
      if (this.engine.mode === '5p' && this.engine.partnerCall) {
        const pc = this.engine.partnerCall;
        const targetStr = `[${pc.card.suit}${pc.card.rank}]`;
        partnerInfo = pc.revealed && pc.partnerPlayerId
          ? ` | 搭檔: ${this.engine.getPlayerName(pc.partnerPlayerId)}`
          : ` | 尋找搭檔: ${targetStr}`;
      }
      this.contractText.innerHTML = `合約: <strong>${c.level}${c.denomination}${dbl}</strong> (莊家: ${declarerName})${partnerInfo}`;
      this.trumpIcon.innerText = c.denomination === 'NT' ? '無' : c.denomination;
      this.trumpIcon.style.color = (c.denomination === '♥' || c.denomination === '♦') ? 'var(--red)' : 'var(--gold)';
    } else {
      this.contractText.innerText = '合約: 叫牌進行中';
      this.trumpIcon.innerText = '♠';
      this.trumpIcon.style.color = 'var(--gold)';
    }

    // Tricks info
    const totalTricks = this.engine.playedHistory.length;
    const maxTricks = this.engine.mode === '4p' ? 13 : 10;
    this.tricksInfo.innerText = `完成墩數: ${totalTricks} / ${maxTricks}`;

    // Active Turn Glow and Badges
    const activePlayer = this.engine.phase === 'bidding'
      ? this.engine.getCurrentBiddingPlayer()
      : this.engine.getCurrentPlayer();

    for (const p of this.engine.players) {
      const seat = document.getElementById(`seat-${p}`);
      if (!seat) continue;

      seat.classList.toggle('active-turn', activePlayer === p);

      // Declarer / Dummy / Partner badge
      const badge = document.getElementById(`badge-${p}`);
      if (badge && this.engine.contract) {
        if (p === this.engine.contract.declarer) {
          badge.style.display = 'inline-block';
          badge.className = 'badge badge-declarer';
          badge.innerText = '莊家';
        } else if (this.engine.mode === '4p' && p === this.engine.contract.dummy) {
          badge.style.display = 'inline-block';
          badge.className = 'badge badge-dummy';
          badge.innerText = '夢家';
        } else if (this.engine.mode === '5p' && this.engine.partnerCall?.revealed && p === this.engine.partnerCall.partnerPlayerId) {
          badge.style.display = 'inline-block';
          badge.className = 'badge badge-partner';
          badge.innerText = '搭檔';
        } else {
          badge.style.display = 'none';
        }
      } else if (badge) {
        badge.style.display = 'none';
      }

      // Tricks won badge
      const trkBadge = document.getElementById(`tricks-${p}`);
      if (trkBadge) {
        trkBadge.innerText = `${this.engine.tricksWon[p]} 墩`;
      }
    }
  }

  private renderHands(): void {
    const isPlaying = this.engine.phase === 'playing';
    const currentPlayer = this.engine.getCurrentPlayer();
    const effectivePlayer = this.engine.getEffectivePlayer();

    for (const p of this.engine.players) {
      const container = document.getElementById(`hand-${p}`);
      if (!container) continue;
      container.innerHTML = '';

      const hand = this.engine.hands[p];
      const isVisible = p === 'south'
        || this.cheatMode
        || (this.engine.mode === '4p' && p === this.engine.contract?.dummy && this.engine.dummyRevealed);

      const isHumanTurn = isPlaying && effectivePlayer === 'south' && currentPlayer === p;
      const legalIndices = isHumanTurn ? this.engine.getLegalCardIndices(p) : [];

      hand.forEach((card, idx) => {
        const cardEl = this.createCardElement(card, isVisible);

        if (isHumanTurn) {
          const isLegal = legalIndices.includes(idx);
          if (isLegal) {
            cardEl.classList.add('playable');
            cardEl.onclick = () => this.handleHumanCardClick(p, idx);
          } else {
            cardEl.classList.add('unplayable');
          }
        }

        container.appendChild(cardEl);
      });
    }
  }

  private createCardElement(card: Card, isVisible: boolean): HTMLElement {
    const el = document.createElement('div');
    if (!isVisible) {
      el.className = 'card hidden';
      return el;
    }

    const isRed = (card.suit === '♥' || card.suit === '♦');
    el.className = `card ${isRed ? 'red' : ''}`;
    el.innerHTML = `
      <div class="card-corner-top">
        <span>${card.rank}</span>
        <span>${card.suit}</span>
      </div>
      <div class="card-center-suit">${card.suit}</div>
      <div class="card-corner-bottom">
        <span>${card.rank}</span>
        <span>${card.suit}</span>
      </div>
    `;
    return el;
  }

  private renderCenterTrick(): void {
    // Clear previously rendered played cards
    this.playArea.querySelectorAll('.played-card').forEach(el => el.remove());

    const is4P = this.engine.mode === '4p';

    this.engine.currentTrick.forEach(played => {
      const cardEl = this.createCardElement(played.card, true);
      cardEl.className = `played-card ${played.card.suit === '♥' || played.card.suit === '♦' ? 'red' : ''}`;

      // Positional class
      if (is4P) {
        cardEl.classList.add(`played-4p-${played.player}`);
      } else {
        cardEl.classList.add(`played-5p-${played.player}`);
      }

      this.playArea.appendChild(cardEl);
    });

    if (this.engine.currentTrick.length === 0) {
      this.trickRoundText.innerText = this.engine.phase === 'playing'
        ? `第 ${this.engine.playedHistory.length + 1} 墩`
        : '橋牌桌';
    }
  }

  private renderAuctionModal(): void {
    const is4P = this.engine.mode === '4p';
    const players = this.engine.players;

    // Header
    this.auctionHead.innerHTML = `<tr>${players.map(p => `<th>${this.engine.getPlayerName(p)}</th>`).join('')}</tr>`;

    // Body
    this.auctionBody.innerHTML = '';
    const history = this.engine.auctionHistory;
    if (history.length === 0) {
      this.auctionBody.innerHTML = `<tr><td colspan="${players.length}" style="color:#7f8c8d;">尚無叫牌紀錄</td></tr>`;
      return;
    }

    // Group bids into rounds starting from dealer
    let currentRound: Record<string, string> = {};
    const firstBidder = history[0].player;
    const startIndex = players.indexOf(firstBidder);

    let roundRow = document.createElement('tr');
    for (let i = 0; i < startIndex; i++) {
      const td = document.createElement('td');
      td.innerText = '-';
      td.style.color = '#7f8c8d';
      roundRow.appendChild(td);
    }

    let col = startIndex;
    for (const b of history) {
      const td = document.createElement('td');
      td.innerText = this.formatBid(b);
      if (b.type === 'double') td.style.color = '#e74c3c';
      if (b.type === 'redouble') td.style.color = '#3498db';
      if (b.type === 'bid') td.style.fontWeight = 'bold';
      roundRow.appendChild(td);

      col = (col + 1) % players.length;
      if (col === 0) {
        this.auctionBody.appendChild(roundRow);
        roundRow = document.createElement('tr');
      }
    }

    if (roundRow.children.length > 0) {
      while (roundRow.children.length < players.length) {
        const td = document.createElement('td');
        td.innerText = '-';
        td.style.color = '#7f8c8d';
        roundRow.appendChild(td);
      }
      this.auctionBody.appendChild(roundRow);
    }
  }

  private showHandEndModal(): void {
    const res = this.engine.lastHandResult;
    if (!res) return;

    this.resContract.innerText = `${res.contract.level}${res.contract.denomination}`;
    this.resTarget.innerText = `${res.targetTricks} 墩`;
    this.resWon.innerText = `${res.declarerTricks} 墩`;
    this.resStatus.innerText = res.made
      ? `合約達成 (超額 +${res.tricksDiff} 墩)`
      : `合約未成 (不足 -${Math.abs(res.tricksDiff)} 墩)`;
    this.resStatus.style.color = res.made ? '#2ecc71' : '#e74c3c';

    const points = res.made ? res.declarerScore : res.defenderScore;
    const teamName = res.made ? '莊家方' : '防守方';
    this.resScore.innerText = `${teamName} +${points} 分`;
    this.resSummary.innerText = res.summary;

    this.handEndModal.style.display = 'flex';
  }
}

// Launch application on DOM ready
window.addEventListener('DOMContentLoaded', () => {
  new BridgeApp();
});
