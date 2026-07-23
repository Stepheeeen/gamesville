import { notFound } from 'next/navigation';
import { getGame } from '@/lib/game-catalog';
import GameRoom from './GameRoom';

export default async function GameRoomPage({
  params,
}: {
  params: Promise<{ gameId: string }>;
}) {
  const { gameId } = await params;
  if (!getGame(gameId)) notFound();
  return <GameRoom gameId={gameId} />;
}
