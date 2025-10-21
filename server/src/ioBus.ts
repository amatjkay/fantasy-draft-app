import type { Server as IOServer } from 'socket.io';

let ioRef: IOServer | null = null;

export function setIO(io: IOServer) {
  ioRef = io;
}

export function getIO(): IOServer | null {
  return ioRef;
}

export function emitDraftState(roomId: string, state: any) {
  if (!ioRef) return;
  ioRef.to(roomId).emit('draft:state', state);
}
