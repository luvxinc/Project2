'use client';

import { ColumnDef } from '@tanstack/react-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreHorizontal, Lock, Unlock, Key, Trash2, Edit } from 'lucide-react';
import { User, UserStatus, UserRole } from '@/lib/api';

// Status badge color mapping
const statusVariant: Record<UserStatus, 'default' | 'secondary' | 'destructive'> = {
  ACTIVE: 'default',
  DISABLED: 'secondary',
  LOCKED: 'destructive',
};

// Status i18n key mapping
const statusKey: Record<UserStatus, string> = {
  ACTIVE: 'active',
  DISABLED: 'disabled',
  LOCKED: 'locked',
};

// Role badge color
const roleVariant: Record<UserRole, 'default' | 'secondary' | 'outline'> = {
  superuser: 'destructive' as 'default',
  admin: 'default',
  staff: 'secondary',
  manager: 'secondary',
  operator: 'outline',
  viewer: 'outline',
};

export function getUserColumns(t: (key: string) => string): ColumnDef<User>[] {
  return [
    {
      accessorKey: 'username',
      header: t('list.columns.username'),
      cell: ({ row }) => (
        <div className="font-medium">{row.getValue('username')}</div>
      ),
    },
    {
      accessorKey: 'email',
      header: t('list.columns.email'),
    },
    {
      accessorKey: 'displayName',
      header: t('list.columns.displayName'),
      cell: ({ row }) => row.getValue('displayName') || '-',
    },
    {
      accessorKey: 'status',
      header: t('list.columns.status'),
      cell: ({ row }) => {
        const status = row.getValue('status') as UserStatus;
        return (
          <Badge variant={statusVariant[status]}>
            {t(`status.${statusKey[status]}`)}
          </Badge>
        );
      },
    },
    {
      accessorKey: 'roles',
      header: t('list.columns.roles'),
      cell: ({ row }) => {
        const roles = row.getValue('roles') as UserRole[];
        return (
          <div className="flex flex-wrap gap-1">
            {roles.map((role) => (
              <Badge key={role} variant={roleVariant[role] || 'outline'}>
                {t(`roleNames.${role}`)}
              </Badge>
            ))}
          </div>
        );
      },
    },
    {
      accessorKey: 'lastLoginAt',
      header: t('list.columns.lastLogin'),
      cell: ({ row }) => {
        const value = row.getValue('lastLoginAt') as string | null;
        return value
          ? new Date(value).toLocaleString(undefined, { timeZone: 'America/Los_Angeles' })
          : t('list.neverLogin');
      },
    },
    {
      id: 'actions',
      header: t('list.columns.actions'),
      cell: ({ row }) => {
        const user = row.original;
        const isLocked = user.status === 'LOCKED';

        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 p-0">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem>
                <Edit className="mr-2 h-4 w-4" />
                {t('actions.update')}
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Key className="mr-2 h-4 w-4" />
                {t('actions.resetPassword')}
              </DropdownMenuItem>
              {isLocked ? (
                <DropdownMenuItem>
                  <Unlock className="mr-2 h-4 w-4" />
                  {t('actions.unlock')}
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem>
                  <Lock className="mr-2 h-4 w-4" />
                  {t('actions.lock')}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem className="text-destructive">
                <Trash2 className="mr-2 h-4 w-4" />
                {t('actions.delete')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];
}
