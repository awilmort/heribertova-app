import type { Metadata } from 'next';
import { RequirePermission } from '@/components/auth/require-permission';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LeadersProgressReport } from '@/components/reportes/leaders-progress-report';
import { MembersByLocationReport } from '@/components/reportes/members-by-location-report';
import { MembersByStatusReport } from '@/components/reportes/members-by-status-report';
import { MembersMissingPhotosReport } from '@/components/reportes/members-missing-photos-report';
import { messages } from '@/messages/es';

export const metadata: Metadata = { title: messages.reportes.title };

export default function ReportesPage() {
  return (
    <RequirePermission permission="reports.view">
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold">{messages.reportes.title}</h1>
          <p className="text-muted-foreground">{messages.reportes.intro}</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{messages.reportes.byLocation.title}</CardTitle>
          </CardHeader>
          <CardContent>
            <MembersByLocationReport />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{messages.reportes.leadersProgress.title}</CardTitle>
          </CardHeader>
          <CardContent>
            <LeadersProgressReport />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{messages.reportes.missingPhotos.title}</CardTitle>
          </CardHeader>
          <CardContent>
            <MembersMissingPhotosReport />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{messages.reportes.byStatus.title}</CardTitle>
          </CardHeader>
          <CardContent>
            <MembersByStatusReport />
          </CardContent>
        </Card>
      </div>
    </RequirePermission>
  );
}
