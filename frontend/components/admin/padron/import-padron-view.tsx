'use client';

import {
  formatCedula,
  MAX_VOTER_FILE_BYTES,
  type VoterImportDto,
  type VoterImportReportDto,
} from '@heribertova/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api, ApiError } from '@/lib/api';
import { putWithProgress, sha256Hex } from '@/lib/uploadFile';
import { messages } from '@/messages/es';

const text = messages.admin.padron;

type Phase = 'idle' | 'hashing' | 'requesting-url' | 'uploading' | 'starting' | 'polling';

interface Uploaded {
  s3Key: string;
  sha256: string;
  cut: string;
  fileName: string;
}

function errorMessage(err: unknown): string {
  return err instanceof ApiError ? err.message : messages.errors.generic;
}

/**
 * `/admin/padron`: re-enters TOTP, then hashes the voter file (Web Crypto) in the browser, PUTs it
 * straight to the imports bucket with a progress bar, starts validation, and polls the report (plan
 * 9.1); the history list below it can apply a staged import or discard one (plan 9.2).
 */
export function ImportPadronView() {
  const codeId = useId();
  const cutId = useId();
  const fileId = useId();

  const [step, setStep] = useState<'totp' | 'form'>('totp');
  const [code, setCode] = useState('');
  const [cut, setCut] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [uploadFraction, setUploadFraction] = useState(0);
  const [uploaded, setUploaded] = useState<Uploaded | null>(null);
  const [importId, setImportId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reverify = useMutation({
    mutationFn: api.reverifyTotp,
    onSuccess: () => {
      setCode('');
      setStep('form');
      // A code that expired mid-upload (30 minutes) resumes right where it left off.
      if (uploaded || file) void start();
    },
    onError: () => setCode(''),
  });

  function submitCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (code.length === 6) reverify.mutate({ code });
  }

  async function start() {
    if (!uploaded && (!file || !cut.trim())) return;
    setError(null);
    try {
      const target = uploaded ?? (await upload());
      if (!target) return;
      setPhase('starting');
      const { id } = await api.createImport(target);
      setImportId(id);
      setPhase('polling');
    } catch (err) {
      if (err instanceof ApiError && err.code === 'TOTP_REVERIFICATION_REQUIRED') {
        setStep('totp');
        return;
      }
      setPhase('idle');
      setError(errorMessage(err));
    }
  }

  async function upload(): Promise<Uploaded | null> {
    if (!file || !cut.trim()) return null;
    if (file.size > MAX_VOTER_FILE_BYTES) {
      setError(text.form.fileTooLarge);
      return null;
    }
    setPhase('hashing');
    const sha256 = await sha256Hex(file);

    setPhase('requesting-url');
    const { uploadUrl, s3Key } = await api.requestImportUploadUrl({
      fileName: file.name,
      sha256,
      cut: cut.trim(),
    });

    setPhase('uploading');
    setUploadFraction(0);
    await putWithProgress(uploadUrl, file, 'application/json', setUploadFraction);

    const result: Uploaded = { s3Key, sha256, cut: cut.trim(), fileName: file.name };
    setUploaded(result);
    return result;
  }

  function submitUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void start();
  }

  function reset() {
    setFile(null);
    setCut('');
    setUploaded(null);
    setImportId(null);
    setPhase('idle');
    setUploadFraction(0);
    setError(null);
  }

  const importQuery = useQuery({
    queryKey: ['import', importId],
    queryFn: () => api.getImport(importId!),
    enabled: importId !== null,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'staged' || status === 'failed' ? false : 2000;
    },
  });

  if (step === 'totp') {
    return (
      <form onSubmit={submitCode} className="flex max-w-sm flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-medium">{text.totpGate.title}</h2>
          <p className="text-sm text-muted-foreground">{text.totpGate.subtitle}</p>
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor={codeId} className="text-sm font-medium">
            {text.totpGate.codeLabel}
          </label>
          <Input
            id={codeId}
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            autoFocus
            className="h-11 text-lg tracking-widest"
          />
        </div>
        <Button type="submit" disabled={code.length !== 6 || reverify.isPending}>
          {reverify.isPending && <Loader2 className="animate-spin" aria-hidden />}
          {reverify.isPending ? text.totpGate.submitting : text.totpGate.submit}
        </Button>
        {reverify.isError && (
          <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-4">
            {errorMessage(reverify.error)}
          </p>
        )}
      </form>
    );
  }

  const busy = phase !== 'idle';

  return (
    <div className="flex flex-col gap-6">
      {importId === null && (
        <form onSubmit={submitUpload} className="flex max-w-md flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label htmlFor={cutId} className="text-sm font-medium">
              {text.form.cutLabel}
            </label>
            <Input
              id={cutId}
              value={cut}
              onChange={(event) => setCut(event.target.value)}
              placeholder={text.form.cutPlaceholder}
              disabled={busy}
            />
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor={fileId} className="text-sm font-medium">
              {text.form.fileLabel}
            </label>
            <Input
              id={fileId}
              type="file"
              accept="application/json,.json"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              disabled={busy}
            />
          </div>
          <Button type="submit" disabled={busy || !file || !cut.trim()}>
            {busy && <Loader2 className="animate-spin" aria-hidden />}
            {phaseLabel(phase, uploadFraction)}
          </Button>
          {error && (
            <p
              role="alert"
              className="rounded-lg border border-destructive/40 bg-destructive/5 p-4"
            >
              {error}
            </p>
          )}
        </form>
      )}

      {importQuery.data && <ImportStatus report={importQuery.data} onReset={reset} />}

      <ImportHistoryTable />
    </div>
  );
}

