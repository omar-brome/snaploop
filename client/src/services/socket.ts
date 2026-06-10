import { io, Socket } from 'socket.io-client';

// Singleton socket, connected after login (cookie carries the JWT through
// the Vite proxy). Components subscribe in useEffect and must clean up.
let socket: Socket | null = null;

export function connectSocket(): Socket {
  if (socket?.connected) return socket;
  socket ??= io('/', {
    withCredentials: true,
    autoConnect: false,
    transports: ['websocket', 'polling'],
  });
  if (!socket.connected) socket.connect();
  return socket;
}

export function getSocket(): Socket | null {
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}
