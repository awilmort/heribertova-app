'use client';

import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Loader2, TriangleAlert, WifiOff } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';
import { messages } from '@/messages/es';

const text = messages.home.status;

/** Shows whether the API and its database are reachable, with a retry for flaky field connections. */
export function ApiStatus() {
  const { data, isPending, isError, refetch, isFetching } = useQuery({
    queryKey: ['health'],
    queryFn: api.health,
    retry: false,
  });

  let content;
  if (isPending) {
    content = (
      <StatusLine icon={<Loader2 className="size-5 animate-spin" />} text={text.checking} />
    );
  } else if (isError) {
    content = (
      <StatusLine icon={<WifiOff className="size-5 text-destructive" />} text={text.offline} />
    );
  } else if (data.status === 'ok') {
    content = <StatusLine icon={<CheckCircle2 className="size-5 text-success" />} text={text.ok} />;
  } else {
    content = (
      <StatusLine icon={<TriangleAlert className="size-5 text-warning" />} text={text.degraded} />
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2 className="text-base">{text.title}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center justify-between gap-3">
        <div role="status" aria-live="polite">
          {content}
        </div>
        {(isError || data?.status === 'degraded') && (
          <Button variant="outline" onClick={() => void refetch()} disabled={isFetching}>
            {messages.errors.retry}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function StatusLine({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <p className="flex items-center gap-2">
      <span aria-hidden>{icon}</span>
      {text}
    </p>
  );
}
