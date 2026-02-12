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

// Status 徽章颜色映射
const statusVariant: Record<UserStatus, 'default' | 'secondary' | 'destructive'> = {
  ACTIVE: 'default',
  DISABLED: 'secondary',
  LOCKED: 'destructive',
};

const statusLabel: Record<UserStatus, string> = {
  ACTIVE: '正常',
  DISABLED: '已禁用',
  LOCKED: '已锁定',
};

// Role 徽章颜色
const roleVariant: Record<UserRole, 'default' | 'secondary' | 'outline'> = {
  superuser: 'destructive' as 'default',
  admin: 'default',
  staff: 'secondary',
  manager: 'secondary',
  operator: 'outline',
  viewer: 'outline',
};

const roleLabel: Record<UserRole, string> = {
  superuser: '超级管理员',
  admin: '管理员',
  staff: '员工',
  manager: '经理',
  operator: '操作员',
  viewer: '访客',
};

export const columns: ColumnDef<User>[] = [
  {
    accessorKey: 'username',
    header: '用户名',
    cell: ({ row }) => (
      <div className="font-medium">{row.getValue('username')}</div>
    ),
  },
  {
    accessorKey: 'email',
    header: '邮箱',
  },
  {
    accessorKey: 'displayName',
    header: '显示名称',
    cell: ({ row }) => row.getValue('displayName') || '-',
  },
  {
    accessorKey: 'status',
    header: '状态',
    cell: ({ row }) => {
      const status = row.getValue('status') as UserStatus;
      return (
        <Badge variant={statusVariant[status]}>
          {statusLabel[status]}
        </Badge>
      );
    },
  },
  {
    accessorKey: 'roles',
    header: '角色',
    cell: ({ row }) => {
      const roles = row.getValue('roles') as UserRole[];
      return (
        <div className="flex flex-wrap gap-1">
          {roles.map((role) => (
            <Badge key={role} variant={roleVariant[role] || 'outline'}>
              {roleLabel[role] || role}
            </Badge>
          ))}
        </div>
      );
    },
  },
  {
    accessorKey: 'lastLoginAt',
    header: '最后登录',
    cell: ({ row }) => {
      const value = row.getValue('lastLoginAt') as string | null;
      return value ? new Date(value).toLocaleString('zh-CN') : '从未登录';
    },
  },
  {
    id: 'actions',
    header: '操作',
    cell: ({ row }) => {
      const user = row.original;
      const isLocked = user.status === 'LOCKED';

      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0">
              <span className="sr-only">打开菜单</span>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem>
              <Edit className="mr-2 h-4 w-4" />
              编辑
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Key className="mr-2 h-4 w-4" />
              重置密码
            </DropdownMenuItem>
            {isLocked ? (
              <DropdownMenuItem>
                <Unlock className="mr-2 h-4 w-4" />
                解锁
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem>
                <Lock className="mr-2 h-4 w-4" />
                锁定
              </DropdownMenuItem>
            )}
            <DropdownMenuItem className="text-destructive">
              <Trash2 className="mr-2 h-4 w-4" />
              删除
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );
    },
  },
];
