import { notFound, redirect } from 'next/navigation';
import { getGame } from '@/lib/game-catalog';
import GameRoom from './GameRoom';

/** Retired ids kept alive so old links and QR codes still land somewhere. */
const MOVED: Record<string, string> = {
  bottles: 'bowling', // Milk Bottle Smash was replaced by Ten-Pin Bowling
};

export default async function GameRoomPage({
  params,
}: {
  params: Promise<{ gameId: string }>;
}) {
  const { gameId } = await params;
  if (MOVED[gameId]) redirect(`/play/${MOVED[gameId]}`);
  if (!getGame(gameId)) notFound();
  return <GameRoom gameId={gameId} />;
}