function phaseLabel(phase: Phase, uploadFraction: number): string {
  switch (phase) {
    case 'hashing':
      return text.form.hashing;
    case 'requesting-url':
      return text.form.requestingUrl;
    case 'uploading':
      return text.form.uploading(Math.round(uploadFraction * 100));
    case 'starting':
    case 'polling':
      return text.form.starting;
    default:
      return text.form.submit;
  }
}

function downloadRejectedCsv(report: VoterImportReportDto): void {
  const header = 'row,cedula,reasons\n';
  const rows = report.rejected.samples
    .map(
      (row) => `${row.row},"${row.cedula ?? ''}","${row.reasons.join('; ').replace(/"/g, '""')}"`,
    )
    .join('\n');
  const url = URL.createObjectURL(new Blob([header, rows], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'rechazados.csv';
  link.click();
  URL.revokeObjectURL(url);
}

function statusLabel(status: VoterImportDto['status']): string {
  return text.status[status];
}

function ImportStatus({
  report: record,
  onReset,
}: {
  report: VoterImportDto;
  onReset: () => void;
}) {
  return (
    <div className="flex max-w-2xl flex-col gap-4 rounded-lg border p-4">
      <div className="flex items-center justify-between">
        <span className="font-medium">
          {record.fileName} · {record.cut}
        </span>
        <span className="text-sm text-muted-foreground">{statusLabel(record.status)}</span>
      </div>

      {(record.status === 'uploaded' || record.status === 'validating') && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          {text.progress(record.progress?.rowsProcessed ?? 0)}
        </p>
      )}

      {record.status === 'failed' && (
        <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-4">
          {text.failure} {record.failureReason}
        </p>
      )}

      {record.status === 'staged' && record.report && <Report report={record.report} />}

      {(record.status === 'staged' || record.status === 'failed') && (
        <ImportRowActions record={record} />
      )}

      {(record.status === 'staged' ||
        record.status === 'failed' ||
        record.status === 'applied') && (
        <Button variant="outline" onClick={onReset} className="self-start">
          {text.newImport}
        </Button>
      )}
    </div>
  );
}

/** Apply/discard for one import (plan 9.2), reused by the "just uploaded" panel above and by every
 * row of `ImportHistoryTable` below. */
function ImportRowActions({ record }: { record: VoterImportDto }) {
  const queryClient = useQueryClient();
  const t = text.history;

  function invalidate() {
    return Promise.all([
      queryClient.invalidateQueries({ queryKey: ['imports'] }),
      queryClient.invalidateQueries({ queryKey: ['import', record.id] }),
    ]);
  }

  const apply = useMutation({
    mutationFn: () => api.applyImport(record.id),
    onSuccess: async () => {
      toast.success(t.success.applied);
      await invalidate();
    },
  });
  const discard = useMutation({
    mutationFn: () => api.discardImport(record.id),
    onSuccess: async () => {
      toast.success(t.success.discarded);
      await invalidate();
    },
  });
  const mutationError = apply.error ?? discard.error;

  return (
    <div className="flex flex-col items-start gap-1">
      <div className="flex gap-2">
        {record.status === 'staged' && (
          <Button
            type="button"
            size="sm"
            disabled={apply.isPending}
            onClick={() => {
              const diff = record.report?.diff;
              const confirmed = window.confirm(
                t.confirmApply(record.cut, {
                  newVoters: diff?.newVoters.count ?? 0,
                  movedRecinto: diff?.movedRecinto.count ?? 0,
                  movedColegio: diff?.movedColegio.count ?? 0,
                  missing: diff?.missing.count ?? 0,
                }),
              );
              if (confirmed) apply.mutate();
            }}
          >
            {t.actions.apply}
          </Button>
        )}
        {(record.status === 'staged' || record.status === 'failed') && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={discard.isPending}
            onClick={() => {
              if (window.confirm(t.confirmDiscard(record.cut))) discard.mutate();
            }}
          >
            {t.actions.discard}
          </Button>
        )}
      </div>
      {mutationError && <p className="text-xs text-destructive">{errorMessage(mutationError)}</p>}
    </div>
  );
}

