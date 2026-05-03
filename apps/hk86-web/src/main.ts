/** Same integer as `HK_REACTION_BOT_PERMISSIONS` in hk-bot `reaction-role-setup-ui.ts`. */
const PERMISSIONS = "2416266304";

const defaultRepoBase = "https://github.com/OpenKOTOR/openkotor-discord-bots";

function inviteHref(appId: string): string {
  const params = new URLSearchParams({
    client_id: appId,
    permissions: PERMISSIONS,
    scope: "bot applications.commands",
  });
  return `https://discord.com/api/oauth2/authorize?${params.toString()}`;
}

const appId = (import.meta.env.VITE_DISCORD_APPLICATION_ID ?? "").trim();
const repoBase = (import.meta.env.VITE_REPO_BASE_URL ?? defaultRepoBase).replace(/\/$/, "");

document.getElementById("perm-int")!.textContent = PERMISSIONS;

const inviteLink = document.getElementById("invite-link") as HTMLAnchorElement;
const inviteMissing = document.getElementById("invite-missing");

if (appId) {
  inviteLink.href = inviteHref(appId);
  inviteLink.classList.remove("hidden");
} else {
  inviteMissing?.classList.remove("hidden");
}

const guide = `${repoBase}/blob/main/docs/guides/hk-86.md`;
const exampleJson = `${repoBase}/blob/main/apps/hk-bot/reaction-role-panels.example.json`;

(document.getElementById("guide-link") as HTMLAnchorElement).href = guide;
(document.getElementById("example-json-link") as HTMLAnchorElement).href = exampleJson;
