import type { Metadata } from 'next';
import HackathonPageContent from '~/components/hackathon/pages/HackathonPageContent';

export const metadata: Metadata = {
  title: 'Hackathon',
  description:
    'Join our inaugural agent-building hackathon. Build Agents. Win Prizes. Forecast the Future.',
  openGraph: {
    title: 'Sapience Hackathon',
    description:
      'Join our inaugural agent-building hackathon. Build Agents. Win Prizes. Forecast the Future.',
    type: 'website',
    images: [
      {
        url: '/og_hackathon.png',
        width: 1200,
        height: 630,
        alt: 'Sapience Hackathon',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Sapience Hackathon',
    description:
      'Join our inaugural agent-building hackathon. Build Agents. Win Prizes. Forecast the Future.',
    images: ['/og_hackathon.png'],
  },
};

export default function HackathonPage() {
  return <HackathonPageContent />;
}
