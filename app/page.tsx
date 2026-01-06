'use client';

import dynamic from 'next/dynamic';
import { BrainGridProvider } from '@/context/braingrid-context';
import { ContentPanel } from '@/components/content-panel';

// Dynamically import ChatPanel to avoid SSR issues with useChat
const ChatPanel = dynamic(
  () => import('@/components/chat-panel').then((mod) => mod.ChatPanel),
  { ssr: false }
);

export default function TaskManagerPage() {
  return (
    <BrainGridProvider>
      <div className="flex h-screen bg-background text-foreground">
        <ChatPanel />
        <ContentPanel />
      </div>
    </BrainGridProvider>
  );
}
