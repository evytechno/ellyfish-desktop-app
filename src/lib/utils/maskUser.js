/**
 * Returns the display name for a user based on the viewer's role/subRole.
 * Cross-role names are masked as "User" for tech/telecaller viewers.
 */
export function maskAssignedName(assignedUser, currentUser) {
  if (!currentUser) return assignedUser?.name ?? '';
  if (['master', 'admin', 'manager'].includes(currentUser.role)) return assignedUser?.name ?? '';
  if (currentUser.subRole === 'tech' || currentUser.subRole === 'tech_helper')
    return assignedUser?.subRole === 'telecaller' ? 'User' : (assignedUser?.name ?? '');
  if (currentUser.subRole === 'telecaller')
    return (assignedUser?.subRole === 'tech' || assignedUser?.subRole === 'tech_helper')
      ? 'User' : (assignedUser?.name ?? '');
  return assignedUser?.name ?? '';
}

/**
 * For activity/chat/file/reminder authors:
 * - admin/master/manager → always see real name
 * - user role → only see their own name; others show as "User"
 */
export function maskAuthorName(authorUser, currentUser) {
  if (!currentUser) return authorUser?.name ?? '';
  if (['master', 'admin', 'manager'].includes(currentUser.role)) return authorUser?.name ?? '';
  if (currentUser.role === 'user') {
    return authorUser?.id === currentUser.id ? (authorUser?.name ?? '') : 'User';
  }
  return authorUser?.name ?? '';
}
