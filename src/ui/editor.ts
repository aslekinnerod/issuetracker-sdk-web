import { REPORTER_STYLES } from './styles';
import type { ModalFocusManager } from './focus';
import { applyBoxKey, initialBox, moveBox, type BoxRect } from './box';

const PALETTE: { color: string; name: string }[] = [
  { color: '#E53935', name: 'Red' },
  { color: '#FB8C00', name: 'Orange' },
  { color: '#FDD835', name: 'Yellow' },
  { color: '#43A047', name: 'Green' },
  { color: '#1E88E5', name: 'Blue' },
];

type Annotation =
  | { kind: 'stroke'; color: string; points: { x: number; y: number }[] }
  | { kind: 'box'; color: string; rect: BoxRect };

const BOX_LABEL =
  'Highlight box — arrow keys to move, Shift+arrows to resize, Enter to place, Escape to remove';

/**
 * Mounts the screenshot annotation editor in the given shadow root.
 * Resolves with the annotated screenshot as a JPEG data URL on Done,
 * or null on Cancel. Caller is responsible for re-rendering the
 * report form afterwards.
 */
export function mountEditor(
  shadow: ShadowRoot,
  dataUrl: string,
  focus?: ModalFocusManager,
): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      shadow.innerHTML = `
        <style>${REPORTER_STYLES}</style>
        <div class="editor">
          <div class="topbar">
            <button id="cancel">Cancel</button>
            <button id="done">Done</button>
          </div>
          <div class="canvas-wrap">
            <canvas id="cv" width="${img.naturalWidth}" height="${img.naturalHeight}"></canvas>
          </div>
          <div class="toolbar">
            ${PALETTE.map(
              (c, i) => `
              <button type="button" class="swatch" data-color="${c.color}" aria-label="${c.name}" aria-pressed="${i === 0}" style="background:${c.color};"></button>
            `,
            ).join('')}
            <button type="button" class="tool" id="addbox" aria-label="Add box">Add box</button>
            <button class="undo" id="undo" disabled>Undo</button>
          </div>
          <div class="sr-only" id="live" aria-live="polite"></div>
        </div>
      `;
      const canvas = shadow.getElementById('cv') as HTMLCanvasElement;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(null);
        return;
      }
      const wrap = shadow.querySelector('.canvas-wrap') as HTMLElement;
      const undoBtn = shadow.getElementById('undo') as HTMLButtonElement;
      const addBoxBtn = shadow.getElementById('addbox') as HTMLButtonElement;
      const live = shadow.getElementById('live') as HTMLElement;
      let color = PALETTE[0].color;
      const annotations: Annotation[] = [];
      let current: Extract<Annotation, { kind: 'stroke' }> | null = null;
      /** Uncommitted highlight box, rendered as a DOM overlay (not on the canvas). */
      let pending: { rect: BoxRect; color: string; el: HTMLDivElement } | null = null;

      const announce = (msg: string) => {
        live.textContent = msg;
      };

      const redraw = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        for (const a of annotations) drawAnnotation(a);
        if (current) drawAnnotation(current);
        undoBtn.disabled = annotations.length === 0;
      };

      // Scale stroke width with the bitmap dimensions so lines stay
      // visible when the canvas is fitted into a small viewport.
      const lineWidth = () => Math.max(3, canvas.width / 200);

      const drawAnnotation = (a: Annotation) => {
        ctx.strokeStyle = a.color;
        ctx.lineWidth = a.kind === 'stroke' ? Math.max(2, canvas.width / 200) : lineWidth();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        if (a.kind === 'box') {
          ctx.strokeRect(a.rect.x, a.rect.y, a.rect.w, a.rect.h);
          return;
        }
        if (a.points.length < 2) return;
        ctx.beginPath();
        ctx.moveTo(a.points[0].x, a.points[0].y);
        for (let i = 1; i < a.points.length; i++) {
          ctx.lineTo(a.points[i].x, a.points[i].y);
        }
        ctx.stroke();
      };

      const eventToCanvas = (e: PointerEvent) => {
        const r = canvas.getBoundingClientRect();
        const sx = canvas.width / r.width;
        const sy = canvas.height / r.height;
        return { x: (e.clientX - r.left) * sx, y: (e.clientY - r.top) * sy };
      };

      // --- Highlight box tool (ISU-38) -------------------------------
      // Keyboard-first alternative to freehand: no drag is required at
      // any point (WCAG 2.5.7 / 2.1.1). The pending box lives as a
      // focusable DOM overlay in *canvas* coordinates; only positioning
      // converts to CSS pixels, so committing draws 1:1 on the bitmap.

      /** Position the overlay div over the canvas (canvas coords → CSS px). */
      const syncOverlay = () => {
        if (!pending) return;
        const wrapR = wrap.getBoundingClientRect();
        const canR = canvas.getBoundingClientRect();
        const sx = canR.width / canvas.width;
        const sy = canR.height / canvas.height;
        const { rect } = pending;
        const s = pending.el.style;
        s.left = `${canR.left - wrapR.left + rect.x * sx}px`;
        s.top = `${canR.top - wrapR.top + rect.y * sy}px`;
        s.width = `${rect.w * sx}px`;
        s.height = `${rect.h * sy}px`;
      };
      window.addEventListener('resize', syncOverlay);
      const finish = (result: string | null) => {
        window.removeEventListener('resize', syncOverlay);
        resolve(result);
      };

      const commitPending = () => {
        if (!pending) return;
        annotations.push({ kind: 'box', color: pending.color, rect: pending.rect });
        pending.el.remove();
        pending = null;
        redraw();
        announce('Highlight box placed');
      };

      const discardPending = () => {
        if (!pending) return;
        pending.el.remove();
        pending = null;
        announce('Highlight box removed');
      };

      const createBox = () => {
        // Only one pending box at a time; adding another places the
        // current one first (same effect as pressing Enter on it).
        commitPending();
        const el = document.createElement('div');
        el.className = 'hbox';
        el.tabIndex = 0;
        el.setAttribute('role', 'img');
        el.setAttribute('aria-label', BOX_LABEL);
        el.style.borderColor = color;
        const rect = initialBox(canvas.width, canvas.height);
        pending = { rect, color, el };
        wrap.appendChild(el);
        syncOverlay();

        el.addEventListener('keydown', (e) => {
          if (!pending) return;
          if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            commitPending();
            addBoxBtn.focus();
            return;
          }
          if (e.key === 'Escape' || e.key === 'Delete' || e.key === 'Backspace') {
            // stopPropagation keeps the modal's shadow-level Escape
            // handler (which closes the editor) from also firing.
            e.preventDefault();
            e.stopPropagation();
            discardPending();
            addBoxBtn.focus();
            return;
          }
          const next = applyBoxKey(pending.rect, e.key, e.shiftKey, canvas.width, canvas.height);
          if (next) {
            e.preventDefault();
            pending.rect = next;
            syncOverlay();
          }
        });

        // Pointer users can also drag the box; keyboard remains the
        // canonical path — every operation works without a pointer.
        let drag: { x: number; y: number; orig: BoxRect } | null = null;
        el.addEventListener('pointerdown', (e) => {
          if (!pending) return;
          el.setPointerCapture(e.pointerId);
          drag = { x: e.clientX, y: e.clientY, orig: pending.rect };
          el.focus();
        });
        el.addEventListener('pointermove', (e) => {
          if (!drag || !pending) return;
          const canR = canvas.getBoundingClientRect();
          const sx = canvas.width / canR.width;
          const sy = canvas.height / canR.height;
          pending.rect = moveBox(
            drag.orig,
            (e.clientX - drag.x) * sx,
            (e.clientY - drag.y) * sy,
            canvas.width,
            canvas.height,
          );
          syncOverlay();
        });
        const endDrag = () => {
          drag = null;
        };
        el.addEventListener('pointerup', endDrag);
        el.addEventListener('pointercancel', endDrag);

        el.focus();
        announce('Highlight box added');
      };

      addBoxBtn.addEventListener('click', createBox);

      // --- Freehand drawing ------------------------------------------
      // Freehand is pointer/drag-based by nature; it stays as an
      // enhancement because the "Add box" tool above provides a fully
      // keyboard-operable, no-drag alternative for highlighting a
      // region (WCAG 2.5.7 dragging-movements / 2.1.1 keyboard).
      canvas.addEventListener('pointerdown', (e) => {
        canvas.setPointerCapture(e.pointerId);
        current = { kind: 'stroke', color, points: [eventToCanvas(e)] };
        redraw();
      });
      canvas.addEventListener('pointermove', (e) => {
        if (!current) return;
        current.points.push(eventToCanvas(e));
        redraw();
      });
      const finishStroke = () => {
        if (current) {
          annotations.push(current);
          current = null;
          redraw();
        }
      };
      canvas.addEventListener('pointerup', finishStroke);
      canvas.addEventListener('pointercancel', () => {
        current = null;
        redraw();
      });

      shadow.querySelectorAll('.swatch').forEach((sw) => {
        sw.addEventListener('click', () => {
          color = (sw as HTMLElement).dataset.color ?? PALETTE[0].color;
          shadow
            .querySelectorAll('.swatch')
            .forEach((s) => s.setAttribute('aria-pressed', String(s === sw)));
          // A color change re-tints the pending box live.
          if (pending) {
            pending.color = color;
            pending.el.style.borderColor = color;
          }
        });
      });

      undoBtn.addEventListener('click', () => {
        if (annotations.length === 0) return;
        annotations.pop();
        redraw();
      });

      shadow.getElementById('cancel')?.addEventListener('click', () => finish(null));
      shadow.getElementById('done')?.addEventListener('click', () => {
        // A still-pending box is visible to the user — treat Done as an
        // implicit commit rather than silently dropping it.
        commitPending();
        finish(canvas.toDataURL('image/jpeg', 0.85));
      });
      // Escape backs out of the editor without discarding the report
      // draft — the caller re-renders the form, which re-points the
      // escape handler at the form's own close path. (A focused pending
      // box consumes Escape itself, see the box keydown handler.)
      focus?.setEscapeHandler(() => finish(null));

      redraw();
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}
