export const roleHomePath = (role) => {
  if (role === 'rider') return '/rider';
  if (role === 'admin') return '/admin';
  return '/dashboard';
};
