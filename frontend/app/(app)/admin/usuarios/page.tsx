import type { Metadata } from 'next';
import { RequirePermission } from '@/components/auth/require-permission';
import { UsersTable } from '@/components/usuarios/users-table';
import { messages } from '@/messages/es';

export const metadata: Metadata = { title: messages.admin.usuarios.title };

export default function UsuariosPage() {
  return (
    <RequirePermission permission="users.manage">
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold">{messages.admin.usuarios.title}</h1>
          <p className="text-muted-foreground">{messages.admin.usuarios.intro}</p>
        </div>
        <UsersTable />
      </div>
    </RequirePermission>
  );
}
