import { create } from 'zustand';

type ExampleUiState = {
  selectedId: string | null;
  select: (id: string | null) => void;
};

export const useExampleUiStore = create<ExampleUiState>((set) => ({
  selectedId: null,
  select: (id) => set({ selectedId: id }),
}));
