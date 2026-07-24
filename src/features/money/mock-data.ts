import type { Bill, Expense, RoommateBalance } from './types';

// Local mock data only — no backend yet.

export const billsDue: Bill[] = [
  { id: '1', name: 'Internet', amount: 64.0, dueLabel: 'Due in 2 days' },
  { id: '2', name: 'Electric', amount: 88.5, dueLabel: 'Due in 5 days' },
];

export const recentExpenses: Expense[] = [
  { id: '1', description: 'Costco run', amount: 96.42, paidBy: 'You', dateLabel: 'Yesterday' },
  { id: '2', description: 'Gas', amount: 40.0, paidBy: 'Sam', dateLabel: '2 days ago' },
  {
    id: '3',
    description: 'Dish soap + paper towels',
    amount: 18.7,
    paidBy: 'You',
    dateLabel: '4 days ago',
  },
];

export const roommateBalances: RoommateBalance[] = [
  { id: '1', name: 'Sam', amount: 102.38 },
  { id: '2', name: 'Priya', amount: 55.0 },
  { id: '3', name: 'Jordan', amount: -15.0 },
];

// The amount owed to you overall — the net of every roommate balance above.
export const yourBalance = roommateBalances.reduce((sum, balance) => sum + balance.amount, 0);
