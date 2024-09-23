const Templates = import(
  `https://${window.location.host}/scripts/client/templates.js`
);
const UI = import(`https://${window.location.host}/scripts/client/widgets.js`);

export async function getUI() {
  return await UI;
}
export async function getTemplates() {
  return (await Templates).getAll();
}
