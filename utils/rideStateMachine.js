const transitions = {
  active: new Set(['in_progress', 'cancelled']),
  in_progress: new Set(['payment_pending', 'cancelled']),
  payment_pending: new Set(['completed']),
  completed: new Set([]),
  cancelled: new Set([]),
};

export const canTransitionRideStatus = (currentStatus, nextStatus) => {
  if (!currentStatus || !nextStatus) return false;
  if (currentStatus === nextStatus) return true;
  const allowed = transitions[currentStatus];
  return Boolean(allowed && allowed.has(nextStatus));
};
