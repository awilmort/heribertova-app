import type { Metadata } from 'next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { messages } from '@/messages/es';

export const metadata: Metadata = { title: messages.auth.loginTitle };

/** The cédula + password form is built in plan 3.4, once the login API exists. */
export default function LoginPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h1 className="text-xl">{messages.auth.loginTitle}</h1>
        </CardTitle>
        <CardDescription>{messages.auth.loginSubtitle}</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{messages.auth.loginComingSoon}</p>
      </CardContent>
    </Card>
  );
}
