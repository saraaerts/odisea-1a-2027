import { isPeerId, newPeerId } from '../net/room.ts';

const key = 'odisea-3d-puesto';
let active: Promise<string> | undefined;

// La identidad es por pestaña: el perfil compartido en localStorage no identifica un puesto.
export function seatId(): Promise<string> {
  return active ??= (async () => {
    let stored: unknown;
    try { stored = sessionStorage.getItem(key); } catch { /* contexto sin almacenamiento */ }
    let id = isPeerId(stored) ? stored : newPeerId();
    if (navigator.locks) {
      try {
        while (!await new Promise<boolean>((resolve, reject) => {
          void navigator.locks.request('odisea-puesto:' + id, { ifAvailable: true }, (lock) => {
            resolve(!!lock);
            if (lock) return new Promise<void>(() => {});
          }).catch(reject);
        })) id = newPeerId();
      } catch { /* algunos navegadores no ofrecen bloqueo entre pestañas */ }
    }
    try { sessionStorage.setItem(key, id); } catch { /* contexto sin almacenamiento */ }
    return id;
  })();
}
