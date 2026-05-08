import { REPORTER_STYLES } from './styles';

const PALETTE = ['#E53935', '#FB8C00', '#FDD835', '#43A047', '#1E88E5'];

interface Stroke {
  color: string;
  points: { x: number; y: number }[];
}

/**
 * Mounts the screenshot annotation editor in the given shadow root.
 * Resolves with the annotated screenshot as a JPEG data URL on Done,
 * or null on Cancel. Caller is responsible for re-rendering the
 * report form afterwards.
 */
export function mountEditor(shadow: ShadowRoot, dataUrl: string): Promise<string | null> {
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
              <div class="swatch ${i === 0 ? 'selected' : ''}" data-color="${c}" style="background:${c};"></div>
            `,
            ).join('')}
            <button class="undo" id="undo" disabled>Undo</button>
          </div>
        </div>
      `;
      const canvas = shadow.getElementById('cv') as HTMLCanvasElement;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(null);
        return;
      }
      const undoBtn = shadow.getElementById('undo') as HTMLButtonElement;
      let color = PALETTE[0];
      const strokes: Stroke[] = [];
      let current: Stroke | null = null;

      const redraw = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        for (const s of strokes) drawStroke(s);
        if (current) drawStroke(current);
        undoBtn.disabled = strokes.length === 0;
      };

      const drawStroke = (s: Stroke) => {
        if (s.points.length < 2) return;
        // Scale stroke width with the bitmap dimensions so the line
        // stays visible when fitted into a small viewport.
        const w = Math.max(2, canvas.width / 200);
        ctx.strokeStyle = s.color;
        ctx.lineWidth = w;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(s.points[0].x, s.points[0].y);
        for (let i = 1; i < s.points.length; i++) {
          ctx.lineTo(s.points[i].x, s.points[i].y);
        }
        ctx.stroke();
      };

      const eventToCanvas = (e: PointerEvent) => {
        const r = canvas.getBoundingClientRect();
        const sx = canvas.width / r.width;
        const sy = canvas.height / r.height;
        return { x: (e.clientX - r.left) * sx, y: (e.clientY - r.top) * sy };
      };

      canvas.addEventListener('pointerdown', (e) => {
        canvas.setPointerCapture(e.pointerId);
        current = { color, points: [eventToCanvas(e)] };
        redraw();
      });
      canvas.addEventListener('pointermove', (e) => {
        if (!current) return;
        current.points.push(eventToCanvas(e));
        redraw();
      });
      const finishStroke = () => {
        if (current) {
          strokes.push(current);
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
          color = (sw as HTMLElement).dataset.color ?? PALETTE[0];
          shadow.querySelectorAll('.swatch').forEach((s) => s.classList.remove('selected'));
          sw.classList.add('selected');
        });
      });

      undoBtn.addEventListener('click', () => {
        if (strokes.length === 0) return;
        strokes.pop();
        redraw();
      });

      shadow.getElementById('cancel')?.addEventListener('click', () => resolve(null));
      shadow.getElementById('done')?.addEventListener('click', () => {
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      });

      redraw();
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}
