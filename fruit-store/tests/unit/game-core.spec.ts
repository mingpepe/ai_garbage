import { describe, it, expect, beforeEach } from 'vitest';
import { PlayerStateMachine } from '@/core/stateMachine';
import { CustomerManager } from '@/core/customerManager';
import { MathEngine } from '@/core/mathEngine';
import { DEFAULT_ADMIN_SETTINGS } from '@/core/constants';
import type { ShelfState, ShoppingItem } from '@/types/game';

describe('Unit & State Machine Test Suite (game-core.spec.ts)', () => {
  describe('Test Case 1: Player Carry State Machine Mutual Exclusivity', () => {
    let sm: PlayerStateMachine;

    beforeEach(() => {
      sm = new PlayerStateMachine();
    });

    it('should have default state as EMPTY', () => {
      expect(sm.state.type).toBe('EMPTY');
      expect(sm.isHoldingEmpty).toBe(true);
    });

    it('should allow EMPTY to transition to MIST_SPRAYER', () => {
      const success = sm.pickSprayer();
      expect(success).toBe(true);
      expect(sm.state.type).toBe('MIST_SPRAYER');
      expect(sm.isHoldingSprayer).toBe(true);
    });

    it('should reject pickBasket() when holding MIST_SPRAYER and maintain state', () => {
      sm.pickSprayer();
      expect(sm.state.type).toBe('MIST_SPRAYER');

      const pickBasketResult = sm.pickBasket();
      expect(pickBasketResult).toBe(false);
      expect(sm.state.type).toBe('MIST_SPRAYER');
      expect(sm.isHoldingSprayer).toBe(true);
    });

    it('should enter BASKET_EMPTY and reject sprayer or rotten fruit', () => {
      const pickBasketResult = sm.pickBasket();
      expect(pickBasketResult).toBe(true);
      expect(sm.state.type).toBe('BASKET_EMPTY');

      expect(sm.pickSprayer()).toBe(false);
      expect(sm.pickRottenFruit(1)).toBe(false);
      expect(sm.state.type).toBe('BASKET_EMPTY');
    });

    it('should handle BASKET_FULL after mini-game, transition to BASKET_EMPTY on restock, and restore EMPTY only after returnBasket()', () => {
      sm.pickBasket();
      expect(sm.state.type).toBe('BASKET_EMPTY');

      // Mini game finished with 8 apples (fruitId: 1)
      const setFullRes = sm.setBasketFull(1, 8);
      expect(setFullRes).toBe(true);
      expect(sm.state.type).toBe('BASKET_FULL');
      expect(sm.state.fruitId).toBe(1);
      expect(sm.state.count).toBe(8);

      // Restock matching shelf
      const shelf: ShelfState = {
        id: 1,
        fruitId: 1,
        stock: 2,
        maxStock: 15,
        freshness: 60,
        isRotten: false,
        needsMist: false,
        x: 1,
        y: 4,
      };

      const restockRes = sm.restockShelf(shelf);
      expect(restockRes.success).toBe(true);
      expect(shelf.stock).toBe(10); // 2 + 8
      expect(shelf.freshness).toBe(100);
      expect(sm.state.type).toBe('BASKET_EMPTY');

      // Return basket to restore EMPTY
      const returnRes = sm.returnBasket();
      expect(returnRes).toBe(true);
      expect(sm.state.type).toBe('EMPTY');
      expect(sm.isHoldingEmpty).toBe(true);
    });
  });

  describe('Test Case 2: Customer Picking & Inventory Extreme Value Protection', () => {
    let cm: CustomerManager;
    let shelves: ShelfState[];

    beforeEach(() => {
      cm = new CustomerManager();
      shelves = Array.from({ length: 10 }, (_, i) => ({
        id: i + 1,
        fruitId: i + 1,
        stock: 0,
        maxStock: 15,
        freshness: 100,
        isRotten: false,
        needsMist: false,
        x: i % 5 + 1,
        y: i < 5 ? 4 : 7,
      }));
    });

    it('should never include fruit with 0 stock in shopping list', () => {
      // Set fruit 1 to 0, fruit 2 to 1, others to 0
      shelves[0].stock = 0; // Fruit 1
      shelves[1].stock = 1; // Fruit 2

      const customer = cm.spawnCustomer(shelves, DEFAULT_ADMIN_SETTINGS);
      expect(customer).not.toBeNull();
      if (!customer) return;

      const fruitIds = customer.items.map((it) => it.fruitId);
      expect(fruitIds).not.toContain(1);
      expect(fruitIds).toContain(2);
    });

    it('should clamp customer desired quantity to available shelf stock and prevent negative stock', () => {
      shelves[0].stock = 0;
      shelves[1].stock = 1; // only 1 in stock

      const customSettings = {
        ...DEFAULT_ADMIN_SETTINGS,
        maxFruitTypesPerCustomer: 1,
        maxQuantityPerItem: 5, // customer might want up to 5
      };

      const customer = cm.spawnCustomer(shelves, customSettings);
      expect(customer).not.toBeNull();
      if (!customer) return;

      const item2 = customer.items.find((it) => it.fruitId === 2);
      expect(item2).toBeDefined();
      expect(item2?.count).toBe(1); // Clamped to 1
      expect(shelves[1].stock).toBe(0); // Shelf stock deducted to 0
      expect(shelves[1].stock).toBeGreaterThanOrEqual(0);
    });

    it('should immediately set customer state to LEAVING when all shelves have 0 stock', () => {
      shelves.forEach((s) => (s.stock = 0));

      const customer = cm.spawnCustomer(shelves, DEFAULT_ADMIN_SETTINGS);
      expect(customer).not.toBeNull();
      if (!customer) return;

      expect(customer.state).toBe('LEAVING');
      expect(customer.items.length).toBe(0);
    });
  });

  describe('Test Case 3: Math Formula Generation & Patience Evaluation', () => {
    it('should generate correct formula expression and total sum', () => {
      const shoppingItems: ShoppingItem[] = [
        { fruitId: 1, unitPrice: 2, count: 3 }, // 2 * 3 = 6
        { fruitId: 2, unitPrice: 5, count: 2 }, // 5 * 2 = 10
      ];

      const formula = MathEngine.generateFormula(shoppingItems);
      expect(formula.expression).toBe('2 * 3 + 5 * 2');
      expect(formula.totalSum).toBe(16);
    });

    it('should degrade customer mood on incorrect answer without ending checkout', () => {
      const shoppingItems: ShoppingItem[] = [
        { fruitId: 1, unitPrice: 2, count: 3 },
        { fruitId: 2, unitPrice: 5, count: 2 },
      ];
      const formula = MathEngine.generateFormula(shoppingItems);

      const wrongAnswer = 10;
      const isCorrect = MathEngine.verifyAnswer(wrongAnswer, formula);
      expect(isCorrect).toBe(false);

      const nextMood = MathEngine.degradeMood('HAPPY');
      expect(nextMood).toBe('NEUTRAL');

      const nextMood2 = MathEngine.degradeMood('NEUTRAL');
      expect(nextMood2).toBe('IMPATIENT');
    });

    it('should verify correct answer 16 and successfully complete checkout', () => {
      const shoppingItems: ShoppingItem[] = [
        { fruitId: 1, unitPrice: 2, count: 3 },
        { fruitId: 2, unitPrice: 5, count: 2 },
      ];
      const formula = MathEngine.generateFormula(shoppingItems);

      const correctAnswer = 16;
      const isCorrect = MathEngine.verifyAnswer(correctAnswer, formula);
      expect(isCorrect).toBe(true);

      const cm = new CustomerManager();
      const customer = cm.spawnCustomer(
        Array.from({ length: 10 }, (_, i) => ({
          id: i + 1,
          fruitId: i + 1,
          stock: 10,
          maxStock: 15,
          freshness: 100,
          isRotten: false,
          needsMist: false,
          x: 1,
          y: 4,
        })),
        DEFAULT_ADMIN_SETTINGS
      );

      if (customer) {
        const checkoutSuccess = cm.finishCheckout(customer.id);
        expect(checkoutSuccess).toBe(true);
        expect(customer.state).toBe('LEAVING');
        expect(customer.mood).toBe('HAPPY');
      }
    });
  });
});
