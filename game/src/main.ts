import { mount, restore, snapshot } from './ui';

function start(data: any) {
  mount(document.getElementById('app')!);
  if (data && data.g) restore(data);
}
const hot = (window as any).claude?.hot;
hot?.snapshot?.(() => snapshot());
if (hot?.ready) hot.ready(start); else start(hot?.data ?? {});
