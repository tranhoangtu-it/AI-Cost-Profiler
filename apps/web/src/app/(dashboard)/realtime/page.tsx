'use client';

import { RealtimeFeed } from '@/components/charts/realtime-feed';

export default function RealtimePage() {
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Real-time Feed</h1>
      <p className="text-sm text-text-secondary">
        Live stream of LLM cost events via Server-Sent Events.
      </p>
      <RealtimeFeed />
    </div>
  );
}
