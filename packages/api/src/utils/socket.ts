import type { Socket } from 'node:net';
import { STATUS_CODES } from 'node:http';

export function closeSocket(socket: Socket, errCode?: number) {
  if (errCode) {
    try {
      const errMsg = STATUS_CODES[errCode] || 'Server Coding Error';
      socket.write(
        `HTTP/1.1 ${errCode} ${errMsg}\r\nConnection: close\r\n\r\n`
      );
    } catch (err) {
      console.error(err);
    }
  }

  try {
    socket.destroy();
  } catch (err) {
    console.error(err);
  }
}
