'use client';

import TerminalPageContent from '~/components/terminal/pages/TerminalPageContent';
import PageContainer from '~/components/layout/PageContainer';

const TerminalPage = () => {
  return (
    <PageContainer className="pb-4 md:pb-8">
      <TerminalPageContent />
    </PageContainer>
  );
};

export default TerminalPage;
