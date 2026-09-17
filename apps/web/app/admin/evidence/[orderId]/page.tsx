'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AdminOnly } from '../../../../components/admin-guard';
import { AppShell } from '../../../../components/app-shell';
import { Card, EmptyState, Loading, PageHeader } from '../../../../components/layout';
import { Banner } from '../../../../components/ui';
import { ApiError, authApi } from '../../../../lib/api';
import { formatDateTime } from '../../../../lib/labels';

interface EvidenceItem {
  evidenceId: string;
  type: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  uploadedBy: string;
  uploadedAt: string;
}

interface NoteItem {
  noteId?: string;
  body: string;
  createdBy: string;
  createdAt: string;
}

interface EvidenceReview {
  orderId: string;
  executionEvidences: EvidenceItem[];
  serviceNotes: NoteItem[];
  changeOrderEvidences: Array<{ changeOrderId: string; evidences: EvidenceItem[] }>;
}

/**
 * IP-018 — fecha o gap disclosed no Completion Report do IP-006: não existia
 * NENHUMA rota admin/mediador para ler Trust Evidence de execução. Esta tela
 * consome `GET /admin/marketplace/orders/:orderId/evidence` (só leitura,
 * conteúdo binário permanece no storage — aqui só metadado).
 */
function AdminEvidenceContent({ orderId }: { orderId: string }) {
  const [data, setData] = useState<EvidenceReview | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    authApi<EvidenceReview>(`/admin/marketplace/orders/${orderId}/evidence`)
      .then(setData)
      .catch((error) =>
        setMessage(error instanceof ApiError ? error.message : 'Não foi possível carregar a evidência.'),
      );
  }, [orderId]);

  if (message) {
    return <Banner kind="error">{message}</Banner>;
  }
  if (!data) {
    return <Loading label="Carregando evidências..." />;
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8">
      <PageHeader
        title="Evidência do pedido"
        subtitle={`Pedido ${data.orderId} — evidência de execução, notas de serviço e evidência de change order, para revisão de disputa.`}
        back={{ href: '/admin/disputes', label: 'Disputas' }}
      />

      <Card className="flex flex-col gap-3">
        <p className="label-bold uppercase text-on-surface-variant">
          Evidência de execução ({data.executionEvidences.length})
        </p>
        {data.executionEvidences.length === 0 ? (
          <EmptyState icon="image" title="Nenhuma evidência" description="Nenhum arquivo anexado." />
        ) : (
          data.executionEvidences.map((item) => (
            <div key={item.evidenceId} className="rounded-lg bg-surface-container-low p-4">
              <p className="body-sm font-semibold text-on-surface">
                {item.type} · {item.fileName}
              </p>
              <p className="body-sm text-on-surface-variant">
                {item.mimeType} · {(item.fileSize / 1024).toFixed(0)} KB · enviado por {item.uploadedBy} em{' '}
                {formatDateTime(item.uploadedAt)}
              </p>
            </div>
          ))
        )}
      </Card>

      <Card className="flex flex-col gap-3">
        <p className="label-bold uppercase text-on-surface-variant">
          Notas de serviço ({data.serviceNotes.length})
        </p>
        {data.serviceNotes.length === 0 ? (
          <EmptyState icon="notes" title="Nenhuma nota" description="Nenhuma nota registrada." />
        ) : (
          data.serviceNotes.map((note, index) => (
            <div key={note.noteId ?? index} className="rounded-lg bg-surface-container-low p-4">
              <p className="body-sm whitespace-pre-line text-on-surface">{note.body}</p>
              <p className="body-sm text-on-surface-variant">
                {note.createdBy} · {formatDateTime(note.createdAt)}
              </p>
            </div>
          ))
        )}
      </Card>

      {data.changeOrderEvidences.map((changeOrder) => (
        <Card key={changeOrder.changeOrderId} className="flex flex-col gap-3">
          <p className="label-bold uppercase text-on-surface-variant">
            Evidência do Change Order {changeOrder.changeOrderId} ({changeOrder.evidences.length})
          </p>
          {changeOrder.evidences.map((item) => (
            <div key={item.evidenceId} className="rounded-lg bg-surface-container-low p-4">
              <p className="body-sm font-semibold text-on-surface">
                {item.type} · {item.fileName}
              </p>
              <p className="body-sm text-on-surface-variant">
                {item.mimeType} · {(item.fileSize / 1024).toFixed(0)} KB · enviado por {item.uploadedBy} em{' '}
                {formatDateTime(item.uploadedAt)}
              </p>
            </div>
          ))}
        </Card>
      ))}
    </div>
  );
}

export default function AdminEvidencePage() {
  const params = useParams<{ orderId: string }>();
  return (
    <AppShell>
      <AdminOnly>
        <AdminEvidenceContent orderId={params.orderId} />
      </AdminOnly>
    </AppShell>
  );
}
