async function requireLogin() {

  const { data: { user } } = await sb.auth.getUser();

  if (!user) {
    window.location.href = "index.html";
    return null;
  }

  return user;
}