/** `/admin/padron`'s import history (plan 9.2): every import ever staged, newest first. */
function ImportHistoryTable() {
  const t = text.history;
  const query = useQuery({ queryKey: ['imports'], queryFn: api.listImports });

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-lg font-medium">{t.title}</h2>
      {query.isPending && <p className="text-muted-foreground">{t.loading}</p>}
      {query.isError && <p className="text-muted-foreground">{messages.errors.generic}</p>}
      {query.data && query.data.items.length === 0 && (
        <p className="text-muted-foreground">{t.empty}</p>
      )}
      {query.data && query.data.items.length > 0 && (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <Th>{t.table.cut}</Th>
                <Th>{t.table.file}</Th>
                <Th>{t.table.hash}</Th>
                <Th>{t.table.rows}</Th>
                <Th>{t.table.status}</Th>
                <Th>{t.table.uploadedBy}</Th>
                <Th>{t.table.createdAt}</Th>
                <Th>
                  <span className="sr-only">{t.table.actions}</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {query.data.items.map((record) => (
                <tr key={record.id} className="border-t align-top">
                  <td className="px-3 py-2">{record.cut}</td>
                  <td className="px-3 py-2">{record.fileName}</td>
                  <td className="px-3 py-2 font-mono text-xs">{record.sha256.slice(0, 12)}…</td>
                  <td className="px-3 py-2">
                    {record.report
                      ? `${record.report.accepted.toLocaleString('es-DO')} / ${record.report.rows.toLocaleString('es-DO')}`
                      : '—'}
                  </td>
                  <td className="px-3 py-2">{statusLabel(record.status)}</td>
                  <td className="px-3 py-2">
                    {record.uploadedByUsername
                      ? formatCedula(record.uploadedByUsername)
                      : t.cliUpload}
                  </td>
                  <td className="px-3 py-2">
                    {new Date(record.createdAt).toLocaleString('es-DO')}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <ImportRowActions record={record} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-3 py-2 font-medium">{children}</th>;
}

function Report({ report }: { report: VoterImportReportDto }) {
  const t = text.report;
  return (
    <div className="flex flex-col gap-3 text-sm">
      <h3 className="font-medium">{t.title}</h3>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
        <Stat label={t.rows} value={report.rows} />
        <Stat label={t.accepted} value={report.accepted} />
        <Stat label={t.rejected} value={report.rejected.count} />
        <Stat label={t.checkDigitWarnings} value={report.warnings.checkDigit.count} />
        <Stat label={t.recintos} value={report.totals.recintos} />
        <Stat label={t.colegios} value={report.totals.colegios} />
        <Stat label={t.sectors} value={report.totals.sectors} />
      </dl>
      <h4 className="font-medium">{t.diffTitle}</h4>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
        <Stat label={t.newVoters} value={report.diff.newVoters.count} />
        <Stat label={t.movedRecinto} value={report.diff.movedRecinto.count} />
        <Stat label={t.movedColegio} value={report.diff.movedColegio.count} />
        <Stat label={t.missing} value={report.diff.missing.count} />
        <Stat label={t.recintosAdded} value={report.diff.recintosAdded.length} />
        <Stat label={t.recintosRemoved} value={report.diff.recintosRemoved.length} />
      </dl>
      {report.rejected.count > 0 && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() => downloadRejectedCsv(report)}
        >
          {t.downloadRejected}
        </Button>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value.toLocaleString('es-DO')}</dd>
    </div>
  );
}
