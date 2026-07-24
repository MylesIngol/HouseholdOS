export type Bill = {
  id: string;
  name: string;
  amount: number;
  dueLabel: string;
};

export type Expense = {
  id: string;
  description: string;
  amount: number;
  paidBy: string;
  dateLabel: string;
};

export type RoommateBalance = {
  id: string;
  name: string;
  /** Positive: they owe you. Negative: you owe them. */
  amount: number;
};
