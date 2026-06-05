import { notFound } from 'next/navigation';
import data from '@/data/fixtures.json';
import MatchClient from './MatchClient';

export default async function MatchPage({ params }) {
  const { id } = await params;
  
  // Find match in fixtures JSON data
  const match = data.fixtures.find((item) => item.id === id);

  if (!match) {
    notFound();
  }

  return <MatchClient match={match} />;
}
