'use client';

import { useParams } from 'next/navigation';
import QuestionPageContent from '~/components/markets/pages/QuestionPageContent';

const QuestionPage = () => {
  const params = useParams();
  const conditionId = params.conditionId as string;

  return <QuestionPageContent conditionId={conditionId} />;
};

export default QuestionPage;
