'use client';

import { useEffect } from 'react';

const ConsoleMessage = () => {
  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      const message1 =
        'Our code is open source on GitHub https://github.com/sapiencexyz/sapience';
      const message2 =
        'Come chat with us on Discord https://discord.gg/sapience';
      const style =
        'font-size: 42px; font-weight: 900; padding: 8px 16px; color: hsl(240 10% 3.9%); background: linear-gradient(90deg,hsl(54 97% 77%),hsl(0 94% 82%),hsl(258 90% 80%),hsl(213 97% 82%)); border-radius: 8px;';

      console.log('%c' + message1, style);

      console.log('%c' + message2, style);
    }, 2500);

    return () => window.clearTimeout(timeoutId);
  }, []);

  return null;
};

export default ConsoleMessage;
