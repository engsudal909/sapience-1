'use client';

import AdminGroupPageContent from '~/components/admin/pages/AdminGroupPageContent';

export default function AdminGroupPage({
  params,
}: {
  params: { groupId: string };
}) {
  return <AdminGroupPageContent params={params} />;
}
