export type DraftRoomRecord = {
  roomId: string;
  timerSec: number;
  snakeDraft: boolean;
  createdAt: number;
  pickOrder: string[];
};

export type DraftPickRecord = {
  roomId: string;
  pickIndex: number;
  round: number;
  slot: number;
  userId: string;
  playerId: string;
  autopick: boolean;
  createdAt: number;
};
