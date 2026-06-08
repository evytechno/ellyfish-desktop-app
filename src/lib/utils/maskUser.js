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
