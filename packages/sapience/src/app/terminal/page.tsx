'use client';

import TerminalPageContent from '~/components/terminal/pages/TerminalPageContent';

const TerminalPage = () => {
  return (
    <div className="relative w-full min-h-0 pt-16 md:pt-24 pb-0 flex flex-col flex-1">
      <div className="relative flex-1 min-h-0 flex flex-col">
        <TerminalPageContent />
      </div>
    </div>
  );
};

export default TerminalPage;
