const Templates = import(
  `${window.location.origin}/scripts/client/templates.js`
);
const UI = import(`${window.location.origin}/scripts/client/widgets.js`);

export async function getUI() {
  return await UI;
}
export async function getTemplates() {
  return (await Templates).getAll();
}
