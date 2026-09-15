import type { PlayerCarryState, ShelfState } from '@/types/game';

export class PlayerStateMachine {
  private _state: PlayerCarryState;

  constructor(initialState: PlayerCarryState = { type: 'EMPTY' }) {
    this._state = { ...initialState };
  }

  get state(): PlayerCarryState {
    return { ...this._state };
  }

  get isHoldingEmpty(): boolean {
    return this._state.type === 'EMPTY';
  }

  get isHoldingSprayer(): boolean {
    return this._state.type === 'MIST_SPRAYER';
  }

  get isHoldingRotten(): boolean {
    return this._state.type === 'ROTTEN_FRUIT';
  }

  get isHoldingEmptyBasket(): boolean {
    return this._state.type === 'BASKET_EMPTY';
  }

  get isHoldingFullBasket(): boolean {
    return this._state.type === 'BASKET_FULL';
  }

  // Take Mist Sprayer at Faucet
  pickSprayer(): boolean {
    if (this._state.type === 'EMPTY') {
      this._state = { type: 'MIST_SPRAYER' };
      return true;
    }
    return false;
  }

  // Return Mist Sprayer at Faucet
  returnSprayer(): boolean {
    if (this._state.type === 'MIST_SPRAYER') {
      this._state = { type: 'EMPTY' };
      return true;
    }
    return false;
  }

  // Pick up rotten fruit from shelf
  pickRottenFruit(fruitId: number): boolean {
    if (this._state.type === 'EMPTY') {
      this._state = { type: 'ROTTEN_FRUIT', fruitId };
      return true;
    }
    return false;
  }

  // Discard rotten fruit into Trash Can
  discardInTrash(): boolean {
    if (this._state.type === 'ROTTEN_FRUIT') {
      this._state = { type: 'EMPTY' };
      return true;
    }
    return false;
  }

  // Pick empty basket in Warehouse
  pickBasket(): boolean {
    if (this._state.type === 'EMPTY') {
      this._state = { type: 'BASKET_EMPTY' };
      return true;
    }
    return false;
  }

  // Return basket to Warehouse rack
  returnBasket(): boolean {
    if (this._state.type === 'BASKET_EMPTY') {
      this._state = { type: 'EMPTY' };
      return true;
    }
    return false;
  }

  // Finish mini-game and fill basket
  setBasketFull(fruitId: number, count: number): boolean {
    if (this._state.type === 'BASKET_EMPTY' || this._state.type === 'BASKET_FULL') {
      this._state = {
        type: 'BASKET_FULL',
        fruitId,
        count: Math.max(0, count),
      };
      return true;
    }
    return false;
  }

  // Restock matching shelf
  restockShelf(shelf: ShelfState): { success: boolean; added: number } {
    if (
      this._state.type === 'BASKET_FULL' &&
      this._state.fruitId === shelf.fruitId &&
      (this._state.count ?? 0) > 0
    ) {
      const added = this._state.count ?? 0;
      shelf.stock = Math.min(shelf.maxStock, shelf.stock + added);
      shelf.freshness = 100;
      shelf.isRotten = false;
      shelf.needsMist = false;
      this._state = { type: 'BASKET_EMPTY' };
      return { success: true, added };
    }
    return { success: false, added: 0 };
  }

  // Mist a shelf to restore freshness
  mistShelf(shelf: ShelfState): boolean {
    if (this._state.type === 'MIST_SPRAYER') {
      shelf.freshness = 100;
      shelf.needsMist = false;
      shelf.isRotten = false;
      return true;
    }
    return false;
  }

  // Reset state
  reset(): void {
    this._state = { type: 'EMPTY' };
  }
}
