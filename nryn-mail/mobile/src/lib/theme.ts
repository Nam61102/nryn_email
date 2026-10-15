export const colors = {
  primary: '#FF5500',
  primaryDark: '#E04B00',
  primaryLight: '#FF7324',
  primaryTint: '#FFF7ED',
  primaryBorder: '#FFEDD5',

  bg: '#F8F9FA',
  surface: '#FFFFFF',
  surfaceAlt: '#F9FAFB',
  border: '#E5E7EB',
  borderSoft: '#F3F4F6',

  text: '#111827',
  textStrong: '#1F2937',
  textBody: '#374151',
  textMuted: '#6B7280',
  textFaint: '#9CA3AF',

  urgent: '#EF4444',
  urgentText: '#DC2626',
  urgentTint: '#FEE2E2',
  urgentAvatar: '#FEE2E2',

  action: '#F59E0B',
  actionText: '#D97706',
  actionTint: '#FEF3C7',
  actionBorder: '#FDE68A',
  actionAvatar: '#FEF3C7',

  fyi: '#4B5563',
  fyiTint: '#F3F4F6',

  success: '#10B981',
  successTint: '#D1FAE5',

  chip: '#F3F4F6',
  white: '#FFFFFF',
} as const;

export const radius = { sm: 8, md: 12, lg: 16, xl: 20, pill: 999 } as const;

export const priorityMeta = {
  urgent: { label: 'URGENT', bg: '#FEE2E2', fg: '#EF4444' },
  action_required: { label: 'ACTION REQ', bg: '#FEF3C7', fg: '#D97706' },
  fyi: { label: 'FYI', bg: '#F3F4F6', fg: '#4B5563' },
  ignore: { label: 'FILTERED', bg: '#F3F4F6', fg: '#9CA3AF' },
} as const;

export type PriorityKey = keyof typeof priorityMeta;
