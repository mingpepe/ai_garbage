import type { ShoppingItem, CustomerMood } from '@/types/game';

export interface MathFormula {
  expression: string;
  totalSum: number;
  items: ShoppingItem[];
}

export class MathEngine {
  // Generate calculation formula from shopping list
  static generateFormula(items: ShoppingItem[]): MathFormula {
    const validItems = items.filter((item) => item.count > 0);
    if (validItems.length === 0) {
      return {
        expression: '0',
        totalSum: 0,
        items: [],
      };
    }

    const expression = validItems
      .map((item) => `${item.unitPrice} * ${item.count}`)
      .join(' + ');

    const totalSum = validItems.reduce(
      (sum, item) => sum + item.unitPrice * item.count,
      0
    );

    return {
      expression,
      totalSum,
      items: validItems,
    };
  }

  // Check user inputted answer
  static verifyAnswer(inputAnswer: number, formula: MathFormula): boolean {
    return inputAnswer === formula.totalSum;
  }

  // Degrade mood on mistake
  static degradeMood(currentMood: CustomerMood): CustomerMood {
    if (currentMood === 'HAPPY') return 'NEUTRAL';
    if (currentMood === 'NEUTRAL') return 'IMPATIENT';
    return 'IMPATIENT';
  }
}
